# Required GCP Permissions — Fresh Project Deployment

> Permissions needed to deploy LLM Gateway from scratch in a new GCP project.
> Discovered during deployment to `YOUR_PROJECT_ID` (2026-04-22).

## Deployer (human operator) — temporary, can be revoked after deployment

| Role | Why | When |
|------|-----|------|
| `roles/serviceusage.serviceUsageAdmin` | enable APIs | Phase 0 |
| `roles/compute.admin` | VPC, subnet, IP, LB, SSL cert, NEG, URL map, target proxy, forwarding rule | Phase 1, 5 |
| `roles/servicenetworking.networksAdmin` | `gcloud services vpc-peerings connect` | Phase 1 only |
| `roles/apigee.apiAdminV2` | Apigee proxies/sharedflows + envgroup ops | Phase 4 onward |
| `roles/apigee.admin` (or `roles/apigee.organizationAdmin`) | provision Apigee org, create env, create envgroup attachments | Phase 2, 4 |
| `roles/aiplatform.admin` | create Vector Search index, endpoint, deploy index | Phase 3 |
| `roles/iam.serviceAccountAdmin` | create `apigee-llm-sa`; setIamPolicy on SA (token creator binding) | Phase 6 |
| `roles/resourcemanager.projectIamAdmin` | bind SA roles at project level | Phase 6 |
| `roles/logging.configWriter` | create log-based metrics | Phase 7 |
| `roles/monitoring.editor` | create dashboards, alert policies | Phase 7 |
| `roles/editor` (legacy) | various odds and ends; alternative to several above | optional |

### Notes from deployment experience

- **`roles/editor` does NOT include `servicenetworking.services.addPeering`** — the explicit `networksAdmin` role is required for VPC peering. Discovered when first attempt at `vpc-peerings connect` failed with `AUTH_PERMISSION_DENIED`.
- **`roles/editor` does NOT include `iam.serviceAccounts.setIamPolicy`** — needed `iam.serviceAccountAdmin` to grant the Apigee Service Agent token-creator role on `apigee-llm-sa`.
- **The `service-networking` service identity was not created automatically.** Had to run `gcloud beta services identity create --service=servicenetworking.googleapis.com` manually, then grant the resulting SA `roles/servicenetworking.serviceAgent`.

## Runtime — `apigee-llm-sa` (long-lived)

This SA is used by the deployed Apigee proxies. Cannot be revoked.

| Role | Why |
|------|-----|
| `roles/aiplatform.user` | call Vertex AI: text-embedding-004, generateContent, rawPredict (Claude), Vector Search findNeighbors/upsertDatapoints |
| `roles/logging.logWriter` | write structured request logs to `logName=llm-gateway-requests` from `ML-CloudLogging` policy |

## Apigee Service Agent — `service-{PROJECT_NUMBER}@gcp-sa-apigee.iam.gserviceaccount.com`

Created automatically when Apigee org is provisioned.

| Bound to | Role | Why |
|----------|------|-----|
| `apigee-llm-sa` (SA-level IAM) | `roles/iam.serviceAccountTokenCreator` | so Apigee can mint OAuth tokens AS apigee-llm-sa to call Vertex AI |

## Cross-project (skipped this deployment)

If `CROSS_PROJECT_ID` is set in `infra/apigee.env`, the same `apigee-llm-sa` needs `roles/aiplatform.user` on the cross-project too. Skipped for this deployment.

## Quick "minimum viable" grant — if owner already exists

If you're an owner of the project, no individual grants are needed — owner covers everything.

If you're delegating to a deployer group, grant these all at once:

```bash
PROJECT_ID=...
GROUP=...

for ROLE in \
  roles/serviceusage.serviceUsageAdmin \
  roles/compute.admin \
  roles/servicenetworking.networksAdmin \
  roles/apigee.admin \
  roles/apigee.apiAdminV2 \
  roles/aiplatform.admin \
  roles/iam.serviceAccountAdmin \
  roles/resourcemanager.projectIamAdmin \
  roles/logging.configWriter \
  roles/monitoring.editor; do
  gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="group:$GROUP" --role="$ROLE" --condition=None
done
```

After deployment, the safe-to-revoke set (deployer can be downgraded):

```bash
for ROLE in \
  roles/servicenetworking.networksAdmin \
  roles/iam.serviceAccountAdmin \
  roles/resourcemanager.projectIamAdmin \
  roles/aiplatform.admin \
  roles/compute.admin \
  roles/apigee.admin; do
  gcloud projects remove-iam-policy-binding $PROJECT_ID \
    --member="group:$GROUP" --role="$ROLE"
done
```

Keep `apigee.apiAdminV2` + `serviceusage.serviceUsageAdmin` + `monitoring.editor` for ongoing ops.

## Vertex AI Model availability ≠ IAM permission

**IMPORTANT**: Even with `roles/aiplatform.user`, individual publisher models must be **enabled** in the project via Vertex AI Model Garden console (one-time accept of model terms). No IAM role grants this access.

In this project (`YOUR_PROJECT_ID`):
- ✅ Available: Gemini 2.5 (pro/flash/flash-lite/flash-image), Gemini 3.x (3-flash-preview, 3.1-pro/flash-lite/flash-image), Claude Opus 4.6, Claude Sonnet 4.6
- ❌ Not enabled: Gemini 2.0 family (deprecated by Google Apr 2026), Claude Haiku 4.5, all Claude 4-5 series, Gemini 3-pro-preview
- ❓ MaaS partner models (GLM/DeepSeek/Kimi/MiniMax/Qwen): all return 200 via Vertex AI OpenAPI endpoint without separate enablement
