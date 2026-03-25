# LLM Gateway on Apigee — Project Guide

## Project Overview

Enterprise-grade LLM API gateway on GCP using Apigee X:
1. **Multi-model routing** — Gemini, Claude, GLM, DeepSeek, Kimi, MiniMax, Qwen via Vertex AI Model Garden
2. **Semantic caching** — Vertex AI Vector Search (768-dim embeddings) + Apigee distributed cache
3. **Unified API key auth** — Apigee native API Products + VerifyAPIKey
4. **Observability** — Cloud Logging structured JSON, Apigee Analytics

---

## Deployment Status

| Component | Status | Detail |
|-----------|--------|--------|
| Apigee X org | ✅ ACTIVE | YOUR_PROJECT_ID, runtime CLOUD |
| Apigee environment | ✅ prod | |
| Apigee envgroup | ✅ ACTIVE | hostname: `YOUR_LB_IP.nip.io` |
| Load Balancer | ✅ Live | IP: YOUR_LB_IP, HTTPS |
| SSL cert | ✅ Provisioned | `apigee-managed-cert` |
| llm-gateway proxy | ✅ rev 56, READY | deployed to prod (error source field + backend error normalization) |
| SemanticCache-Lookup SF | ✅ rev 17, READY | |
| SemanticCache-Populate SF | ✅ rev 15, READY | |
| Token Quota | ✅ | Q-TokenQuota + JS-ComputeEffectiveTokens + JS-ResolveTokenQuota |
| Latency Logging | ✅ | JS-ComputeLatency in PostFlow, totalLatencyMs/targetLatencyMs in logs |
| API Product | ✅ | `llm-gateway-product`, 配额写 Apigee 属性 |
| Developer / App | ✅ | `demo@llm-gateway.internal` + your-email@example.com |
| API Key | ✅ | saved in `infra/api-key.env` |
| Vector Search Index | ✅ DEPLOYED | `llm_semantic_cache`, 768-dim, DOT_PRODUCT |
| Vector Search Endpoint | ✅ | `YOUR_VS_ENDPOINT_DOMAIN` |
| Cloud Monitoring Dashboard | ✅ | `YOUR_DASHBOARD_ID` |
| Log-based Metrics | ✅ | `llm_request_count`, `llm_error_count`, `llm_token_usage` |
| Alert Policies | ✅ | High error rate, High request rate, Low cache hit rate |
| OpenCode Zen (free) | ✅ | 7 free models via `opencode/` prefix |

**External endpoint:** `https://YOUR_LB_IP.nip.io/v1/chat/completions`

---

## Key Configuration

```bash
PROJECT_ID=YOUR_PROJECT_ID
PROJECT_NUMBER=YOUR_PROJECT_NUMBER
REGION=us-central1

# Apigee
APIGEE_ORG=YOUR_PROJECT_ID
APIGEE_ENV=prod
APIGEE_HOST=YOUR_LB_IP.nip.io
APIGEE_IP=YOUR_LB_IP
APIGEE_SA=apigee-llm-sa@YOUR_PROJECT_ID.iam.gserviceaccount.com

# Vertex AI
EMBED_MODEL=text-embedding-004   # 768 dims
EMBED_ENDPOINT=us-central1-aiplatform.googleapis.com

# Vector Search (semantic cache backend)
VS_INDEX_ID=YOUR_VS_INDEX_ID
VS_ENDPOINT_ID=YOUR_VS_ENDPOINT_ID
VS_DEPLOYED_INDEX_ID=llm_semantic_cache
VS_ENDPOINT_HOST=YOUR_VS_ENDPOINT_DOMAIN

# Semantic cache
SIMILARITY_THRESHOLD=0.95
CACHE_TTL_SECS=3600

# Auth
API_PRODUCT=llm-gateway-product
```

---

## Unified Global Endpoint

Two backend endpoint patterns:

**Gemini** (generateContent):
```
https://aiplatform.googleapis.com/v1/projects/{PROJECT}/locations/global/publishers/google/models/{MODEL}:generateContent
```

**Claude** (rawPredict):
```
https://aiplatform.googleapis.com/v1/projects/{PROJECT}/locations/global/publishers/anthropic/models/{MODEL}:rawPredict
```

**All MaaS partner models** — unified OpenAI-compatible endpoint:
```
https://aiplatform.googleapis.com/v1/projects/{PROJECT}/locations/global/endpoints/openapi/chat/completions
```
Request body: `{"model": "{publisher}/{model}", "messages": [...], "max_tokens": N}`
This endpoint supports OpenAI-compatible format natively for all partner models.

---

## Model Matrix (API-tested)

Legend: ✅ 200 OK | ⚠️ 429 quota exhausted (model enabled) | ❌ 404 not enabled

### YOUR_PROJECT_ID — Google Gemini (publisher: `google`)

| API Model ID | Status |
|-------------|--------|
| `gemini-3.1-pro-preview` | ✅ |
| `gemini-3.1-flash-image-preview` | ✅ (image gen) |
| `gemini-2.5-flash-image` | ✅ (image gen) |
| `gemini-3.1-flash-lite-preview` | ✅ |
| `gemini-3-pro-preview` | ✅ |
| `gemini-3-flash-preview` | ✅ |
| `gemini-2.5-pro` | ✅ |
| `gemini-2.5-flash` | ✅ |
| `gemini-2.5-flash-lite` | ✅ |
| `gemini-2.0-flash-001` | ✅ |
| `gemini-2.0-flash-lite` | ✅ |

> Gemini 3.0 series: `gemini-3-*` (NOT `gemini-3.0-*`)

### YOUR_PROJECT_ID — Anthropic Claude (publisher: `anthropic`)

| API Model ID | Status |
|-------------|--------|
| `claude-opus-4-6` | ✅ |
| `claude-sonnet-4-6` | ✅ |
| `claude-haiku-4-5` | ✅ |
| `claude-opus-4-5` | ✅ |
| `claude-sonnet-4-5` | ✅ |
| `claude-opus-4` | ✅ |
| `claude-opus-4-1` | ✅ |
| `claude-sonnet-4` | ❌ not enabled |

### YOUR_PROJECT_ID — Partner/Open Models (MaaS, `-maas` suffix)

| API Model ID | Publisher ID | Model | Status |
|-------------|-------------|-------|--------|
| `glm-4.7-maas` | `zai-org` | GLM-4.7 | ✅ (OpenAPI) |
| `glm-5-maas` | `zai-org` | GLM-5 | ✅ (OpenAPI) |
| `deepseek-v3.2-maas` | `deepseek-ai` | DeepSeek-V3.2 | ✅ (OpenAPI) |
| `deepseek-ocr-maas` | `deepseek-ai` | DeepSeek-OCR | ✅ (OpenAPI) |
| `deepseek-v3.1-maas` | `deepseek-ai` | DeepSeek-V3.1 | ❌ 404 |
| `deepseek-r1-0528-maas` | `deepseek-ai` | DeepSeek-R1 (0528) | ❌ 404 |
| `kimi-k2-thinking-maas` | `moonshotai` | Kimi K2 | ✅ (OpenAPI) |
| `minimax-m2-maas` | `minimaxai` | MiniMax M2 | ✅ (OpenAPI) |
| `qwen3-235b-a22b-instruct-2507-maas` | `qwen` | Qwen3-235B | ✅ (OpenAPI) |
| `qwen3-next-80b-a3b-instruct-maas` | `qwen` | Qwen3-Next-80B Instruct | ✅ (OpenAPI) |
| `qwen3-next-80b-a3b-thinking-maas` | `qwen` | Qwen3-Next-80B Thinking | ✅ (OpenAPI) |
| `qwen3-coder-480b-a35b-instruct-maas` | `qwen` | Qwen3-Coder-480B | ✅ (OpenAPI) |
| `llama-4-maverick-17b-128e-instruct-maas` | `meta` | Llama 4 Maverick | ❌ 404 |
| `llama-4-scout-17b-16e-instruct-maas` | `meta` | Llama 4 Scout | ❌ 404 |
| `llama-3.3-70b-instruct-maas` | `meta` | Llama 3.3 70B | ❌ 404 |
| `mistral-medium-3` | `mistralai` | Mistral Medium 3 | ❌ 404 |
| `mistral-small-2503` | `mistralai` | Mistral Small 3.1 | ❌ 404 |
| `codestral-2` | `mistralai` | Codestral 2 | ❌ 404 |

### YOUR_CROSS_PROJECT_ID — Cross-project (quota isolation, publisher: `google`)

| API Model ID | Status |
|-------------|--------|
| `gemini-3.1-pro-preview` | ✅ |
| `gemini-3.1-flash-lite-preview` | ✅ |
| `gemini-3-pro-preview` | ✅ |
| `gemini-3-flash-preview` | ✅ |
| `gemini-2.5-pro` | ✅ |
| `gemini-2.5-flash` | ✅ |

> Cross-project routing: `YOUR_CROSS_PROJECT_ID/model-name` in request → routes to `YOUR_CROSS_PROJECT_ID` project.

---

## Architecture

```
Client (POST /v1/chat/completions, x-api-key: <key>)
           │
           ▼
  Global HTTPS Load Balancer (YOUR_LB_IP)
           │
           ▼ PSC NEG → Apigee eval-instance
┌──────────────────────────────────────────────────────────┐
│                    Apigee X (YOUR_PROJECT_ID)                 │
│                                                          │
│  ProxyEndpoint PreFlow REQUEST:                          │
│  ① VA-VerifyApiKey  (x-api-key header)                  │
│  ② QU-LlmQuota     (1000 req/min per app)               │
│  ③ EV-ExtractModel ($.model from body)                  │
│  ④ FC-SemanticCacheLookup (SharedFlow)                  │
│     ├─ JS-ExtractPrompt  → llm.cache.key_text           │
│     ├─ SC-GetEmbedding   → text-embedding-004 (768-dim) │
│     ├─ JS-BuildVsPayload → VS findNeighbors payload     │
│     ├─ SC-VectorSearch   → similarity >= 0.95?          │
│     ├─ JS-CheckCacheHit  → llm.cache.hit = true/false   │
│     ├─ LC-LookupCache    → Apigee distributed cache     │
│     └─ AM-CacheHitResponse (if full HIT)                │
│                                                          │
│  RouteRule:                                              │
│  ┌─ CacheHit: llm.cache.hit=true AND cachehit=true      │
│  │   → null route (return cached response directly)     │
│  └─ default → TargetEndpoint                            │
│                                                          │
│  TargetEndpoint PreFlow REQUEST:                         │
│  ⑤ JS-ModelRouter      → sets target.url (full Vertex   │
│     AI URL) + routing metadata                          │
│     copy.pathsuffix=false prevents path appending       │
│  ⑥ JS-RequestNormalizer → OpenAI→Gemini/Claude format   │
│  Authentication: GoogleAccessToken (SA: apigee-llm-sa)  │
│                                                          │
│  ProxyEndpoint PreFlow RESPONSE (cache MISS only):       │
│  ⑦ JS-ResponseNormalizer  → backend→OpenAI format       │
│  ⑧ FC-SemanticCachePopulate (SharedFlow)                │
│     ├─ JS-BuildCacheId        → FNV-1a hash             │
│     ├─ PC-PopulateCache       → store response 3600s    │
│     ├─ SC-GetEmbeddingPopulate → re-fetch embedding      │
│     ├─ JS-BuildUpsertPayload  → build VS upsert JSON    │
│     └─ SC-UpsertVector        → VS upsertDatapoints     │
│  ⑨ AM-AddObsHeaders  (x-cache, x-cache-score, etc.)    │
│  ⑩ ML-CloudLogging   → Cloud Logging JSON              │
└──────────────────────────────────────────────────────────┘
           │
           ▼
  Vertex AI Global Endpoint
  aiplatform.googleapis.com/v1/projects/{project}/locations/global/...
```

---

## Model Routing Table

JS-ModelRouter in TargetEndpoint PreFlow selects backend and sets `target.url`.

### Endpoint A — Gemini (generateContent)
`https://aiplatform.googleapis.com/v1/projects/{project}/locations/global/publishers/google/models/{model}:generateContent`

| Request `model` | Project | Backend Model ID |
|----------------|---------|-----------------|
| `gemini-3.1-pro-preview` | YOUR_PROJECT_ID | gemini-3.1-pro-preview |
| `gemini-3.1-flash-image-preview` | YOUR_PROJECT_ID | gemini-3.1-flash-image-preview |
| `gemini-3.1-flash-lite-preview` | YOUR_PROJECT_ID | gemini-3.1-flash-lite-preview |
| `gemini-3-pro-preview` | YOUR_PROJECT_ID | gemini-3-pro-preview |
| `gemini-3-flash-preview` | YOUR_PROJECT_ID | gemini-3-flash-preview |
| `gemini-2.5-pro` | YOUR_PROJECT_ID | gemini-2.5-pro |
| `gemini-2.5-flash` | YOUR_PROJECT_ID | gemini-2.5-flash |
| `gemini-2.5-flash-lite` | YOUR_PROJECT_ID | gemini-2.5-flash-lite |
| `gemini-2.5-flash-image` | YOUR_PROJECT_ID | gemini-2.5-flash-image |
| `gemini-2.0-flash-001` / `gemini-2.0-flash` | YOUR_PROJECT_ID | gemini-2.0-flash-001 |
| `gemini-2.0-flash-lite` | YOUR_PROJECT_ID | gemini-2.0-flash-lite |
| `YOUR_CROSS_PROJECT_ID/gemini-3.1-pro-preview` | **YOUR_CROSS_PROJECT_ID** | gemini-3.1-pro-preview |
| `YOUR_CROSS_PROJECT_ID/gemini-3.1-flash-lite-preview` | **YOUR_CROSS_PROJECT_ID** | gemini-3.1-flash-lite-preview |
| `YOUR_CROSS_PROJECT_ID/gemini-3-pro-preview` | **YOUR_CROSS_PROJECT_ID** | gemini-3-pro-preview |
| `YOUR_CROSS_PROJECT_ID/gemini-3-flash-preview` | **YOUR_CROSS_PROJECT_ID** | gemini-3-flash-preview |
| `YOUR_CROSS_PROJECT_ID/gemini-2.5-pro` | **YOUR_CROSS_PROJECT_ID** | gemini-2.5-pro |
| `YOUR_CROSS_PROJECT_ID/gemini-2.5-flash` | **YOUR_CROSS_PROJECT_ID** | gemini-2.5-flash |
| *(default/unknown)* | YOUR_PROJECT_ID | gemini-2.0-flash-001 |

### Endpoint B — Anthropic Claude (rawPredict)
`https://aiplatform.googleapis.com/v1/projects/YOUR_PROJECT_ID/locations/global/publishers/anthropic/models/{model}:rawPredict`

| Request `model` | Backend Model ID |
|----------------|-----------------|
| `claude-opus-4-6` | claude-opus-4-6 |
| `claude-sonnet-4-6` | claude-sonnet-4-6 |
| `claude-haiku-4-5` | claude-haiku-4-5 |
| `claude-opus-4-5` | claude-opus-4-5 |
| `claude-sonnet-4-5` | claude-sonnet-4-5 |
| `claude-opus-4` | claude-opus-4 |
| `claude-opus-4-1` | claude-opus-4-1 |

### Endpoint C — MaaS Partner Models (Vertex AI OpenAPI-compatible)
`https://aiplatform.googleapis.com/v1/projects/YOUR_PROJECT_ID/locations/global/endpoints/openapi/chat/completions`

Request format: `{"model": "publisher/model-id", "messages": [...], "max_tokens": N}` (OpenAI-compatible)
Response: OpenAI-compatible. Thinking models return `reasoning_content` instead of `content` — normalized automatically.

| Request `model` | `model` field sent to backend | Notes |
|----------------|------------------------------|-------|
| `glm-4.7` / `glm-4.7-maas` | `zai-org/glm-4.7-maas` | |
| `glm-5` / `glm-5-maas` | `zai-org/glm-5-maas` | thinking model |
| `deepseek-v3.2` / `deepseek-v3.2-maas` | `deepseek-ai/deepseek-v3.2-maas` | |
| `deepseek-ocr` / `deepseek-ocr-maas` | `deepseek-ai/deepseek-ocr-maas` | |
| `kimi-k2-thinking` / `kimi-k2-thinking-maas` | `moonshotai/kimi-k2-thinking-maas` | thinking model |
| `minimax-m2` / `minimax-m2-maas` | `minimaxai/minimax-m2-maas` | thinking model |
| `qwen3-235b` | `qwen/qwen3-235b-a22b-instruct-2507-maas` | |
| `qwen3-next-80b` | `qwen/qwen3-next-80b-a3b-instruct-maas` | |
| `qwen3-next-80b-think` | `qwen/qwen3-next-80b-a3b-thinking-maas` | thinking model |
| `qwen3-coder` | `qwen/qwen3-coder-480b-a35b-instruct-maas` | |

### Endpoint D — OpenCode Zen (free, no auth)
`https://opencode.ai/zen/v1/chat/completions`

`x-api-key` and `Authorization` headers are stripped; `opencode/` prefix removed from model field.

| Request `model` | Backend Model | Provider |
|----------------|--------------|----------|
| `opencode/nemotron-3-super-free` | `nemotron-3-super-free` | Nvidia |
| `opencode/big-pickle` | `big-pickle` | Minimax |
| `opencode/minimax-m2.5-free` | `minimax-m2.5-free` | Minimax |
| `opencode/mimo-v2-flash-free` | `mimo-v2-flash-free` | MiMo |
| `opencode/mimo-v2-pro-free` | `mimo-v2-pro-free` | MiMo |
| `opencode/mimo-v2-omni-free` | `mimo-v2-omni-free` | MiMo |
| `opencode/trinity-large-preview-free` | `trinity-large-preview-free` | Trinity |

---

## Request/Response Format

### Client sends (OpenAI-compatible)
```json
POST /v1/chat/completions
x-api-key: <key>

{
  "model": "gemini-2.5-pro",
  "messages": [{"role": "user", "content": "Hello"}],
  "max_tokens": 1024
}
```

### Apigee normalizes per backend
- **Gemini**: `contents[]` + `generationConfig`
- **Claude**: Anthropic format with `anthropic_version: "vertex-2023-10-16"`
- **MaaS models** (GLM/DeepSeek/Kimi/etc): OpenAI-compatible passthrough

### Client receives (OpenAI-compatible)
```json
{
  "id": "chatcmpl-...",
  "object": "chat.completion",
  "model": "gemini-2.5-pro",
  "choices": [{"index":0,"message":{"role":"assistant","content":"..."},"finish_reason":"stop"}],
  "usage": {"prompt_tokens":10,"completion_tokens":50,"total_tokens":60}
}
```

### Response headers
```
x-cache: HIT | MISS
x-cache-score: 0.9999979   (similarity score, only on HIT)
x-llm-model: gemini-2.5-pro
x-llm-project: YOUR_PROJECT_ID
```

---

## Semantic Cache Implementation

### Flow
```
REQUEST:
  prompt text
    → text-embedding-004 (768-dim vector)
    → Vector Search findNeighbors (deployed_index_id=llm_semantic_cache)
    → similarity >= 0.95?
        YES → LookupCache by neighbor datapointId
              → cachehit? → return cached OpenAI response (x-cache: HIT)
        NO  → forward to LLM

RESPONSE (cache MISS):
  LLM response
    → JS-ResponseNormalizer → OpenAI format
    → PC-PopulateCache (key=FNV-1a hash of "model:prompt", TTL=3600s)
    → text-embedding-004 (re-fetch embedding)
    → VS upsertDatapoints (datapointId = same FNV-1a hash)
    → x-cache: MISS
```

### Cache Key
```
FNV-1a hash of: "{model}:{prompt_text}"
Example: FNV1a("gemini-2.0-flash-001:What is the capital of France?")
       = "8f3f1d7c9ec3e368"
```

### Similarity Test Results
| Prompt | Similarity | Result |
|--------|------------|--------|
| "What is the capital of France?" (same) | 0.9999979 | HIT |
| "Tell me the capital city of France." (paraphrase) | 0.9999980 | HIT |
| Same Q, different model | different key | MISS |

### Vector Search Stream Update Delay
Upserted vectors take **~60 seconds** to become queryable in findNeighbors.

---

## Phase Progress

| Phase | Status | Details |
|-------|--------|---------|
| **Phase 1** — Infrastructure | ✅ Done | VPC, Apigee X, Vector Search, LB, SSL |
| **Phase 2** — Auth + Routing | ✅ Done | API Key, multi-model routing (4 endpoints), OpenAI normalization |
| **Phase 3** — Semantic Cache | ✅ Done | Vector Search + Apigee Cache, HIT/MISS confirmed |
| **Phase 4** — Observability | ✅ Done | Log-based metrics, Monitoring dashboard, 3 alert policies, error logging fix |
| **Phase 5** — Testing | ✅ Done | 75 tests, 71 passed, 0 failed, 4 skipped (quota) |
| **Phase 6** — Admin UI | ✅ Done | Next.js 15.2.3, IAP, Cloud Run, Dashboard+Keys+Quota |
| **Extra** — Token Quota | ✅ Done | App/Product级 token 配额，模型权重，effectiveTokens |
| **Extra** — Latency Logging | ✅ Done | JS-ComputeLatency, totalLatencyMs/targetLatencyMs |
| **Extra** — OpenCode Zen | ✅ Done | 7 free third-party models, no quota cost |
| **Extra** — Vertex AI OpenAPI | ✅ Done | 10 MaaS partner models via unified OpenAPI endpoint |
| **Extra** — Image Generation | ✅ Done | gemini-2.5-flash-image + gemini-3.1-flash-image-preview，inlineData→image_url |
| **Extra** — Streaming | ✅ Done | stream:true → SSE passthrough，Gemini/Claude/MaaS/OpenCode 全支持 |
| **Extra** — Error Transparency | ✅ Done | error.source:"gateway"/"model"，FaultRule fix，success.codes，后端错误规范化 |

---

## Directory Structure

```
llm-apigee/
├── CLAUDE.md
├── infra/
│   ├── 01-enable-apis.sh
│   ├── 02-provision-apigee.sh
│   ├── 05-create-environment.sh
│   ├── 06-setup-load-balancer.sh
│   ├── apigee.env              ← Apigee config (host, org, env, VS IDs)
│   └── api-key.env             ← API key (API_KEY=...)
├── apigee/
│   ├── proxies/
│   │   └── llm-gateway/
│   │       └── apiproxy/
│   │           ├── llm-gateway.xml
│   │           ├── proxies/default.xml     ← flow orchestration
│   │           ├── targets/default.xml     ← Vertex AI target + auth
│   │           ├── policies/               ← 16 policies (incl. JS-DetectStreaming)
│   │           └── resources/jsc/
│   │               ├── model-router.js        ← routing table (incl. streaming URL switch)
│   │               ├── request-normalizer.js  ← generateContent + streamGenerateContent
│   │               ├── response-normalizer.js ← text + inlineData (image) parts
│   │               └── detect-streaming.js   ← sets llm.streaming before cache lookup
│   └── sharedflows/
│       ├── SemanticCache-Lookup/
│       │   └── sharedflowbundle/
│       │       ├── policies/               ← 7 policies
│       │       └── resources/jsc/
│       │           ├── extract-prompt.js
│       │           ├── build-vs-payload.js  ← parse embedding + build VS query
│       │           └── check-cache-hit.js
│       └── SemanticCache-Populate/
│           └── sharedflowbundle/
│               ├── policies/               ← 6 policies
│               └── resources/jsc/
│                   ├── build-cache-id.js   ← FNV-1a hash + build embed request
│                   ├── build-upsert-payload.js ← parse embed response + build upsert
│                   └── check-upsert-response.js
└── tests/
│   └── run-tests.sh               ← 75 tests, 15 sections
```

---


---

## 基础设施费用估算（月度，不含 LLM 调用费用）

> 费用以 us-central1、单实例、正常业务流量为基准。模型 token 费用按实际用量另计。

### 固定基础设施成本

| 组件 | 规格 | 月度估算 | 备注 |
|------|------|---------|------|
| **Apigee X** | eval org (CLOUD runtime) | **$0**（试用期） | 正式商用约 $1,000+/月起 |
| **Vector Search** | 1 节点，automaticResources | **$65–$110/月** | ~$0.09/节点小时 × 720h |
| **Global HTTPS LB** | 2 forwarding rules (443 + 80 redirect) | **~$36/月** | $0.025/规则/小时 |
| **Cloud Logging** | API 请求日志 | **$0**（< 50 GiB/月免费） | 超量 $0.50/GiB |
| **Secret Manager** | API key 存储（若迁入） | **< $1/月** | $0.06/万次访问 |
| **合计（不含模型）** | | **~$100–$145/月** | eval 环境 |

### 语义缓存增量成本

每次请求触发 **1–2 次 Embedding API 调用**（Lookup 1次 + 缓存未命中时 Populate 1次）：

| 场景 | 每百万请求 Embedding 费用 | 说明 |
|------|--------------------------|------|
| 全部缓存未命中（最差情况） | **$0.05** | text-embedding-004: $0.025/1M chars，平均 prompt ~200 chars |
| 50% 缓存命中率 | **$0.025** | Lookup 1次/请求，Populate 仅未命中时触发 |
| 80%+ 缓存命中率 | **$0.015** | 语义缓存达到稳态后 |

> text-embedding-004 计费：$0.000025 / 1K 字符（等效约 $0.10 / 1M tokens）

### 语义缓存收益估算

| 缓存命中率 | 节省的 LLM 调用比例 | 典型适用场景 |
|-----------|-------------------|-------------|
| 30–50% | 30–50% token 费用 | 企业内部知识问答、FAQ |
| 60–80% | 60–80% token 费用 | 产品文档、固定模板问答 |
| < 10% | 有限收益 | 创意生成、个性化对话 |

### OpenCode Zen 免费模型

`opencode/*` 前缀模型全部**免费**，无 token 计费，仅受 OpenCode 平台限速约束：

| 模型 | 费用 |
|------|------|
| `opencode/nemotron-3-super-free` | **$0** |
| `opencode/big-pickle` | **$0** |
| `opencode/minimax-m2.5-free` | **$0** |
| `opencode/mimo-v2-flash-free` | **$0** |
| `opencode/trinity-large-preview-free` | **$0** |

---

## Critical Apigee X Lessons Learned

### 1. `target.url` must be set in TargetEndpoint PreFlow
Setting `target.url` in JavaScript in the **ProxyEndpoint** PreFlow is **ignored** at target request time. Must be set in the **TargetEndpoint** PreFlow.

### 2. `copy.pathsuffix=false` is required
Without this property in `HTTPTargetConnection`, Apigee appends the proxy path suffix (`/chat/completions`) to `target.url`, causing 404 on the backend.

```xml
<Properties>
  <Property name="copy.pathsuffix">false</Property>
</Properties>
```

### 3. `<Payload ref="variable"/>` does NOT work in ServiceCallout
Using `<Payload ref="variable_name"/>` sends an empty body regardless of variable value. Use template syntax instead:

```xml
<!-- WRONG: sends empty body -->
<Payload ref="llm.cache.vs_payload"/>

<!-- CORRECT: substitutes variable value -->
<Payload contentType="application/json">{llm.cache.vs_payload}</Payload>
```

This applies to ALL ServiceCallout policies including those in SharedFlows.

### 4. Use `lookupcache.LC-LookupCache.cachehit` for true cache hit
The `llm.cache.hit` variable is set by Vector Search similarity check alone. The Apigee distributed cache might still miss (different sessions, expired TTL). Use `lookupcache.LC-LookupCache.cachehit = true` for conditional routing:

```xml
<!-- CORRECT: only skip populate when BOTH VS and Apigee cache hit -->
<Condition>NOT (lookupcache.LC-LookupCache.cachehit = true)</Condition>
```

### 5. Vector Search `findNeighbors` requires `deployed_index_id`
Without `deployed_index_id` in the request body, VS returns 400 `deployed_index_id is empty`.

```json
{"deployed_index_id": "llm_semantic_cache", "queries": [...]}
```

### 6. EV-ExtractVariables is unreliable for JSON arrays
`ExtractVariables` with `type="string"` on a JSON array may not parse correctly in JavaScript. Parse the full response content directly in JS instead:

```javascript
var embedContent = context.getVariable("embeddingResponse.content");
var vals = JSON.parse(embedContent).predictions[0].embeddings.values;
```

### 7. Apigee Service Agent needs `roles/iam.serviceAccountTokenCreator`
For `Authentication.GoogleAccessToken` to work with a custom SA, grant:
```bash
gcloud iam service-accounts add-iam-policy-binding $SA_EMAIL \
  --member="serviceAccount:service-YOUR_PROJECT_NUMBER@gcp-sa-apigee.iam.gserviceaccount.com" \
  --role="roles/iam.serviceAccountTokenCreator"
```

### 8. ~~AM-AuthError needs `createNew="true"`~~ — DO NOT use `createNew="true"` in FaultRules on Apigee X
**Correction (rev 56):** `createNew="true"` creates a new message object, but Apigee X sends the original
fault message to the client — the new message is discarded. Remove `createNew="true"` so AssignMessage
modifies the existing fault response in-place:

```xml
<!-- WRONG on Apigee X — creates new msg but original fault is sent -->
<AssignTo createNew="true" transport="http" type="response"/>

<!-- CORRECT — modifies the fault response in-place -->
<AssignTo transport="http" type="response"/>
```

### 9. RouteRule is evaluated BEFORE TargetEndpoint PreFlow — backend detection must happen earlier
`RouteRule` conditions are evaluated in the **ProxyEndpoint**, so any variable used to select a TargetEndpoint
(e.g., `llm.backend = "opencode"`) must be set in the **ProxyEndpoint PreFlow**, not the TargetEndpoint PreFlow.
Use a dedicated lightweight JS policy (`JS-DetectBackend`) for this purpose:

```javascript
// JS-DetectBackend — runs in ProxyEndpoint PreFlow
var model = context.getVariable("llm.model") || "";
context.setVariable("llm.backend",
    model.indexOf("opencode/") === 0 ? "opencode" : "vertex");
```

Then in ProxyEndpoint:
```xml
<RouteRule name="OpenCode">
  <Condition>llm.backend = "opencode"</Condition>
  <TargetEndpoint>opencode</TargetEndpoint>
</RouteRule>
```

### 10. FaultRule PostFlow does NOT run — log errors inside FaultRules explicitly
When a FaultRule handles a fault (e.g., 401 from VerifyAPIKey), the ProxyEndpoint **PostFlow does not execute**.
`ML-CloudLogging` in PostFlow will never capture 4xx/5xx errors. Add logging as a step inside each FaultRule,
and set the status code explicitly before logging (since `response.status.code` is empty in fault context):

```xml
<FaultRule name="AuthFailure">
  <Step><Name>AM-AuthError</Name></Step>
  <Step><Name>AM-SetAuthStatusForLog</Name></Step>  <!-- sets llm.log_status_code = 401 -->
  <Step><Name>ML-CloudLogging</Name></Step>
</FaultRule>
```

### 11. Vertex AI has a unified OpenAPI-compatible endpoint for all MaaS partner models
Instead of per-model `rawPredict` URLs, all MaaS models share one endpoint with OpenAI-compatible format:

```
POST https://aiplatform.googleapis.com/v1/projects/{PROJECT}/locations/global/endpoints/openapi/chat/completions
{"model": "publisher/model-id", "messages": [...], "max_tokens": N}
```

Examples: `"model": "zai-org/glm-5-maas"`, `"model": "moonshotai/kimi-k2-thinking-maas"`

- Higher success rate than individual `rawPredict` endpoints
- Response: standard OpenAI format; thinking models return `reasoning_content` instead of `content`
- Handle null content: extract from `reasoning_content` (Vertex) or `reasoning_details[].text` (OpenCode)

### 13. Image generation models require `responseModalities` in `generationConfig`
Gemini image models (`gemini-2.5-flash-image`, `gemini-3.1-flash-image-preview`) return text only unless
`generationConfig.responseModalities: ["TEXT","IMAGE"]` is set. Inject automatically in `JS-RequestNormalizer`
based on `llm.resolved_model` (available because `JS-ModelRouter` runs first in TargetEndpoint PreFlow):

```javascript
var imageModels = ["gemini-3.1-flash-image-preview", "gemini-2.5-flash-image"];
if (!responseModalities && imageModels.indexOf(resolvedModel) !== -1) {
  responseModalities = ["TEXT", "IMAGE"];
}
```

### 14. Image responses contain `inlineData` parts — normalize to OpenAI content array
Gemini image response parts look like: `{"inlineData": {"mimeType": "image/png", "data": "<base64>"}}`.
The response normalizer must detect these and return an OpenAI content array instead of joining as plain text:

```javascript
// response-normalizer.js — Gemini generateContent branch
var hasImage = parts.some(function(p) { return p.inlineData; });
if (hasImage) {
  // Build [{type:"text",text:"..."}, {type:"image_url",image_url:{url:"data:image/png;base64,..."}}]
  context.setVariable("llm.has_image", "true");  // flag for cache bypass
}
```

Model behavior differences:
- `gemini-2.5-flash-image`: returns 1 image part (pure image, minimal text)
- `gemini-3.1-flash-image-preview`: returns multiple text (thinking) + 2 image parts

### 15. Image responses must bypass semantic cache
Image payloads are ~1MB+ — caching them in Apigee's distributed cache is wasteful.
Set `llm.has_image = "true"` in response-normalizer.js, then exclude in `FC-SemanticCachePopulate` condition:

```xml
<Condition>... AND NOT (llm.has_image = "true")</Condition>
```

### 16. Streaming in Apigee X requires skipping ALL response-side policies
Any JavaScript or AssignMessage policy in the ProxyEndpoint response PreFlow **or** PostFlow causes
Apigee to buffer the complete response before sending to the client. For SSE passthrough, ALL of the
following must be skipped when `llm.streaming = "true"`:

**PreFlow response:** `JS-ResponseNormalizer`, `JS-ComputeEffectiveTokens`, `Q-TokenQuotaCounter`,
`FC-SemanticCachePopulate`, `AM-AddObsHeaders`

**PostFlow response:** `AM-SetStatusForLog`, `JS-ComputeLatency`, `ML-CloudLogging`

Add `AND NOT (llm.streaming = "true")` to every one of these policy conditions.

### 17. Gemini streaming: use `streamGenerateContent?alt=sse`, not `streamGenerateContent`
Without `?alt=sse`, `streamGenerateContent` returns a JSON array format (multiple objects joined with `,`),
not SSE. With `?alt=sse`, it returns proper `data: {...}` SSE chunks with `Content-Type: text/event-stream`.
Keep `llm.action = "generateContent"` (for request-normalizer logic); `?alt=sse` lives in `target.url` only.

```javascript
// model-router.js — Gemini branch
var geminiAction = isStreaming ? "streamGenerateContent?alt=sse" : "generateContent";
var geminiUrl = VA_BASE + "/.../models/" + gr.model + ":" + geminiAction;
context.setVariable("llm.action", "generateContent");  // NOT "streamGenerateContent"
```

Streaming SSE format per backend:
- **Gemini**: `data: {"candidates":[{"content":{"parts":[{"text":"..."}]}}]}`
- **Claude**: `event: content_block_delta` / `data: {"type":"content_block_delta",...}`
- **MaaS/OpenCode**: `data: {"choices":[{"delta":{"content":"..."}}]}` (OpenAI-compat)

### 18. Backend 4xx/5xx responses bypass ProxyEndpoint PreFlow — add `success.codes`
By default in Apigee X Cloud Runtime, backend error responses (4xx/5xx) do **NOT** go through the
ProxyEndpoint response PreFlow. Response policies like `JS-ResponseNormalizer` and `AM-AddObsHeaders`
are silently skipped. The raw backend error body is passed through to the client as-is.

**Fix:** add `success.codes` to `HTTPTargetConnection` in ALL TargetEndpoints:

```xml
<HTTPTargetConnection>
  <Properties>
    <Property name="copy.pathsuffix">false</Property>
    <!-- Treat ALL HTTP codes as "success" so response PreFlow runs for backend errors -->
    <Property name="success.codes">1xx,2xx,3xx,4xx,5xx</Property>
  </Properties>
</HTTPTargetConnection>
```

Applies to both `targets/default.xml` (Vertex AI) and `targets/opencode.xml` (OpenCode Zen).

### 19. Normalize backend errors to `{"error":{...,"source":"model"}}` in JS-ResponseNormalizer
After adding `success.codes`, backend 4xx/5xx go through `JS-ResponseNormalizer`. Add a `statusCode >= 400`
branch that extracts the error message from the backend-specific format and wraps it consistently:

```javascript
if (statusCode >= 400) {
  var errBody = JSON.parse(context.getVariable("response.content") || "{}");
  var errObj  = errBody.error || errBody;
  var normalized = { error: {
    message: errObj.message || "Upstream model error (HTTP " + statusCode + ")",
    type:    "upstream_error",
    code:    statusCode === 429 ? "upstream_rate_limit" : "upstream_error",
    source:  "model"   // ← clearly "model", not "gateway"
  }};
  context.setVariable("response.content", JSON.stringify(normalized));
}
```

Add `"source":"gateway"` to AM-AuthError, AM-QuotaError, AM-TokenQuotaError payloads.
Client error taxonomy:
- `source:gateway, type:rate_limit_error`       → Apigee RPM quota
- `source:gateway, type:token_quota_exceeded`   → Apigee token quota
- `source:gateway, type:invalid_request_error`  → bad/missing API key
- `source:model, code:upstream_rate_limit`      → backend 429 (model's own quota)
- `source:model, code:upstream_error`           → other backend 4xx/5xx

### 12. Third-party free models via OpenCode Zen (no auth required)
Endpoint: `https://opencode.ai/zen/v1/chat/completions` — **no Bearer token needed** for free models.
Route via a separate TargetEndpoint with no `<Authentication>` element.
Strip client's `x-api-key` header before forwarding (Apigee passes all client headers by default):

```xml
<AssignMessage name="AM-StripAuthHeader">
  <Remove>
    <Headers>
      <Header name="x-api-key"/>
      <Header name="Authorization"/>
    </Headers>
  </Remove>
</AssignMessage>
```

---


## Test Results (Phase 5)

Run: `source infra/api-key.env && bash tests/run-tests.sh`

| Section | Tests | Result |
|---------|-------|--------|
| 1. Health Check | 3 | ✅ PASS |
| 2. Authentication | 3 | ✅ PASS |
| 3. Response Format (OpenAI-compat) | 7 | ✅ PASS |
| 4. Model Routing — Gemini | 9 | ✅ PASS |
| 5. Model Routing — Claude | 5 | ✅ PASS |
| 6. Model Routing — MaaS | 10 | ✅ PASS |
| 7. Cross-project (YOUR_CROSS_PROJECT_ID) | 3 | ✅ PASS |
| 8. OpenCode Zen free models | 5 | ✅ PASS |
| 9. Default Fallback | 2 | ✅ PASS |
| 10. Request Format Normalization | 4 | ✅ PASS |
| 11. Semantic Cache (HIT/MISS/similar/cross-model) | 4 | ✅ PASS |
| 12. Observability — Cloud Logging | 2 | ✅ PASS |
| 13. Token Quota | 6 | ✅ PASS |
| 14. Image Generation | 3 | ✅ PASS |
| 15. Streaming | 9 | ✅ PASS |
| **Total** | **71 passed, 0 failed, 4 skipped (quota)** | **✅ ALL PASS** |

---

## Test Commands

```bash
source infra/api-key.env   # loads API_KEY
HOST=YOUR_LB_IP.nip.io

# Health check
curl -sk https://$HOST/v1/health

# API key auth test
curl -sk -X POST https://$HOST/v1/chat/completions \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"gemini-2.0-flash-001","messages":[{"role":"user","content":"Hi"}],"max_tokens":20}'

# Cross-project routing
curl -sk -X POST https://$HOST/v1/chat/completions \
  -H "x-api-key: $API_KEY" -H "Content-Type: application/json" \
  -d '{"model":"YOUR_CROSS_PROJECT_ID/gemini-2.5-pro","messages":[{"role":"user","content":"Hi"}],"max_tokens":20}'

# Semantic cache test (run twice, second should be x-cache: HIT after ~60s)
curl -sk -X POST https://$HOST/v1/chat/completions \
  -H "x-api-key: $API_KEY" -H "Content-Type: application/json" \
  -D - \
  -d '{"model":"gemini-2.0-flash-001","messages":[{"role":"user","content":"What is the capital of France?"}],"max_tokens":50}' \
  2>/dev/null | grep -E "x-cache|x-cache-score"

---

## Admin UI (Phase 6 — Planned)

### 概述

基于 Web 的网关管理控制台，提供 API Key 管理、配额配置、Dashboard 监控。
通过 Google IAP 认证，部署在 Cloud Run。

### 功能范围

| 优先级 | 页面 | 功能 |
|--------|------|------|
| **P0** | `/` Dashboard | 请求量/token用量/缓存命中率/P95延迟实时图；模型状态；近期活动流 |
| **P1** | `/keys` API Key 管理 | 查看/创建/撤销 API Key；token 配额进度条；状态标签 |
| **P1** | `/quota` 配额配置 | 按 API Product 设置 token 配额；模型权重系数编辑 |
| **P2** | `/logs` 请求日志 | 结构化日志查看，按模型/App/状态码过滤 |
| **P3** | `/models` 模型管理 | 路由表配置；实时状态探测 |
| **P3** | `/cache` 缓存配置 | 相似度阈值；TTL；手动 invalidate |

### 技术栈

```
前端框架:  Next.js 15.2.3+（React 19）
           ⚠️ 必须 ≥ 15.2.3，修复 CVE-2025-29927 中间件绕过漏洞
UI 组件:   shadcn/ui + Tailwind CSS
图表:      Recharts
语言:      TypeScript
```

**Next.js 版本安全说明（CVE-2025-29927）**
攻击者可通过 `x-middleware-subrequest` header 绕过所有 `middleware.ts` 认证检查。
受影响: `< 14.2.25` 和 `15.x < 15.2.3`。修复版本: `15.2.3+`。
因此固定使用 `"next": "15.2.3"` 并配置双重防线（见认证方案）。

### 数据来源

| 数据 | 来源 API |
|------|---------|
| 请求量/延迟/缓存命中率 | Cloud Monitoring API — `llm_request_count`, `llm_token_usage` |
| 请求日志详情 | Cloud Logging API — `llm-gateway-requests` |
| API Key / App 列表 | Apigee Management API — `/developers`, `/apps` |
| 配额配置 | Apigee Management API — `/apiproducts/{product}/attributes` |
| 模型状态 | 实时探测 gateway endpoint |

### 认证架构（IAP + 纵深防御）

```
Browser
  ↓
Cloud Load Balancer (IAP 开启)
  ↓ 未认证 → Google 登录页
  ↓ 已认证 → 注入 X-Goog-Authenticated-User-Email / X-Goog-IAP-JWT-Assertion
Cloud Run (Next.js)
  ↓
lib/auth.ts — 每个 Route Handler 独立验证 IAP header（不依赖 middleware）
```

**关键原则**：IAP 是主防线（GCP 基础设施层），Next.js 层做纵深防御。
不将 `middleware.ts` 作为唯一认证点，每个 Server Component/Route Handler 自行验证。

```typescript
// lib/auth.ts
export function requireIAP(req: Request): string {
  // Cloud Run 本地开发绕过（仅 localhost）
  if (process.env.NODE_ENV === 'development') return 'dev@local';
  const email = req.headers.get('x-goog-authenticated-user-email');
  if (!email) throw new Error('Unauthorized: missing IAP header');
  return email.replace('accounts.google.com:', '');
}
```

### 部署状态（已上线）

| 组件 | 状态 | 详情 |
|------|------|------|
| Cloud Run 服务 | ✅ | `llm-gateway-ui`，us-central1，SA: apigee-llm-sa |
| Artifact Registry | ✅ | `us-central1-docker.pkg.dev/YOUR_PROJECT_ID/llm-gateway/admin-ui` |
| 静态 IP | ✅ | `YOUR_UI_LB_IP`（llm-gateway-ui-ip）|
| Serverless NEG | ✅ | `llm-gateway-ui-neg` → Cloud Run |
| HTTPS Load Balancer | ✅ | `llm-gateway-ui-backend` + `llm-gateway-ui-urlmap` |
| SSL 证书 | ✅ ACTIVE | `llm-gateway-ui-cert`，域名 `YOUR_UI_LB_IP.nip.io` |
| IAP | ✅ 已启用 | `roles/iap.httpsResourceAccessor` → your-email@example.com |
| SA 权限 | ✅ | roles/apigee.developerAdmin + roles/apigee.apiAdminV2 + logging/monitoring viewer |
| **管理控制台 URL** | ✅ **上线** | **https://YOUR_UI_LB_IP.nip.io** |

Cloud Run 直接 URL（无 IAP，仅内部使用）：
`https://YOUR_CLOUD_RUN_URL.run.app`

SA 追加权限：`roles/logging.viewer`、`roles/monitoring.viewer`

### 项目目录结构

```
ui/
├── app/
│   ├── layout.tsx              ← 全局布局（Sidebar + Topbar）
│   ├── page.tsx                ← Dashboard (P0)
│   ├── keys/
│   │   ├── page.tsx            ← API Key 列表 (P1)
│   │   └── [appId]/page.tsx   ← Key 详情 + 操作
│   └── quota/
│       └── page.tsx            ← 配额配置 (P1)
├── components/
│   ├── layout/                 ← Sidebar, Topbar
│   ├── dashboard/              ← MetricCard, RequestChart, ModelStatus, ActivityFeed
│   ├── keys/                   ← KeyTable, NewKeyDialog, RevokeDialog
│   ├── quota/                  ← QuotaEditor, WeightTable
│   └── ui/                    ← shadcn/ui primitives
├── lib/
│   ├── auth.ts                 ← IAP header 验证
│   ├── apigee.ts               ← Apigee Management API client
│   ├── logging.ts              ← Cloud Logging API client
│   └── monitoring.ts           ← Cloud Monitoring API client
├── Dockerfile
├── cloudbuild.yaml
└── package.json                ← "next": "15.2.3"
```

### UI 设计规范

**主题**：「命令中枢」—— 深空黑底 + 电光绿数据色
原型文件：`ui-prototype.html`（可在浏览器直接预览）

```css
/* 核心色彩变量 */
--bg-base:   #07090f   /* 主背景，带隐约网格纹理 */
--bg-card:   #0c1019   /* 卡片背景 */
--border:    #1c2a3a   /* 边框 */
--green:     #00e87a   /* 主数据色：在线状态/正常指标 */
--blue:      #3d9eff   /* 辅助：链接/次要数据 */
--amber:     #f59e0b   /* 告警色 */
--red:       #f43f5e   /* 错误色 */

/* 字体 */
--font-display: 'Syne'         /* 标题，粗重几何体 */
--font-mono:    'IBM Plex Mono' /* 数据/Key/代码，终端感 */
--font-body:    'IBM Plex Sans' /* 正文 */
```

### 关键实现注意事项

1. **Server Components 优先** — 直接在服务端调用 GCP SDK，避免 credentials 暴露给浏览器
2. **`middleware.ts` 不做认证** — 仅做路由重定向，实际验证在各 Route Handler 内
3. **Apigee Management API 限速** — 批量操作要加 debounce，避免触发 API 限额
4. **Cloud Run 环境变量** — 不在代码中硬编码 PROJECT_ID，通过 `GOOGLE_CLOUD_PROJECT` 注入
5. **ISR 缓存策略** — Dashboard 指标数据 30s 刷新，日志数据不缓存（实时）

---

## 新增关键经验（2026-03-23）

### Apigee 属性写入
- `PUT /apiproducts/{product}/attributes/{attr}` 对不存在属性返回 404
- 正确方式：`POST /apiproducts/{product}/attributes` 批量写入（合并现有属性后整体 POST）
- 并发调用 setProductAttribute 会产生竞争写入（各自读旧状态再覆盖）→ 必须合并为单次批量调用

### Gemini Thinking 模型
- gemini-2.5-flash/pro 等默认开启 thinking，thinking tokens 计入 maxOutputTokens
- max_tokens=30 时 thinking 可消耗全部 budget，返回空 content（finishReason=MAX_TOKENS）
- 禁用方式：`generationConfig.thinkingConfig.thinkingBudget = 0`
- Admin UI 的自动生成权重功能使用此配置

### Cloud Monitoring 指标类型
- `llm_request_count`：DELTA 类型，用 ALIGN_DELTA（不是 ALIGN_RATE）
- `llm_token_usage`：DELTA+DISTRIBUTION 类型，用 ALIGN_DELTA + distributionValue.mean 提取均值
- ALIGN_RATE 返回每秒速率（小数），显示很难看

### 语义缓存空内容 Bug
- 问题：Gemini 3.x 思维模型 max_tokens=30 时返回空 content，被缓存后后续请求命中空缓存
- 修复：`FC-SemanticCachePopulate` 条件加 `AND (llm.completion_tokens > 0)`

### JS-ComputeLatency
- 必须设置 `continueOnError="true"`，否则 system.timestamp 变量访问失败导致全局 500
- 变量名：`client.received.start.timestamp`、`target.sent.start.timestamp`、`target.received.end.timestamp`

### setProductAttribute 并发竞争
- 原因：多次并行调用各自读旧状态再覆盖，只有最后一次写入生效
- 修复：`setProductAttributes(name, updates: Record<string,string>)` 一次读一次写
```
