# LLM Gateway Traffic Simulator

Generates low-cost simulated traffic to populate the demo UI with realistic-looking
data (Dashboard, Logs, Cache, Models pages). Runs as a **Cloud Run Job** triggered
hourly by **Cloud Scheduler**.

## What it does each invocation

- Sends ~60 requests spread evenly over ~50 minutes (then exits)
- Mixes 30% free OpenCode + 30% cheap `gemini-2.5-flash-lite` + 5-15% per premium model
- 50% requests use a popular prompt pool → drives cache HITs (looks good on Dashboard)
- 3% intentionally use a bad API key → drives 401s (variety in Logs)
- 10% use `stream:true` → exercises SSE path
- Hard caps at 300K effective tokens per invocation (~$2-3 worst case)

## Cost

| Run mode | Daily cost (est) |
|----------|------------------|
| Default 60 req/hr × 24 = 1440 req/day | **~$2-3 USD** |
| Halve rate (30 req/hr) | ~$1-1.50 USD |
| Free models only (`MAX_EFFECTIVE_TOKENS=0`) | $0 |

Per-invocation cap (`MAX_EFFECTIVE_TOKENS=300K`) prevents any single hour from blowing
budget. Apigee token quota (currently 1B/hr) is the second backstop.

## Files

| File | Purpose |
|------|---------|
| `simulate-traffic.py` | Main script. Reads env vars, picks model + prompt, fires requests. |
| `prompts.json` | 30 popular prompts (cache HIT pool) + topic templates (unique pool). |
| `Dockerfile` | `python:3.11-slim` + `requests`. |
| `cloudbuild.yaml` | Cloud Build → Artifact Registry. |
| `requirements.txt` | Just `requests>=2.32`. |
| `deploy.sh` | One-shot deploy: enable APIs, push secret, build image, create job + scheduler. |

## Deploy

```bash
bash scripts/deploy.sh
```

This creates / updates:
- Secret Manager entry `llm-gateway-api-key` (holds API_KEY from `infra/api-key.env`)
- Artifact Registry image `traffic-sim:latest`
- Cloud Run Job `llm-traffic-sim`
- Cloud Scheduler `llm-traffic-sim-hourly` (cron: `0 * * * *` UTC)

## Manual operations

```bash
PROJECT=YOUR_PROJECT_ID
REGION=us-central1

# Trigger one execution immediately (skip waiting for scheduler)
gcloud run jobs execute llm-traffic-sim --region=$REGION --project=$PROJECT

# List executions
gcloud run jobs executions list --job=llm-traffic-sim --region=$REGION --project=$PROJECT --limit=5

# Tail logs of latest execution
LATEST=$(gcloud run jobs executions list --job=llm-traffic-sim --region=$REGION --project=$PROJECT --limit=1 --format='value(name)')
gcloud beta run jobs executions logs $LATEST --region=$REGION --project=$PROJECT

# Pause / resume scheduler
gcloud scheduler jobs pause  llm-traffic-sim-hourly --location=$REGION --project=$PROJECT
gcloud scheduler jobs resume llm-traffic-sim-hourly --location=$REGION --project=$PROJECT

# Adjust rate without rebuilding image (just edit env vars on the job)
gcloud run jobs update llm-traffic-sim --region=$REGION --project=$PROJECT \
  --set-env-vars="APIGEE_HOST=$APIGEE_HOST,RATE_PER_HOUR=30,DURATION_MIN=50,..."
```

## Local testing

```bash
cd scripts/
pip install -r requirements.txt

# Dry run (no real requests)
APIGEE_HOST=YOUR_LB_IP.nip.io API_KEY=dummy DRY_RUN=true \
  RATE_PER_HOUR=10 DURATION_MIN=1 python3 simulate-traffic.py

# Real run (small)
set -a; source ../infra/api-key.env; set +a
APIGEE_HOST=YOUR_LB_IP.nip.io \
  RATE_PER_HOUR=10 DURATION_MIN=1 python3 simulate-traffic.py
```

## Configuration knobs (env vars)

| Var | Default | Purpose |
|-----|---------|---------|
| `APIGEE_HOST` | (required) | gateway hostname |
| `API_KEY` | (required, from Secret) | gateway API key |
| `RATE_PER_HOUR` | 60 | total requests per invocation |
| `DURATION_MIN` | 50 | spread requests over N min, then exit |
| `CACHE_HIT_TARGET` | 0.5 | ratio of repeated vs unique prompts |
| `MAX_EFFECTIVE_TOKENS` | 300000 | hard cap per invocation |
| `STREAM_RATIO` | 0.10 | fraction with `stream:true` |
| `BAD_KEY_RATIO` | 0.03 | fraction with intentional 401 |
| `DRY_RUN` | false | log only, no real requests |

## Verification

After deploying, wait 5-10 min then:

```bash
# Recent gateway log entries
gcloud logging read 'logName="projects/YOUR_PROJECT_ID/logs/llm-gateway-requests"' \
  --project=YOUR_PROJECT_ID --limit=20 --format='value(jsonPayload.timestamp,jsonPayload.modelRequested,jsonPayload.statusCode,jsonPayload.cacheStatus)'
```

Open the Admin UI Dashboard — should see:
- Requests/hr counter increasing
- Cache hit rate climbing toward 50%
- Recent activity feed populated with varied models
- Multiple models showing non-zero `callsLastHr` on the Models page

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| All requests return 415 | Apigee rejects `Accept-Encoding: br` (Brotli) | Already fixed in code — explicitly sets `gzip, deflate` only |
| All requests return 401 | API_KEY in Secret is wrong/expired | `gcloud secrets versions add llm-gateway-api-key --data-file=infra/api-key.env` (parse value first) |
| Job timeout at 55 min | `DURATION_MIN` too high vs job timeout | Reduce `DURATION_MIN` to 50 or increase `--task-timeout` |
| Cache HIT rate stays 0% | First few hours: Vector Search needs ~60s to make new entries searchable | Wait 1-2 invocations; HITs grow naturally |
| Premium model 429 | Apigee token quota too low | Bump to ≥ 1B: `gcloud ... apiproducts/llm-gateway-product/attributes` |

## Next steps (out of scope for now)

- Variable hourly rate (e.g., higher during business hours)
- Cost dashboard panel showing simulator's own spend separately
- Auto-discover OpenCode model list from `/zen/v1/models` instead of hardcoded
