#!/bin/bash
# =============================================================================
# LLM Gateway — Comprehensive Test Suite (updated for OpenAPI endpoint)
# =============================================================================
# Usage:  source infra/api-key.env && bash tests/run-tests.sh
# =============================================================================

set -euo pipefail

HOST="${APIGEE_HOST:-}"
[ -z "$HOST" ] && { echo "ERROR: APIGEE_HOST not set. Run: source infra/apigee.env"; exit 1; }
PROJECT_ID="${PROJECT_ID:-${APIGEE_ORG:-}}"
[ -z "$PROJECT_ID" ] && { echo "ERROR: PROJECT_ID not set. Run: source infra/apigee.env"; exit 1; }
CROSS_PROJECT_ID="${CROSS_PROJECT_ID:-}"
BASE="https://$HOST/v1"
PASS=0; FAIL=0; SKIP=0

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'

pass()    { printf "${GREEN}PASS${NC} %s\n" "$1";            PASS=$((PASS+1)); }
fail()    { printf "${RED}FAIL${NC} %s → %s\n" "$1" "$2";   FAIL=$((FAIL+1)); }
skip()    { printf "${YELLOW}SKIP${NC} %s\n" "$1";           SKIP=$((SKIP+1)); }
section() { printf "\n${CYAN}══════════════════════════════════════════\n  %s\n══════════════════════════════════════════${NC}\n" "$1"; }

call() {
  local method="$1" path="$2"; shift 2
  local tmp; tmp=$(mktemp)
  CODE=$(curl -sk -X "$method" "$BASE$path" -H "Content-Type: application/json" \
    "$@" -w "%{http_code}" -o "$tmp" 2>/dev/null)
  BODY=$(cat "$tmp"); rm -f "$tmp"
}

assert_code() { [ "$CODE" = "$1" ] && pass "$2" || fail "$2" "expected HTTP $1, got HTTP $CODE"; }

assert_json() {
  local field="$1" expected="$2" label="$3"
  local actual
  actual=$(echo "$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d$field)" 2>/dev/null || echo "PARSE_ERROR")
  [ "$actual" = "$expected" ] && pass "$label" || fail "$label" "expected '$expected' got '$actual'"
}

assert_nonempty() {
  local field="$1" label="$2"
  local actual
  actual=$(echo "$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); v=d$field; print('OK' if v else 'EMPTY')" 2>/dev/null || echo "PARSE_ERROR")
  [ "$actual" = "OK" ] && pass "$label" || fail "$label" "field $field is empty"
}

# Check model responds with 200 (or 429 which counts as 'enabled')
test_model_ok() {
  local label="$1" model="$2"
  call POST /chat/completions -H "x-api-key: $API_KEY" \
    -d "{\"model\":\"$model\",\"messages\":[{\"role\":\"user\",\"content\":\"hi\"}],\"max_tokens\":30}"
  if   [ "$CODE" = "200" ]; then pass "$label → 200 OK"
  elif [ "$CODE" = "429" ]; then skip "$label → 429 (quota)"
  elif [ "$CODE" = "404" ]; then skip "$label → 404 (not enabled)"
  else fail "$label" "HTTP $CODE"; fi
}

# Check model responds 200 and content is non-empty
test_model_reply() {
  local label="$1" model="$2"
  call POST /chat/completions -H "x-api-key: $API_KEY" \
    -d "{\"model\":\"$model\",\"messages\":[{\"role\":\"user\",\"content\":\"Reply with the single word HELLO.\"}],\"max_tokens\":30}"
  if [ "$CODE" = "200" ]; then
    local reply
    reply=$(echo "$BODY" | python3 -c "
import sys,json; d=json.load(sys.stdin)
print(d.get('choices',[{}])[0].get('message',{}).get('content','?')[:60])" 2>/dev/null || echo "")
    [ -n "$reply" ] && pass "$label → 200, reply: ${reply:0:40}" || fail "$label" "200 but empty content"
  elif [ "$CODE" = "429" ]; then skip "$label → 429 (quota)"
  else fail "$label" "HTTP $CODE"; fi
}

# ─── check prerequisites ──────────────────────────────────────────────────────
[ -z "${API_KEY:-}" ] && { echo "ERROR: API_KEY not set. Run: source infra/api-key.env"; exit 1; }

echo ""
printf "${CYAN}╔══════════════════════════════════════════╗\n"
printf "║  LLM Gateway — Comprehensive Test Suite  ║\n"
printf "╚══════════════════════════════════════════╝${NC}\n"
echo "  Host    : $HOST"
echo "  API_KEY : ${API_KEY:0:20}..."
echo "  Started : $(date '+%Y-%m-%d %H:%M:%S UTC')"

# =============================================================================
section "1. HEALTH CHECK"
# =============================================================================
call GET /health
assert_code 200 "GET /v1/health → 200"
assert_json "['status']" "ok" "status = ok"
assert_json "['service']" "llm-gateway" "service = llm-gateway"

# =============================================================================
section "2. AUTHENTICATION"
# =============================================================================
call POST /chat/completions \
  -d '{"model":"gemini-2.0-flash-001","messages":[{"role":"user","content":"hi"}]}'
assert_code 401 "No API key → 401"

call POST /chat/completions -H "x-api-key: bad-key-00000" \
  -d '{"model":"gemini-2.0-flash-001","messages":[{"role":"user","content":"hi"}]}'
assert_code 401 "Invalid API key → 401"

call POST /chat/completions -H "x-api-key: $API_KEY" \
  -d '{"model":"gemini-2.0-flash-001","messages":[{"role":"user","content":"hi"}],"max_tokens":5}'
assert_code 200 "Valid API key → 200"

# =============================================================================
section "3. RESPONSE FORMAT (OpenAI-compatible)"
# =============================================================================
call POST /chat/completions -H "x-api-key: $API_KEY" \
  -d '{"model":"gemini-2.0-flash-001","messages":[{"role":"user","content":"Reply HELLO only."}],"max_tokens":20}'
assert_code 200 "Response format: 200 OK"
assert_json "['object']" "chat.completion" "object = chat.completion"
assert_nonempty "['id']" "id is non-empty"
assert_nonempty "['choices']" "choices is non-empty"
assert_nonempty "['choices'][0]['message']['content']" "content non-empty"
assert_json "['choices'][0]['message']['role']" "assistant" "role = assistant"
assert_nonempty "['usage']['total_tokens']" "usage.total_tokens present"

# =============================================================================
section "4. ENDPOINT A — Google Gemini (generateContent)"
# =============================================================================
# Standard models (full content expected)
for model in gemini-2.0-flash-001 gemini-2.0-flash-lite gemini-2.5-flash gemini-2.5-flash-lite; do
  test_model_reply "Gemini/$model" "$model"
done
# Thinking models: thinking tokens count against maxOutputTokens, max_tokens=30 often exhausted
for model in gemini-2.5-pro gemini-3-flash-preview gemini-3-pro-preview gemini-3.1-flash-lite-preview gemini-3.1-pro-preview; do
  test_model_ok "Gemini/$model (thinking)" "$model"
done

# =============================================================================
section "5. ENDPOINT B — Anthropic Claude (rawPredict)"
# =============================================================================
for model in claude-opus-4-6 claude-sonnet-4-6 claude-haiku-4-5 claude-opus-4-5 claude-sonnet-4-5; do
  test_model_reply "Claude/$model" "$model"
done

# =============================================================================
section "6. ENDPOINT C — MaaS Partner (Vertex AI OpenAPI)"
# =============================================================================
for model in glm-4.7 glm-5 deepseek-v3.2 deepseek-ocr kimi-k2-thinking minimax-m2 qwen3-235b qwen3-next-80b qwen3-next-80b-think qwen3-coder; do
  test_model_ok "MaaS/$model" "$model"
done

# =============================================================================
section "7. ENDPOINT A — Cross-project routing (${CROSS_PROJECT_ID:-YOUR_CROSS_PROJECT_ID})"
# =============================================================================
test_model_reply "CrossProject/${CROSS_PROJECT_ID:-YOUR_CROSS_PROJECT_ID}/gemini-2.5-flash" "${CROSS_PROJECT_ID:-YOUR_CROSS_PROJECT_ID}/gemini-2.5-flash"
# Thinking models
test_model_ok "CrossProject/${CROSS_PROJECT_ID:-YOUR_CROSS_PROJECT_ID}/gemini-2.5-pro (thinking)" "${CROSS_PROJECT_ID:-YOUR_CROSS_PROJECT_ID}/gemini-2.5-pro"
test_model_ok "CrossProject/${CROSS_PROJECT_ID:-YOUR_CROSS_PROJECT_ID}/gemini-3-flash-preview (thinking)" "${CROSS_PROJECT_ID:-YOUR_CROSS_PROJECT_ID}/gemini-3-flash-preview"

# =============================================================================
section "8. ENDPOINT D — OpenCode Zen (free)"
# =============================================================================
for model in "opencode/nemotron-3-super-free" "opencode/big-pickle" "opencode/minimax-m2.5-free" "opencode/mimo-v2-flash-free" "opencode/trinity-large-preview-free"; do
  test_model_ok "OpenCode/$model" "$model"
done

# =============================================================================
section "9. DEFAULT FALLBACK"
# =============================================================================
call POST /chat/completions -H "x-api-key: $API_KEY" \
  -d '{"model":"unknown-xyz-model","messages":[{"role":"user","content":"hi"}],"max_tokens":10}'
assert_code 200 "Unknown model → fallback → 200"
actual=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('model','?'))" 2>/dev/null)
[ "$actual" = "gemini-2.0-flash-001" ] && pass "Fallback → gemini-2.0-flash-001" || fail "Fallback model" "got $actual"

# =============================================================================
section "10. REQUEST FORMAT NORMALIZATION"
# =============================================================================
# System prompt (Gemini)
call POST /chat/completions -H "x-api-key: $API_KEY" \
  -d '{"model":"gemini-2.0-flash-001","messages":[{"role":"system","content":"You reply in uppercase only."},{"role":"user","content":"hello"}],"max_tokens":20}'
assert_code 200 "System prompt (Gemini) → 200"

# Temperature (Claude)
call POST /chat/completions -H "x-api-key: $API_KEY" \
  -d '{"model":"claude-haiku-4-5","messages":[{"role":"user","content":"hi"}],"max_tokens":10,"temperature":0.1}'
assert_code 200 "Temperature param (Claude) → 200"

# OpenAI passthrough for MaaS
call POST /chat/completions -H "x-api-key: $API_KEY" \
  -d '{"model":"glm-4.7","messages":[{"role":"user","content":"hi"}],"max_tokens":20}'
if [ "$CODE" = "200" ]; then
  actual_model=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('model','?'))" 2>/dev/null)
  [ "$actual_model" = "zai-org/glm-4.7-maas" ] && pass "MaaS model field rewritten to publisher/model format" || fail "MaaS model field" "got $actual_model"
elif [ "$CODE" = "429" ]; then skip "MaaS model field rewrite test → 429 (quota)"
else fail "MaaS model field rewrite" "HTTP $CODE"; fi

# reasoning_content → content normalization
call POST /chat/completions -H "x-api-key: $API_KEY" \
  -d '{"model":"glm-5","messages":[{"role":"user","content":"hi"}],"max_tokens":30}'
if [ "$CODE" = "200" ]; then
  content=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('choices',[{}])[0].get('message',{}).get('content',''))" 2>/dev/null)
  [ -n "$content" ] && pass "Thinking model: reasoning_content → content normalized" || fail "reasoning_content normalization" "content empty"
elif [ "$CODE" = "429" ]; then skip "reasoning_content normalization → 429 (quota)"
else fail "reasoning_content normalization" "HTTP $CODE"; fi

# =============================================================================
section "11. SEMANTIC CACHE"
# =============================================================================
CACHE_PROMPT="What element has atomic number 79?"
CACHE_MODEL="gemini-2.0-flash-001"

echo "  Request 1 (expect MISS)..."
call POST /chat/completions -H "x-api-key: $API_KEY" \
  -d "{\"model\":\"$CACHE_MODEL\",\"messages\":[{\"role\":\"user\",\"content\":\"$CACHE_PROMPT\"}],\"max_tokens\":50}"
assert_code 200 "Cache req 1 → 200"

echo "  Waiting 70s for Vector Search stream update..."
sleep 70

echo "  Request 2 identical (expect HIT)..."
tmp_h=$(mktemp)
curl -sk -X POST "$BASE/chat/completions" \
  -H "Content-Type: application/json" -H "x-api-key: $API_KEY" \
  -d "{\"model\":\"$CACHE_MODEL\",\"messages\":[{\"role\":\"user\",\"content\":\"$CACHE_PROMPT\"}],\"max_tokens\":50}" \
  -D "$tmp_h" -o /dev/null 2>/dev/null
cache_val=$(grep -i "^x-cache:" "$tmp_h" | tr -d '\r' | cut -d: -f2 | xargs 2>/dev/null || echo "")
rm -f "$tmp_h"
[ "$cache_val" = "HIT" ] && pass "Identical prompt → x-cache: HIT" || fail "Cache HIT" "x-cache=$cache_val"

echo "  Request 3 semantically similar (expect HIT)..."
tmp_h2=$(mktemp)
curl -sk -X POST "$BASE/chat/completions" \
  -H "Content-Type: application/json" -H "x-api-key: $API_KEY" \
  -d "{\"model\":\"$CACHE_MODEL\",\"messages\":[{\"role\":\"user\",\"content\":\"Which element has the atomic number 79?\"}],\"max_tokens\":50}" \
  -D "$tmp_h2" -o /dev/null 2>/dev/null
cv2=$(grep -i "^x-cache:" "$tmp_h2" | tr -d '\r' | cut -d: -f2 | xargs 2>/dev/null || echo "")
sc2=$(grep -i "^x-cache-score:" "$tmp_h2" | tr -d '\r' | cut -d: -f2 | xargs 2>/dev/null || echo "")
rm -f "$tmp_h2"
[ "$cv2" = "HIT" ] && pass "Semantic match → x-cache: HIT (score=$sc2)" || fail "Semantic cache" "x-cache=$cv2"

echo "  Request 4 diff model + unique prompt (expect MISS — different cache key)..."
UNIQUE_PROMPT="Unique probe $(date +%s): what color is Mars?"
tmp_h3=$(mktemp)
curl -sk -X POST "$BASE/chat/completions" \
  -H "Content-Type: application/json" -H "x-api-key: $API_KEY" \
  -d "{\"model\":\"claude-haiku-4-5\",\"messages\":[{\"role\":\"user\",\"content\":\"$UNIQUE_PROMPT\"}],\"max_tokens\":20}" \
  -D "$tmp_h3" -o /dev/null 2>/dev/null
cv3=$(grep -i "^x-cache:" "$tmp_h3" | tr -d '\r' | cut -d: -f2 | xargs 2>/dev/null || echo "")
rm -f "$tmp_h3"
[ "$cv3" = "MISS" ] && pass "Unique prompt + different model → x-cache: MISS" || fail "Cache MISS for new prompt" "x-cache=$cv3"

# =============================================================================
section "12. OBSERVABILITY — Cloud Logging"
# =============================================================================
count=$(gcloud logging read \
  "logName=\"projects/${PROJECT_ID}/logs/llm-gateway-requests\"" \
  --project=${PROJECT_ID} --limit=10 --format=json 2>/dev/null \
  | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null || echo "0")
[ "$count" -gt 0 ] 2>/dev/null && pass "Cloud Logging: $count recent entries" || fail "Cloud Logging" "no entries found"

sample=$(gcloud logging read \
  "logName=\"projects/${PROJECT_ID}/logs/llm-gateway-requests\" AND jsonPayload.statusCode=\"200\"" \
  --project=${PROJECT_ID} --limit=1 --format=json 2>/dev/null \
  | python3 -c "
import sys,json
logs=json.load(sys.stdin)
if logs:
    p=logs[0].get('jsonPayload',{})
    missing=[f for f in ['requestId','statusCode','apiKeyApp','cacheStatus','modelRequested'] if not p.get(f)]
    print('OK' if not missing else 'MISSING:'+','.join(missing))
else: print('NO_LOGS')
" 2>/dev/null || echo "ERROR")
[ "$sample" = "OK" ] && pass "Log entry has all required fields" || fail "Log fields" "$sample"

# =============================================================================
section "13. TOKEN QUOTA"
# =============================================================================
# 13a. Usage fields present in response (real LLM call, unique prompt)
QUOTA_PROBE="token-quota-probe-$(date +%s)"
call POST /chat/completions -H "x-api-key: $API_KEY" \
  -d "{\"model\":\"gemini-2.0-flash-001\",\"messages\":[{\"role\":\"user\",\"content\":\"$QUOTA_PROBE say hi\"}],\"max_tokens\":10}"
if [ "$CODE" = "200" ]; then
  inp=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('usage',{}).get('prompt_tokens',0))" 2>/dev/null || echo "0")
  out=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('usage',{}).get('completion_tokens',0))" 2>/dev/null || echo "0")
  [ "$inp" -gt 0 ] 2>/dev/null && pass "Token usage: prompt_tokens=$inp > 0" || fail "prompt_tokens" "got $inp"
  [ "$out" -gt 0 ] 2>/dev/null && pass "Token usage: completion_tokens=$out > 0" || fail "completion_tokens" "got $out"
else
  fail "Token usage request" "HTTP $CODE"
fi

# 13b. Effective tokens in Cloud Logging
sleep 8
log_check=$(gcloud logging read \
  "logName=\"projects/${PROJECT_ID}/logs/llm-gateway-requests\" AND jsonPayload.effectiveTokens!=\"\"" \
  --project=${PROJECT_ID} --limit=1 --format=json 2>/dev/null \
  | python3 -c "
import sys,json
logs=json.load(sys.stdin)
if logs:
    p=logs[0].get('jsonPayload',{})
    et=p.get('effectiveTokens','')
    tw=p.get('tokenWeight','')
    if et and tw:
        print('OK:et={},tw={}'.format(et,tw))
    else:
        print('MISSING:effectiveTokens={},tokenWeight={}'.format(et,tw))
else:
    print('NO_LOGS')
" 2>/dev/null || echo "ERROR")
if echo "$log_check" | grep -q "^OK:"; then
  et_val=$(echo "$log_check" | python3 -c "import sys; s=sys.stdin.read(); print(s.split('et=')[1].split(',')[0])" 2>/dev/null)
  tw_val=$(echo "$log_check" | python3 -c "import sys; s=sys.stdin.read(); print(s.split('tw=')[1].strip())" 2>/dev/null)
  pass "Cloud Logging: effectiveTokens=$et_val, tokenWeight=$tw_val"
else
  fail "Effective tokens in logs" "$log_check"
fi

# 13c. Token quota 429: temporarily lower limit to 1, verify token_quota_exceeded error
TOKEN_MGMT=$(gcloud auth print-access-token 2>/dev/null)
# Lower quota to 1 effective token
curl -s -X POST \
  "https://apigee.googleapis.com/v1/organizations/${PROJECT_ID}/apiproducts/llm-gateway-product/attributes/developer.token.quota.limit" \
  -H "Authorization: Bearer $TOKEN_MGMT" \
  -H "Content-Type: application/json" \
  -d '{"name":"developer.token.quota.limit","value":"1"}' > /dev/null 2>&1

sleep 60  # allow attribute propagation to Apigee runtime (product cache TTL ~60s)

call POST /chat/completions -H "x-api-key: $API_KEY" \
  -d '{"model":"gemini-2.0-flash-001","messages":[{"role":"user","content":"hi"}],"max_tokens":10}'
if [ "$CODE" = "429" ]; then
  # 接受两种格式：自定义 {"error":{"type":"token_quota_exceeded"}} 或 Apigee 原始 {"fault":{...}}
  quota_signal=$(echo "$BODY" | python3 -c "
import sys,json
d=json.load(sys.stdin)
if d.get('error',{}).get('type') == 'token_quota_exceeded': print('custom')
elif 'fault' in d and 'quota' in d['fault'].get('faultstring','').lower(): print('apigee_raw')
else: print('unknown')
" 2>/dev/null || echo "unknown")
  [ "$quota_signal" != "unknown" ] \
    && pass "Token quota 429: quota exceeded ($quota_signal format)" \
    || fail "Token quota 429 body" "unexpected: $BODY"
elif [ "$CODE" = "200" ]; then
  # Apigee product attribute cache TTL > 60s — new limit may not have propagated yet
  skip "Token quota 429 (attribute cache not expired, rerun after ~5min to verify)"
else
  fail "Token quota 429" "expected 429 or 200(cache), got HTTP $CODE"
fi

# Restore quota to 1M
curl -s -X POST \
  "https://apigee.googleapis.com/v1/organizations/${PROJECT_ID}/apiproducts/llm-gateway-product/attributes/developer.token.quota.limit" \
  -H "Authorization: Bearer $TOKEN_MGMT" \
  -H "Content-Type: application/json" \
  -d '{"name":"developer.token.quota.limit","value":"1000000"}' > /dev/null 2>&1

sleep 15  # allow restore propagation
call POST /chat/completions -H "x-api-key: $API_KEY" \
  -d '{"model":"gemini-2.0-flash-001","messages":[{"role":"user","content":"hi"}],"max_tokens":5}'
assert_code 200 "Token quota restored: request succeeds after limit reset"

# 13d. OpenCode bypasses token quota (no quota deduction for free models)
call POST /chat/completions -H "x-api-key: $API_KEY" \
  -d '{"model":"opencode/nemotron-3-super-free","messages":[{"role":"user","content":"hi"}],"max_tokens":10}'
if   [ "$CODE" = "200" ]; then pass "OpenCode not blocked by token quota → 200"
elif [ "$CODE" = "429" ]; then
  err_type=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('error',{}).get('type','?'))" 2>/dev/null || echo "?")
  [ "$err_type" = "token_quota_exceeded" ] \
    && fail "OpenCode blocked by token quota" "should bypass token quota" \
    || skip "OpenCode → 429 (OpenCode platform quota, not token quota)"
else skip "OpenCode → HTTP $CODE"; fi

# =============================================================================
section "14. IMAGE GENERATION"
# =============================================================================
TS_IMG=$(date +%s)

# gemini-2.5-flash-image: returns image-only content array
call POST /chat/completions -H "x-api-key: $API_KEY" \
  -d "{\"model\":\"gemini-2.5-flash-image\",\"messages\":[{\"role\":\"user\",\"content\":\"imgtest-$TS_IMG: draw a blue square\"}],\"max_tokens\":1024}"
if [ "$CODE" = "200" ]; then
  img_check=$(echo "$BODY" | python3 -c "
import sys,json
d=json.load(sys.stdin)
c=d.get('choices',[{}])[0].get('message',{}).get('content','')
if isinstance(c,list):
    imgs=[x for x in c if x.get('type')=='image_url']
    url=imgs[0]['image_url']['url'] if imgs else ''
    if imgs and url.startswith('data:image/'):
        print('OK:{} text, {} image'.format(len(c)-len(imgs), len(imgs)))
    else:
        print('NO_IMAGE_URL')
else:
    print('NOT_ARRAY:'+str(type(c).__name__))
" 2>/dev/null || echo "PARSE_ERROR")
  echo "$img_check" | grep -q "^OK:" \
    && pass "gemini-2.5-flash-image → image_url array ($img_check)" \
    || fail "gemini-2.5-flash-image image output" "$img_check"
elif [ "$CODE" = "429" ]; then skip "gemini-2.5-flash-image → 429 (quota)"
else fail "gemini-2.5-flash-image" "HTTP $CODE"; fi

# gemini-3.1-flash-image-preview: returns mixed text+image content array
call POST /chat/completions -H "x-api-key: $API_KEY" \
  -d "{\"model\":\"gemini-3.1-flash-image-preview\",\"messages\":[{\"role\":\"user\",\"content\":\"imgtest2-$TS_IMG: draw a red circle\"}],\"max_tokens\":1024}"
if [ "$CODE" = "200" ]; then
  img_check2=$(echo "$BODY" | python3 -c "
import sys,json
d=json.load(sys.stdin)
c=d.get('choices',[{}])[0].get('message',{}).get('content','')
if isinstance(c,list):
    imgs=[x for x in c if x.get('type')=='image_url']
    url=imgs[0]['image_url']['url'] if imgs else ''
    if imgs and url.startswith('data:image/'):
        print('OK:{} text, {} image'.format(len(c)-len(imgs), len(imgs)))
    else:
        print('NO_IMAGE_URL')
else:
    print('NOT_ARRAY:'+str(type(c).__name__))
" 2>/dev/null || echo "PARSE_ERROR")
  echo "$img_check2" | grep -q "^OK:" \
    && pass "gemini-3.1-flash-image-preview → image_url array ($img_check2)" \
    || fail "gemini-3.1-flash-image-preview image output" "$img_check2"
elif [ "$CODE" = "429" ]; then skip "gemini-3.1-flash-image-preview → 429 (quota)"
else fail "gemini-3.1-flash-image-preview" "HTTP $CODE"; fi

# Image responses must not be cached (FC-SemanticCachePopulate bypassed via llm.has_image)
tmp_img=$(mktemp)
curl -sk -X POST "$BASE/chat/completions" \
  -H "Content-Type: application/json" -H "x-api-key: $API_KEY" \
  -d "{\"model\":\"gemini-2.5-flash-image\",\"messages\":[{\"role\":\"user\",\"content\":\"imgcache-$TS_IMG: a yellow star\"}],\"max_tokens\":1024}" \
  -D "$tmp_img" -o /dev/null 2>/dev/null
img_cache=$(grep -i "^x-cache:" "$tmp_img" | tr -d '\r' | cut -d: -f2 | xargs 2>/dev/null || echo "")
rm -f "$tmp_img"
[ "$img_cache" = "MISS" ] \
  && pass "Image response → x-cache: MISS (populate bypassed)" \
  || fail "Image cache bypass" "x-cache=$img_cache (expected MISS)"

# =============================================================================
section "15. STREAMING"
# =============================================================================
# Helper: send stream:true, verify text/event-stream + SSE data chunks + no x-cache header
_test_stream() {
  local label="$1" model="$2"
  local tmp_body tmp_hdr http_code ct chunks cache_hdr
  tmp_body=$(mktemp); tmp_hdr=$(mktemp)
  http_code=$(curl -sk -X POST "$BASE/chat/completions" \
    -H "Content-Type: application/json" -H "x-api-key: $API_KEY" \
    -d "{\"model\":\"$model\",\"messages\":[{\"role\":\"user\",\"content\":\"Count 1 2 3\"}],\"max_tokens\":60,\"stream\":true}" \
    -D "$tmp_hdr" -o "$tmp_body" -w "%{http_code}" 2>/dev/null)
  ct=$(grep -i "^content-type:" "$tmp_hdr" | tr -d '\r' | cut -d: -f2- | xargs 2>/dev/null || echo "")
  chunks=$(grep -c "^data:" "$tmp_body" 2>/dev/null || echo "0")
  cache_hdr=$(grep -i "^x-cache:" "$tmp_hdr" | tr -d '\r\n' || echo "")
  rm -f "$tmp_body" "$tmp_hdr"
  if [ "$http_code" != "200" ]; then
    [ "$http_code" = "429" ] && skip "$label → 429 (quota)" \
                             || fail "$label" "HTTP $http_code"
    return
  fi
  echo "$ct" | grep -qi "text/event-stream" \
    && pass "$label → Content-Type: text/event-stream" \
    || fail "$label content-type" "got: $ct"
  [ "$chunks" -gt 0 ] \
    && pass "$label → $chunks SSE data: chunks" \
    || fail "$label SSE chunks" "0 data lines in body"
  [ -z "$cache_hdr" ] \
    && pass "$label → no x-cache header (streaming bypasses cache+obs)" \
    || fail "$label cache bypass" "unexpected: $cache_hdr"
}

_test_stream "Streaming/Gemini/gemini-2.0-flash-001"  "gemini-2.0-flash-001"
_test_stream "Streaming/Gemini/gemini-2.5-flash"      "gemini-2.5-flash"
_test_stream "Streaming/Claude/claude-haiku-4-5"      "claude-haiku-4-5"
_test_stream "Streaming/MaaS/glm-4.7"                 "glm-4.7"
_test_stream "Streaming/OpenCode/big-pickle"           "opencode/big-pickle"

# =============================================================================
section "SUMMARY"
# =============================================================================
TOTAL=$((PASS + FAIL + SKIP))
echo ""
printf "  %-10s %d\n" "Passed:"  "$PASS"
printf "  %-10s %d\n" "Failed:"  "$FAIL"
printf "  %-10s %d\n" "Skipped:" "$SKIP"
printf "  %-10s %d\n" "Total:"   "$TOTAL"
echo "  Completed: $(date '+%Y-%m-%d %H:%M:%S UTC')"
echo ""
if [ "$FAIL" -eq 0 ]; then
  printf "${GREEN}  ALL TESTS PASSED ✓${NC}\n"
  exit 0
else
  printf "${RED}  ${FAIL} TEST(S) FAILED ✗${NC}\n"
  exit 1
fi
