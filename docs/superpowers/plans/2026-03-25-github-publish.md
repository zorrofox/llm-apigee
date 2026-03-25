# GitHub Publish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Push the llm-apigee project to GitHub, handling all sensitive information appropriately.

**Architecture:** Two-tier approach — (A) mandatory secrets handling for any repo visibility, (B) project-ID parameterization required only for public/template repos. CLAUDE.md stays as-is (it's the project memory). All Apigee XML files that hardcode project-specific URLs get placeholder-based substitution via a one-time `infra/configure.sh` setup script.

**Tech Stack:** git, GitHub CLI (`gh`), bash

---

## Decision Point — Repo Visibility

> **Confirm before executing:**
> - **Private repo** → execute Tasks 1–3 only (secrets + git + push)
> - **Public repo (OSS template)** → execute all Tasks 1–6

---

## Sensitive Information Audit

| Category | Files | Risk | Action |
|----------|-------|------|--------|
| **True secret** | `infra/api-key.env` (actual API key) | CRITICAL | gitignore + provide `.example` |
| **Infra config** | `infra/apigee.env` (project IDs, VS IDs, IPs) | Medium | gitignore + provide `.example` |
| **Apigee XML URLs** | `SC-GetEmbedding.xml`, `SC-VectorSearch.xml`, `SC-UpsertVector.xml`, `SC-GetEmbeddingPopulate.xml`, `ML-CloudLogging.xml` | Medium (public only) | Replace with `YOUR_*` placeholders |
| **JS routing table** | `model-router.js` — `PROJECT_02 = "grhuang-02"`, `PROJECT_GH = "grhuang"` | Low–Medium | Replace with `YOUR_PROJECT_ID` |
| **UI fallbacks** | `ui/lib/*.ts`, `ui/app/*.tsx` — `?? 'grhuang-02'` and `parent="grhuang-02"` | Low (env-var driven) | Replace with `''` + README note |
| **Browser logs** | `.playwright-mcp/` | Low | gitignore |
| **README examples** | project IDs in curl/gcloud examples | Low (docs only) | Replace with `YOUR_PROJECT_ID` |
| **CLAUDE.md** | Deployment status, IPs, VS IDs | Info only | Keep (private) or sanitize (public) |

---

## File Map

### Task 1 (always): Secrets + .gitignore
- Create: `.gitignore`
- Create: `infra/api-key.env.example`
- Create: `infra/apigee.env.example`

### Task 2 (always): Git init + initial commit
- Run: `git init`, `git add`, `git commit`

### Task 3 (always): Create GitHub repo + push
- Run: `gh repo create`, `git push`

### Task 4 (public only): Parameterize Apigee XML policies
- Modify: `apigee/sharedflows/SemanticCache-Lookup/sharedflowbundle/policies/SC-GetEmbedding.xml`
- Modify: `apigee/sharedflows/SemanticCache-Lookup/sharedflowbundle/policies/SC-VectorSearch.xml`
- Modify: `apigee/sharedflows/SemanticCache-Populate/sharedflowbundle/policies/SC-GetEmbeddingPopulate.xml`
- Modify: `apigee/sharedflows/SemanticCache-Populate/sharedflowbundle/policies/SC-UpsertVector.xml`
- Modify: `apigee/proxies/llm-gateway/apiproxy/policies/ML-CloudLogging.xml`
- Modify: `apigee/proxies/llm-gateway/apiproxy/resources/jsc/model-router.js`
- Create: `infra/configure.sh` (placeholder substitution script)

### Task 5 (public only): Parameterize UI + tests
- Modify: `ui/lib/monitoring.ts`, `ui/lib/model-status.ts`, `ui/lib/cache-stats.ts`, `ui/lib/model-routing.ts`, `ui/lib/alerts.ts`, `ui/lib/apigee.ts`, `ui/lib/logging.ts`
- Modify: `ui/app/api/apps/route.ts`, `ui/app/api/cache/route.ts`, `ui/app/api/keys/route.ts`, `ui/app/api/weights/generate/route.ts`, `ui/app/api/alerts/route.ts`, `ui/app/api/quota/app/route.ts`
- Modify: `ui/app/page.tsx`, `ui/app/cache/page.tsx`, `ui/app/keys/page.tsx`, `ui/app/logs/page.tsx`, `ui/app/models/page.tsx`, `ui/app/alerts/page.tsx`, `ui/app/quota/page.tsx`, `ui/app/layout.tsx`
- Modify: `tests/run-tests.sh`

### Task 6 (public only): Sanitize README + commit + push
- Modify: `README.md`
- Run: `git commit`, `git push`

---

## Task 1: Secrets + .gitignore

**Files:**
- Create: `.gitignore`
- Create: `infra/api-key.env.example`
- Create: `infra/apigee.env.example`

- [ ] **Step 1.1: Create root .gitignore**

```bash
cat > /home/greg_greghuang_altostrat_com/llm-apigee/.gitignore << 'EOF'
# Secrets — never commit
infra/api-key.env
infra/apigee.env

# Browser session logs
.playwright-mcp/

# UI build artifacts
ui/node_modules/
ui/.next/
ui/tsconfig.tsbuildinfo

# OS
.DS_Store
EOF
```

- [ ] **Step 1.2: Create infra/api-key.env.example**

```bash
cat > /home/greg_greghuang_altostrat_com/llm-apigee/infra/api-key.env.example << 'EOF'
# Apigee API key for the llm-gateway-product
# Obtain from Apigee Console → Publish → Apps → <your-app> → Credentials
API_KEY=your-apigee-api-key-here
EOF
```

- [ ] **Step 1.3: Create infra/apigee.env.example**

```bash
cat > /home/greg_greghuang_altostrat_com/llm-apigee/infra/apigee.env.example << 'EOF'
# Apigee X configuration — copy to apigee.env and fill in your values
APIGEE_ORG=YOUR_PROJECT_ID
APIGEE_ENV=prod
APIGEE_ENVGROUP=llm-gateway-envgroup
APIGEE_HOST=YOUR_LB_IP.nip.io
APIGEE_IP=YOUR_LB_IP
PROJECT_ID=YOUR_PROJECT_ID
REGION=us-central1

# Vector Search (Vertex AI)
VECTOR_SEARCH_INDEX_ID=YOUR_VS_INDEX_ID
VECTOR_SEARCH_ENDPOINT_ID=YOUR_VS_ENDPOINT_ID
VECTOR_SEARCH_DEPLOYED_INDEX_ID=llm_semantic_cache
VECTOR_SEARCH_ENDPOINT_DOMAIN=YOUR_VS_ENDPOINT_DOMAIN
EOF
```

- [ ] **Step 1.4: Verify no secret files are tracked**

```bash
cd /home/greg_greghuang_altostrat_com/llm-apigee
# Confirm api-key.env is gitignored (after git init)
git check-ignore -v infra/api-key.env infra/apigee.env .playwright-mcp/
```

Expected: all three lines show `.gitignore` as the rule.

---

## Task 2: Git Init + Initial Commit

- [ ] **Step 2.1: Initialize git repo**

```bash
cd /home/greg_greghuang_altostrat_com/llm-apigee
git init
git config user.email "greg@greghuang.altostrat.com"
git config user.name "Greg Huang"
```

- [ ] **Step 2.2: Verify sensitive files are excluded**

```bash
cd /home/greg_greghuang_altostrat_com/llm-apigee
git status --short
# Must NOT see: infra/api-key.env, infra/apigee.env, .playwright-mcp/
# Must NOT see: ui/node_modules/, ui/.next/
```

Scan output carefully. If any sensitive file appears (not prefixed `??` suppressed), stop and fix `.gitignore`.

- [ ] **Step 2.3: Stage all files**

```bash
cd /home/greg_greghuang_altostrat_com/llm-apigee
git add .
git status --short | head -40  # review what's staged
```

- [ ] **Step 2.4: Initial commit**

```bash
cd /home/greg_greghuang_altostrat_com/llm-apigee
git commit -m "feat: initial commit — LLM gateway on Apigee X

Enterprise LLM API gateway with:
- Multi-model routing (Gemini, Claude, GLM, DeepSeek, Kimi, MiniMax, Qwen, free models)
- Semantic caching (Vertex AI Vector Search + Apigee distributed cache)
- OpenAI-compatible API, API key auth, token quota, streaming, image gen
- Next.js 15 admin UI with IAP auth (Cloud Run)
- 75 automated tests, Cloud Monitoring dashboard"
```

---

## Task 3: Create GitHub Repo + Push

- [ ] **Step 3.1: Authenticate GitHub CLI (if not already)**

```bash
gh auth status
# If not authenticated:
# gh auth login
```

- [ ] **Step 3.2: Create GitHub repo**

Choose visibility:
```bash
cd /home/greg_greghuang_altostrat_com/llm-apigee

# For PRIVATE repo:
gh repo create llm-apigee --private --description "Enterprise LLM API gateway on Apigee X: multi-model routing, semantic caching, OpenAI-compatible API"

# For PUBLIC repo (only after completing Tasks 4–6):
# gh repo create llm-apigee --public --description "..."
```

- [ ] **Step 3.3: Add remote and push**

```bash
cd /home/greg_greghuang_altostrat_com/llm-apigee
git remote add origin $(gh repo view llm-apigee --json sshUrl -q .sshUrl)
git branch -M main
git push -u origin main
```

- [ ] **Step 3.4: Verify on GitHub**

```bash
gh repo view llm-apigee --web
```

Confirm: no `api-key.env`, no `apigee.env`, no `.playwright-mcp/` directory visible.

---

## Task 4 (PUBLIC ONLY): Parameterize Apigee XML Policies

> Skip entirely for private repo.

The Apigee XML files hardcode `grhuang-02` and `706422770546` in ServiceCallout URLs. We replace them with `YOUR_PROJECT_ID` / `YOUR_PROJECT_NUMBER` / `YOUR_VS_*` placeholders and provide `infra/configure.sh` to substitute them before deployment.

- [ ] **Step 4.1: Replace SC-GetEmbedding.xml URL**

File: `apigee/sharedflows/SemanticCache-Lookup/sharedflowbundle/policies/SC-GetEmbedding.xml`

Replace:
```
https://us-central1-aiplatform.googleapis.com/v1/projects/grhuang-02/locations/us-central1/publishers/google/models/text-embedding-004:predict
```
With:
```
https://us-central1-aiplatform.googleapis.com/v1/projects/YOUR_PROJECT_ID/locations/us-central1/publishers/google/models/text-embedding-004:predict
```

- [ ] **Step 4.2: Replace SC-GetEmbeddingPopulate.xml URL**

File: `apigee/sharedflows/SemanticCache-Populate/sharedflowbundle/policies/SC-GetEmbeddingPopulate.xml`

Same substitution as Step 4.1.

- [ ] **Step 4.3: Replace SC-VectorSearch.xml URL**

File: `apigee/sharedflows/SemanticCache-Lookup/sharedflowbundle/policies/SC-VectorSearch.xml`

Replace the full URL containing `1150911953.us-central1-706422770546.vdb.vertexai.goog` and `986475235370860544`:
```
https://YOUR_VS_ENDPOINT_DOMAIN/v1/projects/YOUR_PROJECT_NUMBER/locations/us-central1/indexEndpoints/YOUR_VS_ENDPOINT_ID:findNeighbors
```

- [ ] **Step 4.4: Replace SC-UpsertVector.xml URL**

File: `apigee/sharedflows/SemanticCache-Populate/sharedflowbundle/policies/SC-UpsertVector.xml`

Replace URL containing `706422770546` and `3842795338100375552`:
```
https://us-central1-aiplatform.googleapis.com/v1/projects/YOUR_PROJECT_NUMBER/locations/us-central1/indexes/YOUR_VS_INDEX_ID:upsertDatapoints
```

- [ ] **Step 4.5: Replace ML-CloudLogging.xml log name**

File: `apigee/proxies/llm-gateway/apiproxy/policies/ML-CloudLogging.xml`

Replace:
```
projects/grhuang-02/logs/llm-gateway-requests
```
With:
```
projects/YOUR_PROJECT_ID/logs/llm-gateway-requests
```

- [ ] **Step 4.6: Replace model-router.js project constants**

File: `apigee/proxies/llm-gateway/apiproxy/resources/jsc/model-router.js`

Replace:
```javascript
var PROJECT_02 = "grhuang-02";
var PROJECT_GH = "grhuang";
```
With:
```javascript
var PROJECT_02 = "YOUR_PROJECT_ID";
var PROJECT_GH = "YOUR_CROSS_PROJECT_ID";  // optional, for quota isolation routing
```

- [ ] **Step 4.7: Create infra/configure.sh**

```bash
cat > /home/greg_greghuang_altostrat_com/llm-apigee/infra/configure.sh << 'SCRIPT'
#!/bin/bash
# One-time setup: substitute YOUR_* placeholders with real values from apigee.env
# Usage: source infra/apigee.env && bash infra/configure.sh

set -euo pipefail

: "${PROJECT_ID:?Set PROJECT_ID in infra/apigee.env}"
: "${VECTOR_SEARCH_INDEX_ID:?Set VECTOR_SEARCH_INDEX_ID}"
: "${VECTOR_SEARCH_ENDPOINT_ID:?Set VECTOR_SEARCH_ENDPOINT_ID}"
: "${VECTOR_SEARCH_ENDPOINT_DOMAIN:?Set VECTOR_SEARCH_ENDPOINT_DOMAIN}"

# Derive project number from project ID
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')

echo "Configuring for project: $PROJECT_ID ($PROJECT_NUMBER)"

# VS endpoint domain prefix (e.g. "1150911953" from "1150911953.us-central1-...")
VS_PREFIX=$(echo "$VECTOR_SEARCH_ENDPOINT_DOMAIN" | cut -d. -f1)

FILES=(
  apigee/sharedflows/SemanticCache-Lookup/sharedflowbundle/policies/SC-GetEmbedding.xml
  apigee/sharedflows/SemanticCache-Lookup/sharedflowbundle/policies/SC-VectorSearch.xml
  apigee/sharedflows/SemanticCache-Populate/sharedflowbundle/policies/SC-GetEmbeddingPopulate.xml
  apigee/sharedflows/SemanticCache-Populate/sharedflowbundle/policies/SC-UpsertVector.xml
  apigee/proxies/llm-gateway/apiproxy/policies/ML-CloudLogging.xml
  apigee/proxies/llm-gateway/apiproxy/resources/jsc/model-router.js
)

for f in "${FILES[@]}"; do
  sed -i \
    -e "s/YOUR_PROJECT_ID/$PROJECT_ID/g" \
    -e "s/YOUR_PROJECT_NUMBER/$PROJECT_NUMBER/g" \
    -e "s/YOUR_VS_INDEX_ID/$VECTOR_SEARCH_INDEX_ID/g" \
    -e "s/YOUR_VS_ENDPOINT_ID/$VECTOR_SEARCH_ENDPOINT_ID/g" \
    -e "s/YOUR_VS_ENDPOINT_DOMAIN/$VECTOR_SEARCH_ENDPOINT_DOMAIN/g" \
    "$f"
  echo "  configured: $f"
done

echo "Done. Remember to add CROSS_PROJECT_ID to model-router.js if using cross-project routing."
SCRIPT
chmod +x /home/greg_greghuang_altostrat_com/llm-apigee/infra/configure.sh
```

- [ ] **Step 4.8: Commit parameterization**

```bash
cd /home/greg_greghuang_altostrat_com/llm-apigee
git add apigee/ infra/configure.sh
git commit -m "chore: parameterize project-specific IDs for public template use

Replace hardcoded grhuang-02/706422770546/VS IDs with YOUR_* placeholders.
Run 'source infra/apigee.env && bash infra/configure.sh' to configure."
```

---

## Task 5 (PUBLIC ONLY): Parameterize UI + Tests

> Skip for private repo.

The UI files use `?? 'grhuang-02'` as env var fallbacks. For a public template, we remove the fallback (forcing explicit env var config) and note required env vars in README.

- [ ] **Step 5.1: Remove grhuang-02 fallbacks from ui/lib/*.ts**

In each of these files, replace `?? 'grhuang-02'` with `?? ''` and `?? 'grhuang'` with `?? ''`:

```
ui/lib/monitoring.ts    — const PROJECT = process.env.GOOGLE_CLOUD_PROJECT ?? ''
ui/lib/model-status.ts  — const PROJECT = process.env.GOOGLE_CLOUD_PROJECT ?? ''
ui/lib/cache-stats.ts   — const PROJECT = process.env.GOOGLE_CLOUD_PROJECT ?? ''
ui/lib/model-routing.ts — const PROJECT/ORG = ...env... ?? ''
ui/lib/alerts.ts        — const PROJECT = process.env.GOOGLE_CLOUD_PROJECT ?? ''
ui/lib/apigee.ts        — const ORG = process.env.APIGEE_ORG ?? ''
ui/lib/logging.ts       — const PROJECT = process.env.GOOGLE_CLOUD_PROJECT ?? ''
```

Also fix `model-routing.ts:91`:
```typescript
const proj = m[2] === 'PROJECT_GH' ? process.env.CROSS_PROJECT_ID ?? '' : process.env.GOOGLE_CLOUD_PROJECT ?? '';
```

- [ ] **Step 5.2: Remove grhuang-02 fallbacks from ui/app/api/*.ts**

Same pattern — replace `?? 'grhuang-02'` with `?? ''` in:
```
ui/app/api/apps/route.ts
ui/app/api/cache/route.ts
ui/app/api/keys/route.ts
ui/app/api/weights/generate/route.ts
ui/app/api/alerts/route.ts
ui/app/api/quota/app/route.ts
ui/app/layout.tsx
```

- [ ] **Step 5.3: Remove hardcoded parent prop from UI pages**

In these TSX files, replace `parent="grhuang-02"` with `parent={process.env.GOOGLE_CLOUD_PROJECT ?? ''}`:
```
ui/app/page.tsx
ui/app/cache/page.tsx
ui/app/keys/page.tsx
ui/app/logs/page.tsx
ui/app/models/page.tsx
ui/app/alerts/page.tsx
ui/app/quota/page.tsx
```

- [ ] **Step 5.4: Fix tests/run-tests.sh log filter**

In `tests/run-tests.sh`, find the Cloud Logging gcloud command (section 12) with:
```bash
'logName="projects/grhuang-02/logs/llm-gateway-requests"'
```
Replace with:
```bash
"logName=\"projects/${PROJECT_ID}/logs/llm-gateway-requests\""
```
Add at top of test script (after HOST):
```bash
: "${PROJECT_ID:=${APIGEE_ORG:-YOUR_PROJECT_ID}}"
```

- [ ] **Step 5.5: Commit UI parameterization**

```bash
cd /home/greg_greghuang_altostrat_com/llm-apigee
git add ui/ tests/
git commit -m "chore: remove hardcoded project IDs from UI and tests

UI now reads GOOGLE_CLOUD_PROJECT/APIGEE_ORG env vars without fallback.
Tests derive PROJECT_ID from env."
```

---

## Task 6 (PUBLIC ONLY): Sanitize README + Final Push

> Skip for private repo.

- [ ] **Step 6.1: Replace project IDs in README.md**

Global replacements in `README.md`:
- `grhuang-02` → `YOUR_PROJECT_ID`
- `grhuang` (as cross-project) → `YOUR_CROSS_PROJECT_ID`
- `706422770546` → `YOUR_PROJECT_NUMBER`
- `34.36.108.216` → `YOUR_LB_IP`
- `34-36-108-216.nip.io` → `YOUR_LB_IP.nip.io`
- `34.117.30.51` → `YOUR_UI_LB_IP`
- `34-117-30-51.nip.io` → `YOUR_UI_LB_IP.nip.io`
- `1150911953.us-central1-706422770546.vdb.vertexai.goog` → `YOUR_VS_ENDPOINT_DOMAIN`
- `3842795338100375552` → `YOUR_VS_INDEX_ID`
- `986475235370860544` → `YOUR_VS_ENDPOINT_ID`

```bash
cd /home/greg_greghuang_altostrat_com/llm-apigee
sed -i \
  -e 's/grhuang-02/YOUR_PROJECT_ID/g' \
  -e 's|\bgrhuang\b|YOUR_CROSS_PROJECT_ID|g' \
  -e 's/706422770546/YOUR_PROJECT_NUMBER/g' \
  -e 's/34\.36\.108\.216/YOUR_LB_IP/g' \
  -e 's/34-36-108-216\.nip\.io/YOUR_LB_IP.nip.io/g' \
  -e 's/34\.117\.30\.51/YOUR_UI_LB_IP/g' \
  -e 's/34-117-30-51\.nip\.io/YOUR_UI_LB_IP.nip.io/g' \
  -e 's/1150911953\.us-central1-706422770546\.vdb\.vertexai\.goog/YOUR_VS_ENDPOINT_DOMAIN/g' \
  -e 's/3842795338100375552/YOUR_VS_INDEX_ID/g' \
  -e 's/986475235370860544/YOUR_VS_ENDPOINT_ID/g' \
  README.md
```

- [ ] **Step 6.2: Manual review of README**

```bash
grep -n "grhuang\|706422\|34\.36\|34\.117\|1150911\|3842795\|986475" README.md
```

Expected: zero matches. Fix any remaining occurrences manually.

- [ ] **Step 6.3: Change GitHub repo to public (if desired)**

```bash
gh repo edit llm-apigee --visibility public
# Confirm the warning prompt
```

- [ ] **Step 6.4: Final commit and push**

```bash
cd /home/greg_greghuang_altostrat_com/llm-apigee
git add README.md
git commit -m "docs: sanitize README for public template use

Replace all project-specific IDs, IPs, and resource IDs with YOUR_* placeholders."
git push
```

- [ ] **Step 6.5: Final verification**

```bash
# Verify no secrets or project IDs leaked
gh api repos/:owner/llm-apigee/contents/infra | jq '.[].name'
# Must NOT contain api-key.env or apigee.env

# Search for leaked values in GitHub
gh search code --repo :owner/llm-apigee "K5Y6"          # API key fragment
gh search code --repo :owner/llm-apigee "706422770546"   # project number
```

Expected: zero results for both.

---

## Quick Reference: Sensitive Files Summary

```
GITIGNORED (never committed):
  infra/api-key.env          ← actual API key
  infra/apigee.env           ← project IDs, VS IDs, IPs
  .playwright-mcp/           ← browser session logs
  ui/node_modules/, ui/.next/ ← build artifacts

TEMPLATED (committed as .example):
  infra/api-key.env.example
  infra/apigee.env.example

PARAMETERIZED (public repo only):
  apigee/**/*.xml            ← YOUR_PROJECT_ID / YOUR_VS_*
  apigee/**/model-router.js  ← YOUR_PROJECT_ID
  ui/lib/*.ts, ui/app/**     ← env vars without fallback
  tests/run-tests.sh         ← $PROJECT_ID variable
  README.md                  ← YOUR_* placeholders
```
