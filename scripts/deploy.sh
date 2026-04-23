#!/bin/bash
# =============================================================================
# Deploy LLM Gateway Traffic Simulator as Cloud Run Job + Cloud Scheduler.
# Idempotent — safe to rerun (uses --quiet + create-or-update patterns).
#
# Prereqs:
#   - infra/apigee.env  (APIGEE_HOST, PROJECT_ID)
#   - infra/api-key.env (API_KEY)
#   - apigee-llm-sa@<PROJECT>.iam.gserviceaccount.com exists
#
# Usage:
#   bash scripts/deploy.sh
# =============================================================================
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
source "${REPO_ROOT}/infra/apigee.env"
source "${REPO_ROOT}/infra/api-key.env"

REGION="${REGION:-us-central1}"
JOB_NAME="llm-traffic-sim"
SCHED_NAME="llm-traffic-sim-hourly"
SECRET_NAME="llm-gateway-api-key"
AR_REPO="llm-gateway"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${AR_REPO}/traffic-sim:latest"
SA_EMAIL="apigee-llm-sa@${PROJECT_ID}.iam.gserviceaccount.com"

echo "=========================================="
echo "  Deploying Traffic Simulator"
echo "  project: ${PROJECT_ID}"
echo "  region : ${REGION}"
echo "  image  : ${IMAGE}"
echo "  sa     : ${SA_EMAIL}"
echo "=========================================="

# ── 1. Enable required APIs ──────────────────────────────────────────────────
echo ""
echo "=== [1/7] Enable APIs (cloudscheduler, secretmanager) ==="
gcloud services enable \
  cloudscheduler.googleapis.com \
  secretmanager.googleapis.com \
  --project="${PROJECT_ID}"

# ── 2. Secret Manager: create + push API_KEY ─────────────────────────────────
echo ""
echo "=== [2/7] Create secret ${SECRET_NAME} ==="
if gcloud secrets describe "${SECRET_NAME}" --project="${PROJECT_ID}" &>/dev/null; then
  echo "  (secret already exists)"
else
  gcloud secrets create "${SECRET_NAME}" \
    --replication-policy=automatic \
    --project="${PROJECT_ID}"
fi

echo "  → adding new version with current API_KEY"
echo -n "${API_KEY}" | gcloud secrets versions add "${SECRET_NAME}" \
  --data-file=- \
  --project="${PROJECT_ID}" 2>&1 | tail -1

echo "  → granting accessor to ${SA_EMAIL}"
gcloud secrets add-iam-policy-binding "${SECRET_NAME}" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/secretmanager.secretAccessor" \
  --project="${PROJECT_ID}" 2>&1 | tail -2

# ── 3. Cloud Build → Artifact Registry ───────────────────────────────────────
echo ""
echo "=== [3/7] Build and push image ==="
cd "${REPO_ROOT}/scripts"
gcloud builds submit . \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --config=cloudbuild.yaml 2>&1 | tail -3

# ── 4. Create or update Cloud Run Job ────────────────────────────────────────
echo ""
echo "=== [4/7] Create/update Cloud Run Job ${JOB_NAME} ==="
COMMON_FLAGS=(
  --image="${IMAGE}"
  --region="${REGION}"
  --service-account="${SA_EMAIL}"
  --set-env-vars="APIGEE_HOST=${APIGEE_HOST},RATE_PER_HOUR=60,DURATION_MIN=50,CACHE_HIT_TARGET=0.5,STREAM_RATIO=0.10,BAD_KEY_RATIO=0.03,MAX_EFFECTIVE_TOKENS=300000"
  --set-secrets="API_KEY=${SECRET_NAME}:latest"
  --task-timeout=55m
  --max-retries=0
  --cpu=1 --memory=512Mi
  --project="${PROJECT_ID}"
)
if gcloud run jobs describe "${JOB_NAME}" --region="${REGION}" --project="${PROJECT_ID}" &>/dev/null; then
  echo "  (job exists, updating)"
  gcloud run jobs update "${JOB_NAME}" "${COMMON_FLAGS[@]}" --quiet 2>&1 | tail -3
else
  gcloud run jobs create "${JOB_NAME}" "${COMMON_FLAGS[@]}" --quiet 2>&1 | tail -3
fi

# ── 5. Grant Cloud Run Job invoker to the SA (so Scheduler can call) ─────────
echo ""
echo "=== [5/7] Grant run.invoker to ${SA_EMAIL} on the job ==="
gcloud run jobs add-iam-policy-binding "${JOB_NAME}" \
  --region="${REGION}" --project="${PROJECT_ID}" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/run.invoker" 2>&1 | tail -2

# ── 6. Cloud Scheduler hourly cron ───────────────────────────────────────────
echo ""
echo "=== [6/7] Create/update Cloud Scheduler ${SCHED_NAME} ==="
PROJECT_NUMBER=$(gcloud projects describe "${PROJECT_ID}" --format='value(projectNumber)')
URI="https://${REGION}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${PROJECT_ID}/jobs/${JOB_NAME}:run"

if gcloud scheduler jobs describe "${SCHED_NAME}" --location="${REGION}" --project="${PROJECT_ID}" &>/dev/null; then
  echo "  (scheduler job exists, updating)"
  gcloud scheduler jobs update http "${SCHED_NAME}" \
    --location="${REGION}" --project="${PROJECT_ID}" \
    --schedule="0 * * * *" \
    --uri="${URI}" \
    --http-method=POST \
    --oauth-service-account-email="${SA_EMAIL}" \
    --time-zone="UTC" 2>&1 | tail -2
else
  gcloud scheduler jobs create http "${SCHED_NAME}" \
    --location="${REGION}" --project="${PROJECT_ID}" \
    --schedule="0 * * * *" \
    --uri="${URI}" \
    --http-method=POST \
    --oauth-service-account-email="${SA_EMAIL}" \
    --time-zone="UTC" 2>&1 | tail -2
fi

# ── 7. Done ──────────────────────────────────────────────────────────────────
echo ""
echo "=== [7/7] Done ==="
echo ""
echo "  Job:        ${JOB_NAME}"
echo "  Schedule:   every hour at :00 UTC"
echo "  Image:      ${IMAGE}"
echo ""
echo "  Manual trigger:"
echo "    gcloud run jobs execute ${JOB_NAME} --region=${REGION} --project=${PROJECT_ID}"
echo ""
echo "  Tail logs of latest execution:"
echo "    LATEST=\$(gcloud run jobs executions list --job=${JOB_NAME} --region=${REGION} --project=${PROJECT_ID} --limit=1 --format='value(name)')"
echo "    gcloud beta run jobs executions logs \$LATEST --region=${REGION} --project=${PROJECT_ID}"
echo ""
echo "  Pause schedule:    gcloud scheduler jobs pause ${SCHED_NAME} --location=${REGION} --project=${PROJECT_ID}"
echo "  Resume schedule:   gcloud scheduler jobs resume ${SCHED_NAME} --location=${REGION} --project=${PROJECT_ID}"
echo ""
