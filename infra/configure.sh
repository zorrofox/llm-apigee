#!/bin/bash
# configure.sh — One-time setup: substitute YOUR_* placeholders with real values.
#
# Usage:
#   cp infra/apigee.env.example infra/apigee.env
#   # edit infra/apigee.env with your values
#   source infra/apigee.env && bash infra/configure.sh
#
# This modifies Apigee policy files in-place. Run once after cloning.
# To revert: git checkout -- apigee/

set -euo pipefail

: "${PROJECT_ID:?Set PROJECT_ID in infra/apigee.env}"
: "${VECTOR_SEARCH_INDEX_ID:?Set VECTOR_SEARCH_INDEX_ID in infra/apigee.env}"
: "${VECTOR_SEARCH_ENDPOINT_ID:?Set VECTOR_SEARCH_ENDPOINT_ID in infra/apigee.env}"
: "${VECTOR_SEARCH_ENDPOINT_DOMAIN:?Set VECTOR_SEARCH_ENDPOINT_DOMAIN in infra/apigee.env}"

# Derive numeric project number from project ID
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')

echo "Configuring for:"
echo "  PROJECT_ID     = $PROJECT_ID"
echo "  PROJECT_NUMBER = $PROJECT_NUMBER"
echo "  VS_INDEX_ID    = $VECTOR_SEARCH_INDEX_ID"
echo "  VS_ENDPOINT_ID = $VECTOR_SEARCH_ENDPOINT_ID"
echo "  VS_ENDPOINT    = $VECTOR_SEARCH_ENDPOINT_DOMAIN"
echo ""

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
    -e "s|YOUR_PROJECT_ID|${PROJECT_ID}|g" \
    -e "s|YOUR_PROJECT_NUMBER|${PROJECT_NUMBER}|g" \
    -e "s|YOUR_VS_INDEX_ID|${VECTOR_SEARCH_INDEX_ID}|g" \
    -e "s|YOUR_VS_ENDPOINT_ID|${VECTOR_SEARCH_ENDPOINT_ID}|g" \
    -e "s|YOUR_VS_ENDPOINT_DOMAIN|${VECTOR_SEARCH_ENDPOINT_DOMAIN}|g" \
    "$f"
  echo "  configured: $f"
done

# Cross-project routing (optional)
if [ -n "${CROSS_PROJECT_ID:-}" ]; then
  sed -i "s|YOUR_CROSS_PROJECT_ID|${CROSS_PROJECT_ID}|g" \
    apigee/proxies/llm-gateway/apiproxy/resources/jsc/model-router.js
  echo "  cross-project routing configured: $CROSS_PROJECT_ID"
else
  echo "  CROSS_PROJECT_ID not set — cross-project routing routes disabled (YOUR_CROSS_PROJECT_ID kept as literal)"
fi

echo ""
echo "Done. Next steps:"
echo "  1. Deploy Apigee proxies:   bash infra/05-create-environment.sh"
echo "  2. Set up load balancer:    bash infra/06-setup-load-balancer.sh"
echo "  3. Source your API key:     source infra/api-key.env"
echo "  4. Run tests:               bash tests/run-tests.sh"
