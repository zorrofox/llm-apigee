#!/bin/bash
# Phase 1 - Task 6: Setup external HTTPS Load Balancer for Apigee X
set -e

source /home/greg_greghuang_altostrat_com/llm-apigee/infra/apigee.env

PROJECT_ID="${PROJECT_ID:-YOUR_PROJECT_ID}"
ORG="${PROJECT_ID:-YOUR_PROJECT_ID}"
REGION=us-central1
LB_NAME=apigee-llm-lb
NEG_NAME=apigee-neg
BACKEND_NAME=apigee-backend
URL_MAP_NAME=apigee-url-map
TARGET_HTTPS_PROXY=apigee-https-proxy
FORWARDING_RULE=apigee-https-forwarding-rule
CERT_NAME=apigee-managed-cert

echo "=== Getting Apigee instance IP ==="
APIGEE_INSTANCE_IP=$(curl -s \
  "https://apigee.googleapis.com/v1/organizations/$ORG/instances/apigee-instance-$REGION" \
  -H "Authorization: Bearer $(gcloud auth print-access-token)" \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('host',''))")
echo "Apigee instance IP: $APIGEE_INSTANCE_IP"

echo "=== Creating PSC NEG for Apigee ==="
gcloud compute network-endpoint-groups create $NEG_NAME \
  --project=$PROJECT_ID \
  --region=$REGION \
  --network-endpoint-type=private-service-connect \
  --psc-target-service=projects/$PROJECT_ID/regions/$REGION/serviceAttachments/apigee-$REGION \
  --network=apigee-vpc \
  --subnet=apigee-subnet 2>&1 || \
gcloud beta compute network-endpoint-groups create $NEG_NAME \
  --project=$PROJECT_ID \
  --region=$REGION \
  --network-endpoint-type=PRIVATE_SERVICE_CONNECT \
  --psc-target-service=projects/$PROJECT_ID/regions/$REGION/serviceAttachments/apigee-$REGION \
  --network=apigee-vpc \
  --subnet=apigee-subnet 2>&1

echo "=== Creating backend service ==="
gcloud compute backend-services create $BACKEND_NAME \
  --project=$PROJECT_ID \
  --global \
  --load-balancing-scheme=EXTERNAL_MANAGED \
  --protocol=HTTPS

gcloud compute backend-services add-backend $BACKEND_NAME \
  --project=$PROJECT_ID \
  --global \
  --network-endpoint-group=$NEG_NAME \
  --network-endpoint-group-region=$REGION

echo "=== Creating URL map ==="
gcloud compute url-maps create $URL_MAP_NAME \
  --project=$PROJECT_ID \
  --default-service=$BACKEND_NAME

echo "=== Creating managed SSL certificate ==="
gcloud compute ssl-certificates create $CERT_NAME \
  --project=$PROJECT_ID \
  --domains=$APIGEE_HOST \
  --global

echo "=== Creating HTTPS target proxy ==="
gcloud compute target-https-proxies create $TARGET_HTTPS_PROXY \
  --project=$PROJECT_ID \
  --url-map=$URL_MAP_NAME \
  --ssl-certificates=$CERT_NAME

echo "=== Creating forwarding rule ==="
gcloud compute forwarding-rules create $FORWARDING_RULE \
  --project=$PROJECT_ID \
  --global \
  --load-balancing-scheme=EXTERNAL_MANAGED \
  --target-https-proxy=$TARGET_HTTPS_PROXY \
  --address=apigee-external-ip \
  --ports=443

echo ""
echo "=== Load Balancer setup complete ==="
echo "Apigee external endpoint: https://$APIGEE_HOST"
echo "Note: SSL cert provisioning takes 10-15 min after DNS propagates"
