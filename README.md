# LLM Gateway on Apigee X

An enterprise-grade LLM API gateway built on **Google Cloud Apigee X**, providing a unified
OpenAI-compatible interface over 30+ models across four backend types.

## Features

| Feature | Details |
|---------|---------|
| **Unified API** | Single OpenAI-compatible endpoint (`POST /v1/chat/completions`) for all models |
| **Multi-model routing** | Gemini 2.0/2.5/3.x (incl. image models), Claude 4.x, GLM, DeepSeek, Kimi, MiniMax, Qwen + free models |
| **Image generation** | `gemini-2.5-flash-image` and `gemini-3.1-flash-image-preview` — returns OpenAI content array with `image_url` data URLs; image responses bypass semantic cache |
| **Cross-project routing** | Quota isolation across GCP projects (`YOUR_PROJECT_ID` / `YOUR_CROSS_PROJECT_ID`) |
| **Semantic caching** | Vertex AI Vector Search (768-dim) + Apigee distributed cache, ~0.95 similarity threshold |
| **API key authentication** | Apigee native API Products + VerifyAPIKey, 1000 req/min quota |
| **Free model tier** | 7 OpenCode Zen free models (`opencode/*`), no token cost |
| **Observability** | Structured Cloud Logging, log-based metrics, Cloud Monitoring dashboard, 3 alert policies |
| **Token quota** | App/product-level token quota with model weight coefficients, OpenCode excluded |
| **Latency logging** | `totalLatencyMs` / `targetLatencyMs` logged per request in Cloud Logging |
| **Admin UI** | Next.js 15 control console (IAP-protected Cloud Run): dashboard, API keys, quota config |
| **Streaming** | `"stream":true` → SSE passthrough; Gemini uses `streamGenerateContent?alt=sse`, MaaS/Claude/OpenCode native SSE |
| **Error transparency** | All errors carry `error.source`: `"gateway"` (Apigee quota/auth) vs `"model"` (backend 4xx/5xx) |
| **Test suite** | 75 automated tests across 15 sections, 71 pass / 0 fail |

---

## Architecture

> **Interactive version:** [`docs/architecture.html`](docs/architecture.html) — open in any browser for full dark-theme detail.

![LLM Gateway on Apigee X — Architecture](docs/architecture.png)

```
Client (POST /v1/chat/completions, x-api-key: <key>)
           │
           ▼
  Global HTTPS Load Balancer (static IP, managed SSL cert)
           │
           ▼ PSC NEG → Apigee eval-instance
┌──────────────────────────────────────────────────────────────────┐
│                       Apigee X (YOUR_PROJECT_ID, prod env)            │
│                                                                  │
│  ProxyEndpoint PreFlow (REQUEST)                                 │
│  ① VA-VerifyApiKey      x-api-key header, API Product quota      │
│  ② QU-LlmQuota          1000 req/min per app                     │
│  ③ EV-ExtractModel      $.model from request body                │
│  ④ JS-DetectBackend     set llm.backend = "vertex" | "opencode"  │
│  ⑤ FC-SemanticCacheLookup                                        │
│     ├─ SC-GetEmbedding      → Vertex AI text-embedding-004       │
│     ├─ JS-BuildVsPayload    → findNeighbors payload              │
│     ├─ SC-VectorSearch      → similarity ≥ 0.95?                 │
│     ├─ LC-LookupCache       → Apigee distributed cache           │
│     └─ AM-CacheHitResponse  → return cached (x-cache: HIT)       │
│                                                                  │
│  RouteRule (evaluated after PreFlow)                             │
│  ┌─ CacheHit  → null route (response already set)               │
│  ├─ OpenCode  → opencode TargetEndpoint (no auth)               │
│  └─ default   → vertex TargetEndpoint (GoogleAccessToken)        │
│                                                                  │
│  TargetEndpoint PreFlow (REQUEST)                                │
│  ⑥ JS-ModelRouter       → set target.url + llm.* metadata       │
│  ⑦ JS-RequestNormalizer → OpenAI → Gemini/Claude/MaaS format    │
│  [⑧ AM-StripAuthHeader  → OpenCode only: remove x-api-key]      │
│                                                                  │
│  ProxyEndpoint PreFlow (RESPONSE, cache MISS only)               │
│  ⑨  JS-ResponseNormalizer  → backend → OpenAI format            │
│      handles reasoning_content for thinking models              │
│  ⑩  FC-SemanticCachePopulate                                     │
│      ├─ JS-BuildCacheId         → FNV-1a hash key               │
│      ├─ PC-PopulateCache        → store response, TTL 3600s      │
│      ├─ SC-GetEmbeddingPopulate → re-fetch embedding             │
│      ├─ JS-BuildUpsertPayload   → build VS upsert JSON           │
│      └─ SC-UpsertVector         → VS upsertDatapoints            │
│  ⑪  AM-AddObsHeaders   → x-cache, x-cache-score, x-llm-model   │
│                                                                  │
│  PostFlow (RESPONSE)                                             │
│  ⑫  AM-SetStatusForLog → capture response.status.code           │
│  ⑬  ML-CloudLogging    → structured JSON → Cloud Logging         │
│      (also called from FaultRules for 401/429 errors)           │
└──────────────────────────────────────────────────────────────────┘
           │
           ▼  (one of four backends)
  A. Vertex AI generateContent  (Gemini models)
  B. Vertex AI rawPredict       (Claude models)
  C. Vertex AI OpenAPI endpoint (all MaaS partner models)
  D. OpenCode Zen               (free models, no auth)
```

---

## Backend Endpoints

### A — Gemini (generateContent)
```
https://aiplatform.googleapis.com/v1/projects/{PROJECT}/locations/global/
    publishers/google/models/{MODEL}:generateContent
```

### B — Claude (rawPredict)
```
https://aiplatform.googleapis.com/v1/projects/{PROJECT}/locations/global/
    publishers/anthropic/models/{MODEL}:rawPredict
```

### C — MaaS Partner Models (OpenAPI-compatible)
```
https://aiplatform.googleapis.com/v1/projects/{PROJECT}/locations/global/
    endpoints/openapi/chat/completions

Body: {"model": "publisher/model-id", "messages": [...], "max_tokens": N}
```
All partner models (GLM, DeepSeek, Kimi, MiniMax, Qwen) share this single endpoint.
Response is OpenAI-compatible. Thinking models return `reasoning_content` instead of `content`.

### D — OpenCode Zen (free, no auth)
```
https://opencode.ai/zen/v1/chat/completions
```
No Bearer token required. Model field uses bare model name (e.g., `nemotron-3-super-free`).

---

## Supported Models

### Google Gemini (YOUR_PROJECT_ID, Endpoint A)
| Model | Notes |
|-------|-------|
| `gemini-3.1-pro-preview` | |
| `gemini-3.1-flash-image-preview` | image generation model |
| `gemini-3.1-flash-lite-preview` | thinking model |
| `gemini-2.5-flash-image` | image generation model |
| `gemini-3-pro-preview` | |
| `gemini-3-flash-preview` | thinking model |
| `gemini-2.5-pro` | thinking model |
| `gemini-2.5-flash` | |
| `gemini-2.5-flash-lite` | |
| `gemini-2.0-flash-001` | default fallback |
| `gemini-2.0-flash-lite` | |
| `YOUR_CROSS_PROJECT_ID/gemini-2.5-pro` | cross-project (YOUR_CROSS_PROJECT_ID) |
| `YOUR_CROSS_PROJECT_ID/gemini-3-flash-preview` | cross-project (YOUR_CROSS_PROJECT_ID) |

### Anthropic Claude (YOUR_PROJECT_ID, Endpoint B)
`claude-opus-4-6` · `claude-sonnet-4-6` · `claude-haiku-4-5` · `claude-opus-4-5` · `claude-sonnet-4-5` · `claude-opus-4` · `claude-opus-4-1`

### MaaS Partner Models (YOUR_PROJECT_ID, Endpoint C — OpenAPI)
| Model alias | Backend model | Provider |
|-------------|---------------|----------|
| `glm-4.7` | `zai-org/glm-4.7-maas` | ZhipuAI |
| `glm-5` | `zai-org/glm-5-maas` | ZhipuAI (thinking) |
| `deepseek-v3.2` | `deepseek-ai/deepseek-v3.2-maas` | DeepSeek |
| `deepseek-ocr` | `deepseek-ai/deepseek-ocr-maas` | DeepSeek |
| `kimi-k2-thinking` | `moonshotai/kimi-k2-thinking-maas` | Moonshot (thinking) |
| `minimax-m2` | `minimaxai/minimax-m2-maas` | MiniMax (thinking) |
| `qwen3-235b` | `qwen/qwen3-235b-a22b-instruct-2507-maas` | Alibaba |
| `qwen3-next-80b` | `qwen/qwen3-next-80b-a3b-instruct-maas` | Alibaba |
| `qwen3-next-80b-think` | `qwen/qwen3-next-80b-a3b-thinking-maas` | Alibaba (thinking) |
| `qwen3-coder` | `qwen/qwen3-coder-480b-a35b-instruct-maas` | Alibaba |

### OpenCode Zen — Free (Endpoint D)
| Model | Provider |
|-------|----------|
| `opencode/big-pickle` | Minimax |
| `opencode/minimax-m2.5-free` | Minimax |
| `opencode/mimo-v2-flash-free` | MiMo |
| `opencode/mimo-v2-pro-free` | MiMo |
| `opencode/mimo-v2-omni-free` | MiMo |
| `opencode/trinity-large-preview-free` | Trinity |
| `opencode/nemotron-3-super-free` | Nvidia (may rate-limit) |

---

## Quick Start

### Prerequisites
- GCP project with Vertex AI and Apigee X enabled
- `gcloud` CLI authenticated
- `apikey` value from `infra/api-key.env`

### Send a request
```bash
source infra/api-key.env
HOST=YOUR_LB_IP.nip.io

# Streaming (any model — add "stream":true)
curl -X POST https://$HOST/v1/chat/completions \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"gemini-2.5-flash","messages":[{"role":"user","content":"Hello!"}],"max_tokens":100,"stream":true}'

# Gemini
curl -X POST https://$HOST/v1/chat/completions \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"gemini-2.5-flash","messages":[{"role":"user","content":"Hello!"}],"max_tokens":100}'

# Claude
curl -X POST https://$HOST/v1/chat/completions \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"claude-sonnet-4-6","messages":[{"role":"user","content":"Hello!"}],"max_tokens":100}'

# GLM (MaaS via OpenAPI endpoint)
curl -X POST https://$HOST/v1/chat/completions \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"glm-5","messages":[{"role":"user","content":"Hello!"}],"max_tokens":100}'

# Free model (no quota cost)
curl -X POST https://$HOST/v1/chat/completions \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"opencode/big-pickle","messages":[{"role":"user","content":"Hello!"}],"max_tokens":100}'

# Cross-project routing (YOUR_CROSS_PROJECT_ID quota pool)
curl -X POST https://$HOST/v1/chat/completions \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"YOUR_CROSS_PROJECT_ID/gemini-2.5-pro","messages":[{"role":"user","content":"Hello!"}],"max_tokens":100}'
```

### Response format — text (OpenAI-compatible)
```json
{
  "id": "chatcmpl-...",
  "object": "chat.completion",
  "model": "gemini-2.5-flash",
  "choices": [{"index":0,"message":{"role":"assistant","content":"Hello! ..."},"finish_reason":"stop"}],
  "usage": {"prompt_tokens":8,"completion_tokens":42,"total_tokens":50}
}
```

### Response format — image generation models
Image models (`gemini-2.5-flash-image`, `gemini-3.1-flash-image-preview`) return a content array:
```json
{
  "choices": [{"index":0,"message":{"role":"assistant","content":[
    {"type":"text","text":"Here is the image:"},
    {"type":"image_url","image_url":{"url":"data:image/png;base64,iVBORw0K..."}}
  ]},"finish_reason":"stop"}]
}
```
- `responseModalities: ["TEXT","IMAGE"]` is injected automatically; no client change needed
- Image responses are **not** stored in the semantic cache (payload ~1MB+)
- Client can override by passing `responseModalities` in the request body

### Response headers
```
x-cache: HIT | MISS
x-cache-score: 0.9999979    # cosine similarity (on HIT)
x-llm-model: gemini-2.5-flash
x-llm-project: YOUR_PROJECT_ID
```
> Streaming responses (`stream:true`) do not include `x-cache` / `x-llm-*` headers — the response is a raw SSE passthrough.

### Streaming
Add `"stream": true` to any request. The gateway passes through the backend's native SSE stream:

```bash
curl -X POST https://$HOST/v1/chat/completions \
  -H "x-api-key: $API_KEY" -H "Content-Type: application/json" \
  -d '{"model":"gemini-2.5-flash","messages":[{"role":"user","content":"Count 1 to 5"}],"max_tokens":100,"stream":true}'
```

| Backend | SSE Format | Content-Type |
|---------|-----------|--------------|
| Gemini | `data: {"candidates":[{"content":{"parts":[{"text":"..."}]}}]}` | `text/event-stream` |
| Claude (rawPredict) | `event: content_block_delta` / `data: {"type":"..."}` | `text/event-stream` |
| MaaS (OpenAPI) | `data: {"choices":[{"delta":{"content":"..."}}]}` | `text/event-stream` |
| OpenCode Zen | `data: {"choices":[{"delta":{"content":"..."}}]}` | `text/event-stream` |

**Streaming behaviour:**
- Semantic cache is **bypassed** (no lookup, no populate)
- Token quota counter is **not updated** (rate-limit quota still enforced)
- Observability headers and Cloud Logging are **skipped** for streaming requests
- All response-side policies are skipped to allow true SSE passthrough without buffering

### Error responses — distinguishing gateway vs model errors

Every error response includes an `error.source` field so clients can tell exactly where the problem originated:

| `source` | `type` | `code` | Meaning | `Retry-After` |
|----------|--------|--------|---------|--------------|
| `gateway` | `rate_limit_error` | `rate_limit_exceeded` | Apigee req/min quota hit | 60 s |
| `gateway` | `token_quota_exceeded` | `token_quota_exceeded` | Apigee token quota exhausted | 3600 s |
| `gateway` | `invalid_request_error` | `invalid_api_key` | Bad or missing API key | — |
| `model` | `upstream_error` | `upstream_rate_limit` | Backend model 429 (model's own quota) | 60 s |
| `model` | `upstream_error` | `upstream_error` | Other backend 4xx/5xx | — |

```json
// Gateway quota — retry in 60 s
{"error":{"message":"Rate limit exceeded. Please retry after 60 seconds.",
           "type":"rate_limit_error","code":"rate_limit_exceeded","source":"gateway"}}

// Backend model quota — backend is rate-limiting (not the gateway)
{"error":{"message":"Resource has been exhausted (RESOURCE_EXHAUSTED).",
           "type":"upstream_error","code":"upstream_rate_limit","source":"model"}}
```

---

## Semantic Cache

```
Request
  └─ Embed prompt (text-embedding-004, 768-dim)
       └─ Vector Search findNeighbors (similarity ≥ 0.95)
            ├─ HIT  → LookupCache → return stored response (x-cache: HIT)
            └─ MISS → call LLM → normalize → store in cache + upsert vector
```

**Cache key:** `FNV-1a("{model}:{prompt_text}")` — model-scoped, prevents cross-model collisions
**TTL:** 3600 seconds
**Vector Search propagation delay:** ~60 s for stream-updated vectors to become queryable

---

## Implementation Steps

> All commands assume: `PROJECT_ID=YOUR_PROJECT_ID`, `PROJECT_NUMBER=YOUR_PROJECT_NUMBER`,
> `ORG=YOUR_PROJECT_ID`, `REGION=us-central1`. Adapt variable values for your environment.
> Run `TOKEN=$(gcloud auth print-access-token)` before each curl block.

---

### Phase 1 — Infrastructure

#### 1.1 Enable required APIs

```bash
gcloud services enable \
  apigee.googleapis.com \
  apigeeconnect.googleapis.com \
  compute.googleapis.com \
  servicenetworking.googleapis.com \
  cloudresourcemanager.googleapis.com \
  --project=$PROJECT_ID
```

#### 1.2 Create dedicated Apigee VPC

Apigee X requires a dedicated VPC with a `/22` subnet for its managed instances.

```bash
# VPC
gcloud compute networks create apigee-vpc \
  --project=$PROJECT_ID \
  --subnet-mode=custom \
  --bgp-routing-mode=regional

# /22 subnet in us-central1
gcloud compute networks subnets create apigee-subnet \
  --project=$PROJECT_ID \
  --network=apigee-vpc \
  --region=us-central1 \
  --range=10.0.0.0/22
```

#### 1.3 Configure VPC peering for Apigee service networking

```bash
# Allocate IP range for peering
gcloud compute addresses create apigee-peering-range \
  --project=$PROJECT_ID \
  --network=apigee-vpc \
  --global \
  --purpose=VPC_PEERING \
  --prefix-length=16

# Connect service networking
gcloud services vpc-peerings connect \
  --project=$PROJECT_ID \
  --network=apigee-vpc \
  --ranges=apigee-peering-range \
  --service=servicenetworking.googleapis.com
```

#### 1.4 Provision Apigee X organization *(takes 20–30 min)*

```bash
# Start async provisioning
gcloud alpha apigee organizations provision \
  --project=$PROJECT_ID \
  --authorized-network=apigee-vpc \
  --runtime-location=us-central1 \
  --analytics-region=us-central1 \
  --async

# Poll progress (replace <OP_ID> with the operation ID from above output)
OP_ID="<OP_ID>"
while true; do
  RESP=$(curl -s \
    "https://apigee.googleapis.com/v1/organizations/$ORG/operations/$OP_ID" \
    -H "Authorization: Bearer $(gcloud auth print-access-token)")
  PCT=$(echo $RESP | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('metadata',{}).get('progress',{}).get('percentDone','0'),'%',d.get('metadata',{}).get('state',''))")
  echo "$(date +%H:%M:%S) $PCT"
  echo "$PCT" | grep -q "FINISHED" && break
  sleep 30
done
```

#### 1.5 Create environment, environment group, and attach instance

```bash
TOKEN=$(gcloud auth print-access-token)

# Create prod environment
curl -s -X POST "https://apigee.googleapis.com/v1/organizations/$ORG/environments" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"prod","displayName":"Production"}'
# Poll returned operation until done (~1 min)

# Reserve static external IP for the Load Balancer
gcloud compute addresses create apigee-external-ip --global --project=$PROJECT_ID
APIGEE_IP=$(gcloud compute addresses describe apigee-external-ip \
  --global --project=$PROJECT_ID --format='value(address)')
APIGEE_HOST="${APIGEE_IP//./-}.nip.io"
echo "IP: $APIGEE_IP  Host: $APIGEE_HOST"

# Create environment group (nip.io provides wildcard DNS — no real DNS needed)
curl -s -X POST "https://apigee.googleapis.com/v1/organizations/$ORG/envgroups" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"name\":\"llm-gateway-envgroup\",\"hostnames\":[\"$APIGEE_HOST\"]}"

# Attach prod environment to the group
curl -s -X POST "https://apigee.googleapis.com/v1/organizations/$ORG/envgroups/llm-gateway-envgroup/attachments" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"environment":"prod"}'

# Attach the Apigee instance to prod (instance is typically "eval-instance")
# Verify instance name first:
curl -s "https://apigee.googleapis.com/v1/organizations/$ORG/instances" \
  -H "Authorization: Bearer $TOKEN" \
  | python3 -c "import sys,json; [print('Instance:', i['name'].split('/')[-1], '| host:', i['host']) for i in json.load(sys.stdin).get('instances',[])]"

curl -s -X POST "https://apigee.googleapis.com/v1/organizations/$ORG/instances/eval-instance/attachments" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"environment":"prod"}'
# Poll returned operation until done (~2 min)
```

#### 1.6 Set up Global HTTPS Load Balancer (PSC NEG → Apigee)

```bash
TOKEN=$(gcloud auth print-access-token)

# Get the Apigee instance's PSC service attachment URI
SA=$(curl -s "https://apigee.googleapis.com/v1/organizations/$ORG/instances/eval-instance" \
  -H "Authorization: Bearer $TOKEN" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['serviceAttachment'])")
echo "Service Attachment: $SA"

# 1. Create PSC Network Endpoint Group (connects LB to Apigee)
gcloud compute network-endpoint-groups create apigee-neg \
  --project=$PROJECT_ID \
  --region=us-central1 \
  --network-endpoint-type=private-service-connect \
  --psc-target-service="$SA" \
  --network=apigee-vpc \
  --subnet=apigee-subnet

# 2. Backend service
gcloud compute backend-services create apigee-backend \
  --project=$PROJECT_ID --global \
  --load-balancing-scheme=EXTERNAL_MANAGED \
  --protocol=HTTPS

gcloud compute backend-services add-backend apigee-backend \
  --project=$PROJECT_ID --global \
  --network-endpoint-group=apigee-neg \
  --network-endpoint-group-region=us-central1

# 3. URL map
gcloud compute url-maps create apigee-url-map \
  --project=$PROJECT_ID \
  --default-service=apigee-backend

# 4. Google-managed SSL certificate (auto-provisioned; takes 10–15 min after first request)
gcloud compute ssl-certificates create apigee-managed-cert \
  --project=$PROJECT_ID \
  --domains="$APIGEE_HOST" \
  --global

# 5. HTTPS target proxy
gcloud compute target-https-proxies create apigee-https-proxy \
  --project=$PROJECT_ID \
  --url-map=apigee-url-map \
  --ssl-certificates=apigee-managed-cert

# 6. HTTPS forwarding rule (port 443)
gcloud compute forwarding-rules create apigee-https-forwarding-rule \
  --project=$PROJECT_ID --global \
  --load-balancing-scheme=EXTERNAL_MANAGED \
  --target-https-proxy=apigee-https-proxy \
  --address=apigee-external-ip \
  --ports=443

# 7. HTTP → HTTPS redirect (port 80)
gcloud compute url-maps import apigee-http-redirect \
  --project=$PROJECT_ID --global << 'EOF'
name: apigee-http-redirect
defaultUrlRedirect:
  redirectResponseCode: MOVED_PERMANENTLY_DEFAULT
  httpsRedirect: true
EOF

gcloud compute target-http-proxies create apigee-http-proxy \
  --project=$PROJECT_ID --url-map=apigee-http-redirect --global

gcloud compute forwarding-rules create apigee-http-forwarding-rule \
  --project=$PROJECT_ID --global \
  --load-balancing-scheme=EXTERNAL_MANAGED \
  --target-http-proxy=apigee-http-proxy \
  --address=apigee-external-ip \
  --ports=80

echo "Done. Endpoint: https://$APIGEE_HOST (SSL cert provisioning in background)"
```

#### 1.7 Create Vertex AI Vector Search index and endpoint *(takes 15–20 min)*

```bash
TOKEN=$(gcloud auth print-access-token)
VS_REGION=us-central1

# 1. Create streaming index (768-dim, DOT_PRODUCT_DISTANCE)
OP=$(curl -s -X POST \
  "https://${VS_REGION}-aiplatform.googleapis.com/v1/projects/$PROJECT_ID/locations/$VS_REGION/indexes" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{
    "displayName": "llm-semantic-cache-index",
    "metadata": {
      "config": {
        "dimensions": 768,
        "approximateNeighborsCount": 10,
        "distanceMeasureType": "DOT_PRODUCT_DISTANCE",
        "algorithmConfig": {
          "treeAhConfig": {"leafNodeEmbeddingCount": 500, "leafNodesToSearchPercent": 7}
        }
      }
    },
    "indexUpdateMethod": "STREAM_UPDATE"
  }')
INDEX_ID=$(echo $OP | python3 -c "import sys,json; print(json.load(sys.stdin)['name'].split('/')[5])")
OP_NAME=$(echo $OP | python3 -c "import sys,json; print(json.load(sys.stdin)['name'])")
echo "Index ID: $INDEX_ID"

# Poll until index creation finishes (~5 min)
while true; do
  DONE=$(curl -s "${OP_NAME}" -H "Authorization: Bearer $(gcloud auth print-access-token)" \
    | python3 -c "import sys,json; print(json.load(sys.stdin).get('done',False))")
  echo "$(date +%H:%M:%S) Index done: $DONE"
  [ "$DONE" = "True" ] && break; sleep 30
done

# 2. Create public IndexEndpoint
EP_OP=$(curl -s -X POST \
  "https://${VS_REGION}-aiplatform.googleapis.com/v1/projects/$PROJECT_ID/locations/$VS_REGION/indexEndpoints" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"displayName":"llm-semantic-cache-endpoint","publicEndpointEnabled":true}')
EP_ID=$(echo $EP_OP | python3 -c "import sys,json; print(json.load(sys.stdin)['name'].split('/')[5])")
EP_OP_NAME=$(echo $EP_OP | python3 -c "import sys,json; print(json.load(sys.stdin)['name'])")
echo "Endpoint ID: $EP_ID"

# Poll until endpoint is ready (~1 min)
while true; do
  DONE=$(curl -s "${EP_OP_NAME}" -H "Authorization: Bearer $(gcloud auth print-access-token)" \
    | python3 -c "import sys,json; print(json.load(sys.stdin).get('done',False))")
  [ "$DONE" = "True" ] && break; sleep 15
done

# 3. Deploy index to endpoint (automaticResources — ~15 min)
DEPLOY_OP=$(curl -s -X POST \
  "https://${VS_REGION}-aiplatform.googleapis.com/v1/projects/$PROJECT_ID/locations/$VS_REGION/indexEndpoints/$EP_ID:deployIndex" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{
    \"deployedIndex\": {
      \"id\": \"llm_semantic_cache\",
      \"index\": \"projects/$PROJECT_ID/locations/$VS_REGION/indexes/$INDEX_ID\",
      \"displayName\": \"llm-semantic-cache\",
      \"automaticResources\": {\"minReplicaCount\": 1, \"maxReplicaCount\": 2}
    }
  }")
DEPLOY_OP_NAME=$(echo $DEPLOY_OP | python3 -c "import sys,json; print(json.load(sys.stdin)['name'])")
echo "Deployment operation: $DEPLOY_OP_NAME"

# Poll deployment (~15 min)
while true; do
  DONE=$(curl -s "https://${VS_REGION}-aiplatform.googleapis.com/v1/${DEPLOY_OP_NAME}" \
    -H "Authorization: Bearer $(gcloud auth print-access-token)" \
    | python3 -c "import sys,json; print(json.load(sys.stdin).get('done',False))")
  echo "$(date +%H:%M:%S) Deploy done: $DONE"
  [ "$DONE" = "True" ] && break; sleep 60
done

# 4. Get public endpoint domain (used in SharedFlow SC-VectorSearch URL)
VS_DOMAIN=$(curl -s \
  "https://${VS_REGION}-aiplatform.googleapis.com/v1/projects/$PROJECT_ID/locations/$VS_REGION/indexEndpoints/$EP_ID" \
  -H "Authorization: Bearer $TOKEN" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['publicEndpointDomainName'])")
echo "VS Endpoint domain: $VS_DOMAIN"
```

**Save all IDs** to `infra/apigee.env`:
```bash
cat >> infra/apigee.env << EOF
VECTOR_SEARCH_INDEX_ID=$INDEX_ID
VECTOR_SEARCH_ENDPOINT_ID=$EP_ID
VECTOR_SEARCH_DEPLOYED_INDEX_ID=llm_semantic_cache
VECTOR_SEARCH_ENDPOINT_DOMAIN=$VS_DOMAIN
EOF
```

---

### Phase 2 — API Key Authentication & Model Routing

#### 2.1 Create Apigee service account with required IAM roles

```bash
SA_EMAIL="apigee-llm-sa@$PROJECT_ID.iam.gserviceaccount.com"

gcloud iam service-accounts create apigee-llm-sa \
  --project=$PROJECT_ID \
  --display-name="Apigee LLM Gateway SA"

# Vertex AI access on primary project (Gemini, Claude, MaaS)
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$SA_EMAIL" \
  --role="roles/aiplatform.user" --condition=None

# Vertex AI access on cross-project (YOUR_CROSS_PROJECT_ID) for quota isolation routing
gcloud projects add-iam-policy-binding YOUR_CROSS_PROJECT_ID \
  --member="serviceAccount:$SA_EMAIL" \
  --role="roles/aiplatform.user" --condition=None

# Cloud Logging write access
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$SA_EMAIL" \
  --role="roles/logging.logWriter" --condition=None

# Allow Apigee Service Agent to impersonate the SA
# (required for Authentication.GoogleAccessToken in TargetEndpoint to work)
gcloud iam service-accounts add-iam-policy-binding $SA_EMAIL \
  --project=$PROJECT_ID \
  --member="serviceAccount:service-${PROJECT_NUMBER}@gcp-sa-apigee.iam.gserviceaccount.com" \
  --role="roles/iam.serviceAccountTokenCreator"
```

#### 2.2 Create API Product, Developer, and App — extract API key

```bash
TOKEN=$(gcloud auth print-access-token)

# API Product: proxies-based (not operationGroup) with 1000 req/min quota
curl -s -X POST "https://apigee.googleapis.com/v1/organizations/$ORG/apiproducts" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{
    "name": "llm-gateway-product",
    "displayName": "LLM Gateway API Product",
    "approvalType": "auto",
    "environments": ["prod"],
    "proxies": ["llm-gateway"],
    "quota": "1000",
    "quotaInterval": "1",
    "quotaTimeUnit": "minute",
    "attributes": [{"name": "access", "value": "public"}]
  }'

# Developer
curl -s -X POST "https://apigee.googleapis.com/v1/organizations/$ORG/developers" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"email":"demo@llm-gateway.internal","firstName":"Demo","lastName":"User","userName":"demo-user"}'

# App — subscribes to the product; response contains the API key
APP=$(curl -s -X POST \
  "https://apigee.googleapis.com/v1/organizations/$ORG/developers/demo@llm-gateway.internal/apps" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"llm-gateway-demo-app","apiProducts":["llm-gateway-product"]}')

API_KEY=$(echo $APP | python3 -c \
  "import sys,json; print(json.load(sys.stdin)['credentials'][0]['consumerKey'])")
echo "API_KEY=$API_KEY" > infra/api-key.env
echo "Saved API key: ${API_KEY:0:20}..."
```

#### 2.3 Deploy the llm-gateway proxy

```bash
TOKEN=$(gcloud auth print-access-token)
SA_EMAIL="apigee-llm-sa@$PROJECT_ID.iam.gserviceaccount.com"

# Package proxy bundle (ZIP must preserve apiproxy/ directory structure)
cd apigee/proxies/llm-gateway
python3 -c "
import zipfile, pathlib
with zipfile.ZipFile('/tmp/llm-gateway.zip', 'w', zipfile.ZIP_DEFLATED) as zf:
    for f in pathlib.Path('apiproxy').rglob('*'):
        if f.is_file(): zf.write(f)
print('Bundle:', sum(1 for _ in pathlib.Path('apiproxy').rglob('*') if _.is_file()), 'files')
"

# Upload with validation (validate=true rejects XML errors before deployment)
REV=$(curl -s -X POST \
  "https://apigee.googleapis.com/v1/organizations/$ORG/apis?action=import&name=llm-gateway&validate=true" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/octet-stream" \
  --data-binary @/tmp/llm-gateway.zip \
  | python3 -c "import sys,json; d=json.load(sys.stdin); \
    [print('ERR:', v['description']) for e in d.get('details',[]) for v in e.get('violations',[])] \
    if d.get('error') else print(d.get('revision','?'))")
echo "Uploaded revision: $REV"

# Deploy with the Apigee SA
curl -s -X POST \
  "https://apigee.googleapis.com/v1/organizations/$ORG/environments/prod/apis/llm-gateway/revisions/$REV/deployments?override=true&serviceAccount=$SA_EMAIL" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Length: 0" | \
  python3 -c "import sys,json; d=json.load(sys.stdin); print('Rev:', d.get('revision'))"

# Wait for READY (polls every 10s, usually takes 45–60s)
for i in $(seq 1 20); do
  sleep 10
  STATE=$(curl -s \
    "https://apigee.googleapis.com/v1/organizations/$ORG/environments/prod/apis/llm-gateway/revisions/$REV/deployments" \
    -H "Authorization: Bearer $TOKEN" \
    | python3 -c "import sys,json; d=json.load(sys.stdin); \
      errs=[e['message'] for e in d.get('errors',[])][:1]; \
      print(d.get('state','?'), '|', errs[0][:60] if errs else 'ok')")
  echo "$(date +%H:%M:%S) $STATE"
  echo "$STATE" | grep -q "^READY" && break
done
cd ../../..

# Quick smoke tests
source infra/api-key.env
HOST=$(grep APIGEE_HOST infra/apigee.env | cut -d= -f2)

curl -sk https://$HOST/v1/health
# → {"status":"ok","service":"llm-gateway","version":"1.0.0"}

curl -sk -X POST https://$HOST/v1/chat/completions \
  -H "x-api-key: $API_KEY" -H "Content-Type: application/json" \
  -d '{"model":"gemini-2.0-flash-001","messages":[{"role":"user","content":"Hi!"}],"max_tokens":10}' \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['model'], '|', d['choices'][0]['message']['content'])"
# → gemini-2.0-flash-001 | Hi there! ...
```

**Key proxy source files** (all under `apigee/proxies/llm-gateway/apiproxy/`):

| File | Purpose |
|------|---------|
| `resources/jsc/detect-backend.js` | Sets `llm.backend` in ProxyEndpoint PreFlow **before** RouteRule evaluation |
| `resources/jsc/model-router.js` | Full routing table; sets `target.url` in TargetEndpoint PreFlow |
| `resources/jsc/request-normalizer.js` | Converts OpenAI → Gemini / Claude / MaaS / OpenCode format |
| `resources/jsc/response-normalizer.js` | Converts all backends → OpenAI; handles `reasoning_content` for thinking models |
| `proxies/default.xml` | Flow orchestration: PreFlow, FaultRules (with embedded logging), RouteRules |
| `targets/default.xml` | Vertex AI target: `GoogleAccessToken` auth, `copy.pathsuffix=false` |
| `targets/opencode.xml` | OpenCode target: no auth, strips client `x-api-key` header |

---

### Phase 3 — Semantic Cache SharedFlows

#### 3.1 Deploy SemanticCache-Lookup and SemanticCache-Populate

```bash
TOKEN=$(gcloud auth print-access-token)
SA_EMAIL="apigee-llm-sa@$PROJECT_ID.iam.gserviceaccount.com"

for SF in SemanticCache-Lookup SemanticCache-Populate; do
  echo "=== Deploying $SF ==="

  # Package sharedflowbundle
  python3 -c "
import zipfile, pathlib, sys
sf = sys.argv[1]
base = f'apigee/sharedflows/{sf}/sharedflowbundle'
with zipfile.ZipFile(f'/tmp/{sf}.zip', 'w', zipfile.ZIP_DEFLATED) as zf:
    for f in pathlib.Path(base).rglob('*'):
        if f.is_file(): zf.write(f)
print(f'{sf}: {sum(1 for _ in pathlib.Path(base).rglob(\"*\") if _.is_file())} files')
" "$SF"

  # Upload
  REV=$(curl -s -X POST \
    "https://apigee.googleapis.com/v1/organizations/$ORG/sharedflows?action=import&name=$SF&validate=true" \
    -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/octet-stream" \
    --data-binary @/tmp/$SF.zip \
    | python3 -c "import sys,json; d=json.load(sys.stdin); \
      [print('ERR:', v['description']) for e in d.get('details',[]) for v in e.get('violations',[])] \
      if d.get('error') else print(d.get('revision','?'))")
  echo "  Uploaded revision: $REV"

  # Deploy
  curl -s -X POST \
    "https://apigee.googleapis.com/v1/organizations/$ORG/environments/prod/sharedflows/$SF/revisions/$REV/deployments?override=true&serviceAccount=$SA_EMAIL" \
    -H "Authorization: Bearer $TOKEN" -H "Content-Length: 0" | \
    python3 -c "import sys,json; d=json.load(sys.stdin); print('  Rev:', d.get('revision'))"

  # Wait for READY
  for i in $(seq 1 10); do
    sleep 10
    STATE=$(curl -s \
      "https://apigee.googleapis.com/v1/organizations/$ORG/environments/prod/sharedflows/$SF/revisions/$REV/deployments" \
      -H "Authorization: Bearer $TOKEN" \
      | python3 -c "import sys,json; print(json.load(sys.stdin).get('state','?'))")
    echo "  $(date +%H:%M:%S) $STATE"
    [ "$STATE" = "READY" ] && break
  done
done
```

#### 3.2 SharedFlow internals

**SemanticCache-Lookup** (ProxyEndpoint PreFlow → Request):
```
JS-ExtractPrompt         extract last user message + model → cache key text
SC-GetEmbedding          Vertex AI text-embedding-004 (768-dim)
JS-BuildVsPayload        build findNeighbors request with deployed_index_id
SC-VectorSearch          query Vector Search, similarity threshold 0.95
JS-CheckCacheHit         parse response, set llm.cache.hit + llm.cache.key
LC-LookupCache           Apigee distributed cache lookup by VS neighbor ID
AM-CacheHitResponse      return cached response if both VS + Apigee cache hit
```

**SemanticCache-Populate** (ProxyEndpoint PreFlow → Response, MISS only):
```
JS-BuildCacheId          FNV-1a hash of "{model}:{prompt}" as cache key
PC-PopulateCache         store normalized OpenAI response (TTL: 3600s)
SC-GetEmbeddingPopulate  re-fetch embedding (template syntax, not Payload ref)
JS-BuildUpsertPayload    build upsertDatapoints JSON with 768-dim vector
SC-UpsertVector          upsert to Vector Search index
```

#### 3.3 Verify cache behavior

```bash
source infra/api-key.env
HOST=$(grep APIGEE_HOST infra/apigee.env | cut -d= -f2)
Q="What element has atomic number 79?"

echo "--- Request 1: cold (MISS expected) ---"
curl -sk -X POST https://$HOST/v1/chat/completions \
  -H "x-api-key: $API_KEY" -H "Content-Type: application/json" \
  -d "{\"model\":\"gemini-2.0-flash-001\",\"messages\":[{\"role\":\"user\",\"content\":\"$Q\"}],\"max_tokens\":50}" \
  -D - 2>/dev/null | grep "x-cache"
# x-cache: MISS

echo "Waiting 70s for Vector Search stream update..."
sleep 70

echo "--- Request 2: same prompt (HIT expected) ---"
curl -sk -X POST https://$HOST/v1/chat/completions \
  -H "x-api-key: $API_KEY" -H "Content-Type: application/json" \
  -d "{\"model\":\"gemini-2.0-flash-001\",\"messages\":[{\"role\":\"user\",\"content\":\"$Q\"}],\"max_tokens\":50}" \
  -D - 2>/dev/null | grep -E "x-cache|x-cache-score"
# x-cache: HIT
# x-cache-score: 0.9999979...

echo "--- Request 3: semantically similar (HIT expected) ---"
curl -sk -X POST https://$HOST/v1/chat/completions \
  -H "x-api-key: $API_KEY" -H "Content-Type: application/json" \
  -d '{"model":"gemini-2.0-flash-001","messages":[{"role":"user","content":"Which element has atomic number 79?"}],"max_tokens":50}' \
  -D - 2>/dev/null | grep -E "x-cache|x-cache-score"
# x-cache: HIT  (semantic match)
```

---

### Phase 4 — Observability

#### 4.1 Create log-based metrics

Three metrics extracted from `projects/YOUR_PROJECT_ID/logs/llm-gateway-requests`:

```bash
TOKEN=$(gcloud auth print-access-token)
PROJECT=YOUR_PROJECT_ID
LOG_FILTER='logName="projects/YOUR_PROJECT_ID/logs/llm-gateway-requests"'

# ── 1. llm_request_count: every request, labeled by model / cache / status / backend / publisher ──
curl -s -X POST "https://logging.googleapis.com/v2/projects/$PROJECT/metrics" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{
    "name": "llm_request_count",
    "description": "LLM Gateway requests by model, cache status, HTTP status, backend, publisher",
    "filter": "logName=\"projects/YOUR_PROJECT_ID/logs/llm-gateway-requests\"",
    "metricDescriptor": {
      "metricKind": "DELTA", "valueType": "INT64", "unit": "1",
      "labels": [
        {"key": "model",        "valueType": "STRING"},
        {"key": "cache_status", "valueType": "STRING"},
        {"key": "status_code",  "valueType": "STRING"},
        {"key": "backend",      "valueType": "STRING"},
        {"key": "publisher",    "valueType": "STRING"}
      ]
    },
    "labelExtractors": {
      "model":        "EXTRACT(jsonPayload.modelRequested)",
      "cache_status": "EXTRACT(jsonPayload.cacheStatus)",
      "status_code":  "EXTRACT(jsonPayload.statusCode)",
      "backend":      "EXTRACT(jsonPayload.backend)",
      "publisher":    "EXTRACT(jsonPayload.publisher)"
    }
  }'

# ── 2. llm_error_count: 4xx/5xx only ──
curl -s -X POST "https://logging.googleapis.com/v2/projects/$PROJECT/metrics" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{
    "name": "llm_error_count",
    "description": "LLM Gateway 4xx/5xx errors by model and status code",
    "filter": "logName=\"projects/YOUR_PROJECT_ID/logs/llm-gateway-requests\" AND jsonPayload.statusCode>=\"400\"",
    "metricDescriptor": {
      "metricKind": "DELTA", "valueType": "INT64", "unit": "1",
      "labels": [
        {"key": "model",       "valueType": "STRING"},
        {"key": "status_code", "valueType": "STRING"},
        {"key": "api_key_app", "valueType": "STRING"}
      ]
    },
    "labelExtractors": {
      "model":       "EXTRACT(jsonPayload.modelRequested)",
      "status_code": "EXTRACT(jsonPayload.statusCode)",
      "api_key_app": "EXTRACT(jsonPayload.apiKeyApp)"
    }
  }'

# ── 3. llm_token_usage: distribution (MISS requests only — HITs consume no tokens) ──
curl -s -X POST "https://logging.googleapis.com/v2/projects/$PROJECT/metrics" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{
    "name": "llm_token_usage",
    "description": "Total tokens per request (cache MISS only)",
    "filter": "logName=\"projects/YOUR_PROJECT_ID/logs/llm-gateway-requests\" AND jsonPayload.cacheStatus=\"MISS\"",
    "metricDescriptor": {
      "metricKind": "DELTA", "valueType": "DISTRIBUTION", "unit": "1",
      "labels": [
        {"key": "model",     "valueType": "STRING"},
        {"key": "publisher", "valueType": "STRING"}
      ]
    },
    "valueExtractor": "EXTRACT(jsonPayload.totalTokens)",
    "labelExtractors": {
      "model":     "EXTRACT(jsonPayload.modelRequested)",
      "publisher": "EXTRACT(jsonPayload.publisher)"
    },
    "bucketOptions": {
      "exponentialBuckets": {"numFiniteBuckets": 20, "growthFactor": 2, "scale": 1}
    }
  }'
```

> **Tip:** Use `apigee.googleapis.com/proxy/response_count` (Apigee native metric)
> for HTTP status code charts — it captures 401/429 from FaultRules that never reach PostFlow logging.
> The dashboard creation script (`monitoring/create-dashboard.py`) already uses this.

#### 4.2 Create Cloud Monitoring dashboard

```bash
# Creates 8-panel dashboard:
#   - Request rate by model (log-based)
#   - Cache HIT vs MISS (log-based)
#   - HTTP response code rate — line chart (Apigee native, all status codes)
#   - HTTP response code distribution — stacked bar (Apigee native)
#   - Backend distribution: vertex vs opencode (log-based)
#   - Publisher breakdown (log-based)
#   - Token usage P99 (log-based, MISS only)
#   - Apigee total request rate (Apigee native)
python3 monitoring/create-dashboard.py --project YOUR_PROJECT_ID

# Recreate later (replace old dashboard ID):
# python3 monitoring/create-dashboard.py \
#   --delete-existing 63bec4b8-2c05-405a-9d93-56bdda6649b8
```

> **Dashboard filter trick:** Add `metric.labels.model!=""` (and similar `!=""` for other labels)
> to exclude empty-label time series that accumulate from old log data before label extractors were added.

#### 4.3 Create alerting policies

```bash
TOKEN=$(gcloud auth print-access-token)
PROJECT=YOUR_PROJECT_ID

# Create email notification channel (replace YOUR_EMAIL)
NC=$(curl -s -X POST \
  "https://monitoring.googleapis.com/v3/projects/$PROJECT/notificationChannels" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"type":"email","displayName":"LLM Gateway Alerts",
       "labels":{"email_address":"YOUR_EMAIL@example.com"},"enabled":true}')
NC_NAME=$(echo $NC | python3 -c "import sys,json; print(json.load(sys.stdin)['name'])")
echo "Notification channel: $NC_NAME"
```

```python
# Run as: python3 create-alerts.py (or paste into Python REPL)
import json, urllib.request, subprocess

token = subprocess.check_output(["gcloud","auth","print-access-token"]).decode().strip()
project = "YOUR_PROJECT_ID"
nc_name = "<NC_NAME from above>"   # e.g. "projects/YOUR_PROJECT_ID/notificationChannels/..."
base_url = f"https://monitoring.googleapis.com/v3/projects/{project}/alertPolicies"
headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

def create_alert(body):
    req = urllib.request.Request(base_url, json.dumps(body).encode(), headers, method="POST")
    with urllib.request.urlopen(req) as r:
        print("Created:", json.loads(r.read())["displayName"])

# Alert 1: High error rate — > 0.05 errors/s sustained over 5 min
create_alert({
    "displayName": "LLM Gateway — High Error Rate (>5%)",
    "conditions": [{"displayName": "Error rate > 0.05 req/s over 5 min",
        "conditionThreshold": {
            "filter": 'metric.type="logging.googleapis.com/user/llm_error_count" resource.type="global"',
            "aggregations": [{"alignmentPeriod": "300s", "perSeriesAligner": "ALIGN_RATE",
                              "crossSeriesReducer": "REDUCE_SUM"}],
            "comparison": "COMPARISON_GT", "thresholdValue": 0.05, "duration": "300s"
        }}],
    "alertStrategy": {"autoClose": "1800s"}, "combiner": "OR", "enabled": True,
    "notificationChannels": [nc_name]
})

# Alert 2: High request rate — approaching 500 rpm quota
create_alert({
    "displayName": "LLM Gateway — High Request Rate (>500 rpm)",
    "conditions": [{"displayName": "Request rate > 8.33 req/s (500 rpm) over 2 min",
        "conditionThreshold": {
            "filter": 'metric.type="logging.googleapis.com/user/llm_request_count" resource.type="global"',
            "aggregations": [{"alignmentPeriod": "120s", "perSeriesAligner": "ALIGN_RATE",
                              "crossSeriesReducer": "REDUCE_SUM"}],
            "comparison": "COMPARISON_GT", "thresholdValue": 8.33, "duration": "120s"
        }}],
    "alertStrategy": {"autoClose": "1800s"}, "combiner": "OR", "enabled": True,
    "notificationChannels": [nc_name]
})

# Alert 3: Cache not working — no HITs for 30 min (only fires if traffic > 0)
create_alert({
    "displayName": "LLM Gateway — Low Cache Hit Rate (<20%)",
    "conditions": [{"displayName": "No cache HIT requests in 30-min window",
        "conditionAbsent": {
            "filter": 'metric.type="logging.googleapis.com/user/llm_request_count" resource.type="global" metric.labels.cache_status="HIT"',
            "aggregations": [{"alignmentPeriod": "1800s", "perSeriesAligner": "ALIGN_SUM",
                              "crossSeriesReducer": "REDUCE_SUM"}],
            "duration": "1800s"
        }}],
    "alertStrategy": {"autoClose": "7200s"}, "combiner": "OR", "enabled": True,
    "notificationChannels": [nc_name]
})
```

---

### Phase 5 — Testing

The test suite covers all four backend endpoints, semantic cache behavior, auth enforcement,
and observability. It runs as a single self-contained shell script (~3 min total, including
70 s for Vector Search stream propagation in the cache test).

```bash
# Prerequisites
source infra/api-key.env   # sets API_KEY
source infra/apigee.env    # sets APIGEE_HOST

# Run full suite
bash tests/run-tests.sh
```

**Expected result: ~71 passed / 0 failed / ~4 skipped**
(skipped = quota exhaustion on some MaaS/Claude/Gemini models during streaming/image sections)

**Test sections and what they verify:**

| # | Section | Verifies |
|---|---------|---------|
| 1 | Health Check | `GET /v1/health` → 200, `status=ok` |
| 2 | Authentication | No key → 401, bad key → 401, valid key → 200 |
| 3 | Response Format | `object`, `id`, `choices[0].message.content`, `usage.total_tokens` all present |
| 4 | Endpoint A — Gemini | 4 standard + 5 thinking models (9 total) |
| 5 | Endpoint B — Claude | 5 Claude models respond with non-empty content |
| 6 | Endpoint C — MaaS | 10 partner models via OpenAPI endpoint: GLM, DeepSeek, Kimi, MiniMax, Qwen |
| 7 | Cross-project routing | `YOUR_CROSS_PROJECT_ID/gemini-2.5-flash` and `YOUR_CROSS_PROJECT_ID/gemini-3-flash-preview` |
| 8 | Endpoint D — OpenCode | 5 free models (some may be rate-limited by platform) |
| 9 | Default fallback | Unknown model → `gemini-2.0-flash-001` |
| 10 | Format normalization | System prompt, temperature, MaaS model field rewrite, `reasoning_content` → `content` |
| 11 | Semantic cache | MISS → (70s wait) → HIT → semantic HIT → cross-model MISS |
| 12 | Cloud Logging | Log entries present, required fields (`requestId`, `statusCode`, `cacheStatus`, etc.) |
| 13 | Token Quota | `usage.*` fields, `effectiveTokens` in logs, 429 on limit, bypass for OpenCode |
| 14 | Image Generation | `gemini-2.5-flash-image` + `gemini-3.1-flash-image-preview` → content array with `image_url`; cache bypass confirmed |
| 15 | Streaming | `stream:true` → `text/event-stream` + SSE chunks; Gemini/Claude/MaaS/OpenCode; no `x-cache` header |

**Quick individual tests:**
```bash
source infra/api-key.env
HOST=$(grep APIGEE_HOST infra/apigee.env | cut -d= -f2)

# Health
curl -sk https://$HOST/v1/health

# Auth rejection
curl -sk -o /dev/null -w "No key: HTTP %{http_code}\n" \
  -X POST https://$HOST/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"gemini-2.0-flash-001","messages":[{"role":"user","content":"hi"}]}'

# Gemini 2.5 Flash (Endpoint A)
curl -sk -X POST https://$HOST/v1/chat/completions \
  -H "x-api-key: $API_KEY" -H "Content-Type: application/json" \
  -d '{"model":"gemini-2.5-flash","messages":[{"role":"user","content":"Say HELLO."}],"max_tokens":20}' \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['model'],'|',d['choices'][0]['message']['content'])"

# GLM-5 via Vertex AI OpenAPI endpoint (Endpoint C)
curl -sk -X POST https://$HOST/v1/chat/completions \
  -H "x-api-key: $API_KEY" -H "Content-Type: application/json" \
  -d '{"model":"glm-5","messages":[{"role":"user","content":"Say HELLO."}],"max_tokens":100}' \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['model'],'|',d['choices'][0]['message']['content'])"
# model field shows backend name: "zai-org/glm-5-maas"

# Cross-project routing (YOUR_CROSS_PROJECT_ID quota pool)
curl -sk -X POST https://$HOST/v1/chat/completions \
  -H "x-api-key: $API_KEY" -H "Content-Type: application/json" \
  -d '{"model":"YOUR_CROSS_PROJECT_ID/gemini-2.5-pro","messages":[{"role":"user","content":"hi"}],"max_tokens":10}' \
  -D - | grep -E "HTTP|x-llm-project"
# x-llm-project: YOUR_CROSS_PROJECT_ID

# Free OpenCode model ($0 cost)
curl -sk -X POST https://$HOST/v1/chat/completions \
  -H "x-api-key: $API_KEY" -H "Content-Type: application/json" \
  -d '{"model":"opencode/big-pickle","messages":[{"role":"user","content":"Say HELLO."}],"max_tokens":100}' \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['model'],'|',d['choices'][0]['message']['content'])"
```



## Repository Structure

```
llm-apigee/
├── README.md
├── CLAUDE.md                           # Full architecture reference & lessons learned
├── infra/
│   ├── 02-provision-apigee.sh         # Apigee X provisioning commands
│   ├── 06-setup-load-balancer.sh      # PSC NEG + HTTPS LB setup
│   ├── apigee.env                     # Apigee config (host, org, env, VS IDs)
│   └── api-key.env                    # API key (API_KEY=...) — gitignored
├── apigee/
│   ├── proxies/llm-gateway/apiproxy/
│   │   ├── proxies/default.xml        # Flow orchestration (PreFlow, FaultRules, RouteRules)
│   │   ├── targets/default.xml        # Vertex AI target (GoogleAccessToken, copy.pathsuffix=false)
│   │   ├── targets/opencode.xml       # OpenCode target (no auth, strip headers)
│   │   ├── policies/                  # 18 policies (VA, QU, EV, JS, AM, ML, FC)
│   │   └── resources/jsc/
│   │       ├── model-router.js        # Routing table → target.url + metadata
│   │       ├── request-normalizer.js  # OpenAI → Gemini/Claude/MaaS format
│   │       ├── response-normalizer.js # All backends → OpenAI (handles reasoning_content)
│   │       └── detect-backend.js      # Set llm.backend before RouteRule
│   └── sharedflows/
│       ├── SemanticCache-Lookup/      # Embed → Vector Search → cache lookup
│       └── SemanticCache-Populate/    # Store response + upsert vector
├── monitoring/
│   └── create-dashboard.py           # Recreate Cloud Monitoring dashboard
└── tests/
    └── run-tests.sh                   # 75 tests across 15 sections
```

---

## Admin UI

A Next.js 15 management console deployed on Cloud Run, protected by Google IAP.

| URL | `https://YOUR_UI_LB_IP.nip.io` |
|-----|------|
| Auth | IAP (Google login) |
| Pages | Dashboard (request/token/cache metrics), API Keys, Quota config |
| Stack | Next.js 15.2.3, React 19, shadcn/ui, Recharts, TypeScript |

**Redeploy:**
```bash
cd ui
docker build -t us-central1-docker.pkg.dev/YOUR_PROJECT_ID/llm-gateway/admin-ui:latest .
docker push us-central1-docker.pkg.dev/YOUR_PROJECT_ID/llm-gateway/admin-ui:latest
gcloud run deploy llm-gateway-ui \
  --image us-central1-docker.pkg.dev/YOUR_PROJECT_ID/llm-gateway/admin-ui:latest \
  --region us-central1 --project YOUR_PROJECT_ID --no-allow-unauthenticated
```

---

## Infrastructure Cost Estimate (monthly, excluding model token costs)

| Component | Spec | Est. Monthly |
|-----------|------|-------------|
| Apigee X | eval org (CLOUD runtime) | $0 (trial) / $1,000+ (production) |
| Vector Search | 1 node, automaticResources | ~$65–$110 |
| Global HTTPS LB | 2 forwarding rules | ~$36 |
| Cloud Logging | < 50 GiB/month | $0 (free tier) |
| text-embedding-004 | ~$0.025 per 1M chars | ~$0.015–$0.05 per 1M requests |
| **Total (eval)** | | **~$100–$145/month** |

OpenCode Zen models: **$0** — no token cost.

---

## Key Lessons Learned

1. **`target.url` must be set in TargetEndpoint PreFlow**, not ProxyEndpoint PreFlow — the latter is silently ignored.
2. **`copy.pathsuffix=false`** prevents the proxy path suffix (`/chat/completions`) from being appended to `target.url`.
3. **`<Payload ref="var"/>`** in ServiceCallout sends an empty body — use template syntax `<Payload>{var}</Payload>`.
4. Use **`lookupcache.LC-LookupCache.cachehit`** (not `llm.cache.hit`) as the true full-hit condition. VS similarity alone doesn't guarantee the Apigee cache has the entry.
5. **RouteRule is evaluated before TargetEndpoint PreFlow** — backend detection must happen in ProxyEndpoint PreFlow (`JS-DetectBackend`).
6. **FaultRule PostFlow does not run** — add `ML-CloudLogging` inside each FaultRule; set status code explicitly since `response.status.code` is empty in fault context.
7. **Vertex AI OpenAPI endpoint** (`/endpoints/openapi/chat/completions`) unifies all MaaS partner models with OpenAI-compatible format and higher success rate than individual `rawPredict` endpoints.
8. **Thinking models** (GLM-5, Kimi, MiniMax, Qwen-thinking, Gemini 2.5 Pro, Gemini 3-flash) return `reasoning_content` instead of `content` — normalize in response-normalizer.js.
9. **Vector Search `findNeighbors`** requires `"deployed_index_id"` in the request body.
10. **OpenCode Zen** free models need a separate TargetEndpoint (no auth) with explicit stripping of the client's `x-api-key` header.
11. **Streaming in Apigee X requires skipping ALL response-side policies** — any JavaScript or AssignMessage policy in the ProxyEndpoint response PreFlow or PostFlow causes full buffering, breaking SSE passthrough. Skip everything (`JS-ResponseNormalizer`, `AM-AddObsHeaders`, `JS-ComputeLatency`, `ML-CloudLogging`) for `stream:true` requests.
12. **Gemini streaming uses `streamGenerateContent?alt=sse`** — without `?alt=sse`, the response is a JSON array (not SSE). Keep `llm.action = "generateContent"` for request-normalizer logic; `?alt=sse` is URL-only.
13. **Image generation models** require `responseModalities: ["TEXT","IMAGE"]` in `generationConfig` — without it, the model returns text only. Inject automatically in request-normalizer.js based on `llm.resolved_model`.
14. **Image responses contain `inlineData` parts** — response-normalizer.js must convert these to OpenAI content array format (`type: "image_url"`, `url: "data:image/png;base64,..."`) instead of joining as plain text.
15. **Do not cache image responses** — payloads are ~1MB+. Set `llm.has_image = "true"` in response-normalizer.js and exclude in `FC-SemanticCachePopulate` condition.
16. **`success.codes` is required to normalize backend 4xx/5xx errors** — by default Apigee X does NOT run ProxyEndpoint response PreFlow for backend error responses. Add `<Property name="success.codes">1xx,2xx,3xx,4xx,5xx</Property>` to `HTTPTargetConnection` in both TargetEndpoints so JS-ResponseNormalizer can normalize backend errors.
17. **`AssignMessage createNew="true"` does not work in FaultRules on Apigee X** — it creates a new message object but Apigee X sends the original fault message. Remove `createNew="true"` so AssignMessage modifies the existing fault response in-place.
18. **All errors should carry `error.source`** — add `"source":"gateway"` to every Apigee-generated error payload (AM-AuthError, AM-QuotaError, AM-TokenQuotaError); normalize backend errors with `"source":"model"` in JS-ResponseNormalizer `statusCode >= 400` branch.

---

## Links

| Resource | URL |
|----------|-----|
| External endpoint | `https://YOUR_LB_IP.nip.io/v1/chat/completions` |
| Health check | `https://YOUR_LB_IP.nip.io/v1/health` |
| Admin UI | `https://YOUR_UI_LB_IP.nip.io` (IAP login required) |
| Cloud Monitoring dashboard | [Open dashboard](https://console.cloud.google.com/monitoring/dashboards/custom/63bec4b8-2c05-405a-9d93-56bdda6649b8?project=YOUR_PROJECT_ID) |
| Apigee console | [Open Apigee](https://console.cloud.google.com/apigee/overview?project=YOUR_PROJECT_ID) |
| Cloud Logging | [Open logs](https://console.cloud.google.com/logs/query;query=logName%3D%22projects%2FYOUR_PROJECT_ID%2Flogs%2Fllm-gateway-requests%22?project=YOUR_PROJECT_ID) |
