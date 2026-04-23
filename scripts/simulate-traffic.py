#!/usr/bin/env python3
"""
LLM Gateway Traffic Simulator
=============================
Sends low-cost simulated traffic to the gateway so demo dashboards look populated.
Designed to run as a Cloud Run Job triggered hourly by Cloud Scheduler.

Each invocation spreads RATE_PER_HOUR requests over DURATION_MIN minutes, then exits.
Mixes free OpenCode models (~30%), cheap Gemini Flash Lite (~30%), and a small slice
of premium models (Claude 4.7, Grok, Gemini Pro) for variety. Hard cap on per-invocation
effective tokens prevents runaway cost.

Configure via env vars (all overridable on Cloud Run Job edit, no rebuild needed):
  APIGEE_HOST            (required) gateway hostname, e.g. YOUR_LB_IP.nip.io
  API_KEY                (required) gateway API key
  RATE_PER_HOUR          default 60
  DURATION_MIN           default 50  (leave 5-10 min buffer before next scheduler tick)
  CACHE_HIT_TARGET       default 0.5
  MAX_EFFECTIVE_TOKENS   default 300000  hard cap per invocation (~$2-3 worst case)
  STREAM_RATIO           default 0.10
  BAD_KEY_RATIO          default 0.03
  DRY_RUN                default false  log only, no real requests
  PROMPTS_FILE           default ./prompts.json
"""

import json
import os
import random
import sys
import time
from dataclasses import dataclass

import requests

# ── Config ───────────────────────────────────────────────────────────────────

APIGEE_HOST          = os.environ.get("APIGEE_HOST", "")
API_KEY              = os.environ.get("API_KEY", "")
RATE_PER_HOUR        = int(os.environ.get("RATE_PER_HOUR", "60"))
DURATION_MIN         = int(os.environ.get("DURATION_MIN", "50"))
CACHE_HIT_TARGET     = float(os.environ.get("CACHE_HIT_TARGET", "0.5"))
MAX_EFFECTIVE_TOKENS = int(os.environ.get("MAX_EFFECTIVE_TOKENS", "300000"))
STREAM_RATIO         = float(os.environ.get("STREAM_RATIO", "0.10"))
BAD_KEY_RATIO        = float(os.environ.get("BAD_KEY_RATIO", "0.03"))
DRY_RUN              = os.environ.get("DRY_RUN", "false").lower() == "true"
PROMPTS_FILE         = os.environ.get("PROMPTS_FILE", os.path.join(os.path.dirname(__file__), "prompts.json"))
REQUEST_TIMEOUT_SEC  = int(os.environ.get("REQUEST_TIMEOUT_SEC", "60"))

if not APIGEE_HOST:
    sys.exit("ERROR: APIGEE_HOST env var required")
if not API_KEY and not DRY_RUN:
    sys.exit("ERROR: API_KEY env var required (or set DRY_RUN=true)")

BASE_URL = f"https://{APIGEE_HOST}/v1/chat/completions"

# ── Model pool ───────────────────────────────────────────────────────────────
# (model_id, weight_percent, est_token_weight, max_tokens)
# token_weight matches /api/weights/generate PRICING (baseline: gemini-2.5-flash-lite = 1.0).
# Cost cap uses (output_tokens × token_weight) as the "effective tokens" estimate.

OPENCODE_MODELS = [
    "opencode/big-pickle",
    "opencode/nemotron-3-super-free",
    "opencode/minimax-m2.5-free",
    "opencode/hy3-preview-free",
    "opencode/ling-2.6-flash-free",
    "opencode/gpt-5-nano",
]

@dataclass
class ModelEntry:
    name:       str
    weight_pct: float    # selection probability percent
    cost_w:    float     # token cost weight (0 = free)
    max_tokens: int

MODEL_POOL = [
    # Free OpenCode (rotate among 6) — 30% combined, $0
    *(ModelEntry(m, 30 / len(OPENCODE_MODELS), 0.0, 100) for m in OPENCODE_MODELS),
    # Cheap baseline
    ModelEntry("gemini-2.5-flash-lite", 30, 1.0,  100),
    # Mid-tier thinking
    ModelEntry("gemini-2.5-flash",      15, 8.75, 400),
    # MaaS variety
    ModelEntry("glm-4.7",                6, 4.0,  100),
    ModelEntry("kimi-k2-thinking",       4, 6.25, 300),
    # Premium (rare, capped tokens)
    ModelEntry("gemini-2.5-pro",         5, 37.5, 600),
    ModelEntry("grok-4.20-reasoning",    5, 30.0, 600),
    ModelEntry("claude-opus-4-7",        5, 187.5, 200),
]

# Normalize weights (sum should be 100 but be defensive)
_total_w = sum(m.weight_pct for m in MODEL_POOL)
for m in MODEL_POOL:
    m.weight_pct = m.weight_pct / _total_w * 100

# ── Prompt loading ───────────────────────────────────────────────────────────

with open(PROMPTS_FILE) as f:
    PROMPTS = json.load(f)

POPULAR        = PROMPTS["popular"]
TOPIC_TEMPLATES= PROMPTS["topics_for_unique"]
TOPIC_POOL     = PROMPTS["topics_pool"]


def pick_prompt() -> tuple[str, bool]:
    """Returns (prompt, is_unique). is_unique=False means cache HIT expected."""
    if random.random() < CACHE_HIT_TARGET:
        return random.choice(POPULAR), False
    # Build unique prompt that won't match cache (timestamp + random topic)
    template = random.choice(TOPIC_TEMPLATES)
    topic    = random.choice(TOPIC_POOL)
    suffix   = f" [probe-{int(time.time()*1000)}-{random.randint(1000,9999)}]"
    return f"{template} {topic}.{suffix}", True


def pick_model() -> ModelEntry:
    rnd = random.random() * 100
    cum = 0.0
    for m in MODEL_POOL:
        cum += m.weight_pct
        if rnd <= cum:
            return m
    return MODEL_POOL[-1]


# ── ANSI colors ──────────────────────────────────────────────────────────────

GREEN = "\033[32m"; RED = "\033[31m"; YELLOW = "\033[33m"
CYAN  = "\033[36m"; DIM = "\033[2m"; RESET = "\033[0m"

def color(c, s): return f"{c}{s}{RESET}"


# ── Single request ───────────────────────────────────────────────────────────

@dataclass
class Stat:
    sent:        int   = 0
    ok:          int   = 0
    err:         int   = 0
    cache_hit:   int   = 0
    cache_miss:  int   = 0
    streamed:    int   = 0
    bad_key_sent:int   = 0
    eff_tokens:  float = 0.0


def fire_one(stat: Stat) -> bool:
    """Send one request. Returns True if budget still has room."""
    model      = pick_model()
    prompt, is_unique = pick_prompt()
    use_stream = random.random() < STREAM_RATIO
    use_bad_key= random.random() < BAD_KEY_RATIO
    key        = "intentionally-bad-key-for-demo" if use_bad_key else API_KEY

    body = {
        "model":      model.name,
        "messages":   [{"role": "user", "content": prompt}],
        "max_tokens": model.max_tokens,
    }
    if use_stream:
        body["stream"] = True

    headers = {
        "Content-Type": "application/json",
        "x-api-key": key,
        # Apigee X rejects "br" in Accept-Encoding (returns 415).
        # Override the requests-default "gzip, deflate, br" with a safer value.
        "Accept-Encoding": "gzip, deflate",
    }

    if DRY_RUN:
        line = f"{DIM}DRY{RESET}  {model.name:<28}  {'unique' if is_unique else 'popular'}  stream={use_stream}  bad_key={use_bad_key}"
        print(line, flush=True)
        stat.sent += 1
        # Simulate cost estimate even in dry-run
        stat.eff_tokens += model.max_tokens * 0.5 * model.cost_w
        return stat.eff_tokens < MAX_EFFECTIVE_TOKENS

    t0 = time.time()
    try:
        # Stream requests don't need full body parse — just connect and read first chunk
        if use_stream:
            with requests.post(BASE_URL, json=body, headers=headers, timeout=REQUEST_TIMEOUT_SEC, stream=True) as r:
                code = r.status_code
                # Read up to 4KB to confirm server actually streamed
                _ = next(r.iter_content(chunk_size=4096), b"")
                cache_hdr = r.headers.get("x-cache", "")
                body_text = ""
        else:
            r = requests.post(BASE_URL, json=body, headers=headers, timeout=REQUEST_TIMEOUT_SEC)
            code      = r.status_code
            cache_hdr = r.headers.get("x-cache", "")
            body_text = r.text
    except requests.RequestException as e:
        elapsed = (time.time() - t0) * 1000
        print(color(RED, f"FAIL  ---  {model.name:<28}  {elapsed:>5.0f}ms  exception: {str(e)[:60]}"), flush=True)
        stat.sent += 1; stat.err += 1
        return True

    elapsed = (time.time() - t0) * 1000
    stat.sent += 1
    if use_bad_key:
        stat.bad_key_sent += 1

    # Parse usage if available (skip for stream)
    out_tokens = 0
    if not use_stream and code < 400:
        try:
            j = json.loads(body_text)
            out_tokens = int(j.get("usage", {}).get("completion_tokens", 0) or 0)
        except (ValueError, KeyError):
            pass

    # Cost accounting:
    # - 4xx/5xx: no real LLM call happened, eff = 0
    # - streaming success: usage not parsed, estimate from max_tokens
    # - non-stream success: use actual completion_tokens
    if code >= 400:
        eff = 0.0
    elif use_stream:
        eff = model.max_tokens * 0.5 * model.cost_w
    else:
        eff = (out_tokens or model.max_tokens * 0.3) * model.cost_w
    stat.eff_tokens += eff

    # Status accounting
    if code == 200:
        stat.ok += 1
    else:
        stat.err += 1
    if cache_hdr.upper() == "HIT":
        stat.cache_hit += 1
    elif cache_hdr.upper() == "MISS":
        stat.cache_miss += 1
    if use_stream:
        stat.streamed += 1

    # Pretty-print
    code_color = GREEN if code == 200 else (YELLOW if 400 <= code < 500 else RED)
    cache_str = ""
    if cache_hdr:
        cache_str = color(GREEN if cache_hdr.upper() == "HIT" else DIM, f"cache={cache_hdr}")
    elif use_stream:
        cache_str = color(DIM, "stream")
    extras = []
    if use_bad_key: extras.append(color(YELLOW, "bad-key"))
    if use_stream:  extras.append(color(CYAN, "SSE"))
    extras_str = " ".join(extras)

    print(
        f"{color(code_color, f'{code:>3}')} "
        f"{model.name:<28} "
        f"{elapsed:>5.0f}ms  "
        f"out={out_tokens:>4}  eff={eff:>6.0f}  "
        f"{cache_str:<24}  {extras_str}",
        flush=True,
    )

    return stat.eff_tokens < MAX_EFFECTIVE_TOKENS


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    print(color(CYAN, "═══════════════════════════════════════════════════════════════"))
    print(color(CYAN, "  LLM Gateway Traffic Simulator"))
    print(color(CYAN, "═══════════════════════════════════════════════════════════════"))
    print(f"  endpoint   : {BASE_URL}")
    print(f"  rate/hour  : {RATE_PER_HOUR}    duration: {DURATION_MIN}min")
    print(f"  cache_hit  : {CACHE_HIT_TARGET:.0%}    stream: {STREAM_RATIO:.0%}    bad_key: {BAD_KEY_RATIO:.0%}")
    print(f"  cap        : {MAX_EFFECTIVE_TOKENS:,} effective tokens")
    print(f"  dry_run    : {DRY_RUN}")
    print(color(CYAN, "───────────────────────────────────────────────────────────────"))

    # Compute schedule: RATE_PER_HOUR requests evenly spread over DURATION_MIN with ±25% jitter
    n_reqs = max(1, RATE_PER_HOUR * DURATION_MIN // 60)
    base_interval = (DURATION_MIN * 60) / n_reqs
    schedule = []
    t_cursor = 0.0
    for _ in range(n_reqs):
        jitter = random.uniform(0.75, 1.25)
        schedule.append(t_cursor)
        t_cursor += base_interval * jitter

    start_wall = time.time()
    stat = Stat()
    print(f"  scheduled  : {len(schedule)} requests over ~{int(t_cursor/60)} min")
    print(color(CYAN, "───────────────────────────────────────────────────────────────"))

    for i, sched_offset in enumerate(schedule, 1):
        # Sleep until scheduled time (relative to start)
        target = start_wall + sched_offset
        now    = time.time()
        if target > now:
            time.sleep(target - now)
        if not fire_one(stat):
            print(color(YELLOW, f"\n[{i}/{len(schedule)}] BUDGET CAP HIT — exiting early "
                                f"(eff_tokens={stat.eff_tokens:,.0f} ≥ {MAX_EFFECTIVE_TOKENS:,})"))
            break

    # Summary
    elapsed_min = (time.time() - start_wall) / 60
    cache_total = stat.cache_hit + stat.cache_miss
    hit_rate    = stat.cache_hit / cache_total if cache_total else 0.0
    # Rough cost estimate — eff_tokens × 1.0 baseline price
    # baseline: gemini-2.5-flash-lite = $0.40 per 1M output tokens, weight = 1.0
    est_cost_usd = stat.eff_tokens * 0.40 / 1_000_000

    print(color(CYAN, "═══════════════════════════════════════════════════════════════"))
    print(color(CYAN, "  Summary"))
    print(color(CYAN, "───────────────────────────────────────────────────────────────"))
    print(f"  duration       : {elapsed_min:.1f} min")
    print(f"  sent           : {stat.sent}")
    print(f"  ok / err       : {stat.ok} / {stat.err}")
    print(f"  cache hit rate : {hit_rate:.1%}  ({stat.cache_hit} HIT, {stat.cache_miss} MISS)")
    print(f"  streamed       : {stat.streamed}")
    print(f"  bad-key sends  : {stat.bad_key_sent}")
    print(f"  effective tokens: {stat.eff_tokens:,.0f}")
    print(f"  est cost (USD) : ${est_cost_usd:.4f}  (this invocation only)")
    print(color(CYAN, "═══════════════════════════════════════════════════════════════"))


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print(color(YELLOW, "\n[interrupted]"))
        sys.exit(130)
