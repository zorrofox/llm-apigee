#!/bin/bash
# Phase 1 - Task 5: Create Apigee environment and environment group
set -e

PROJECT_ID="${PROJECT_ID:-YOUR_PROJECT_ID}"
ORG="${PROJECT_ID:-YOUR_PROJECT_ID}"
ENV_NAME=prod
ENV_GROUP_NAME=llm-gateway-envgroup
REGION=us-central1

TOKEN=$(gcloud auth print-access-token)

echo "=== Creating Apigee environment: $ENV_NAME ==="
curl -s -X POST \
  "https://apigee.googleapis.com/v1/organizations/$ORG/environments" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"$ENV_NAME\",
    \"displayName\": \"Production\",
    \"description\": \"LLM Gateway production environment\",
    \"type\": \"INTERMEDIATE\"
  }" | python3 -c "import sys,json; d=json.load(sys.stdin); print(json.dumps(d, indent=2))"

echo ""
echo "=== Waiting for environment creation... ==="
sleep 10

echo "=== Creating environment group: $ENV_GROUP_NAME ==="
# Reserve a static IP first for the LB (needed for hostname)
APIGEE_IP=$(gcloud compute addresses describe apigee-external-ip \
  --global --project=$PROJECT_ID --format='value(address)' 2>/dev/null || echo "")

if [ -z "$APIGEE_IP" ]; then
  echo "Reserving static external IP..."
  gcloud compute addresses create apigee-external-ip \
    --global --project=$PROJECT_ID
  APIGEE_IP=$(gcloud compute addresses describe apigee-external-ip \
    --global --project=$PROJECT_ID --format='value(address)')
fi
echo "External IP: $APIGEE_IP"

# Use nip.io for demo hostname (no DNS setup needed)
HOSTNAME="${APIGEE_IP//./-}.nip.io"
echo "Hostname: $HOSTNAME"

curl -s -X POST \
  "https://apigee.googleapis.com/v1/organizations/$ORG/envgroups" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"$ENV_GROUP_NAME\",
    \"hostnames\": [\"$HOSTNAME\"]
  }" | python3 -c "import sys,json; d=json.load(sys.stdin); print(json.dumps(d, indent=2))"

echo ""
echo "=== Attaching environment to group ==="
sleep 30  # wait for envgroup to be ready

curl -s -X POST \
  "https://apigee.googleapis.com/v1/organizations/$ORG/envgroups/$ENV_GROUP_NAME/attachments" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"environment\": \"$ENV_NAME\"}" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(json.dumps(d, indent=2))"

echo ""
echo "=== Saving config ==="
echo "APIGEE_HOST=$HOSTNAME" > /home/greg_greghuang_altostrat_com/llm-apigee/infra/apigee.env
echo "APIGEE_ORG=$ORG" >> /home/greg_greghuang_altostrat_com/llm-apigee/infra/apigee.env
echo "APIGEE_ENV=$ENV_NAME" >> /home/greg_greghuang_altostrat_com/llm-apigee/infra/apigee.env
echo "APIGEE_IP=$APIGEE_IP" >> /home/greg_greghuang_altostrat_com/llm-apigee/infra/apigee.env
echo "Saved to infra/apigee.env"
