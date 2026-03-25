#!/bin/bash
OP_ID="78132d07-f9c3-4671-98ba-d89379296e6a"
while true; do
  STATE=$(curl -s "https://apigee.googleapis.com/v1/organizations/${APIGEE_ORG:-YOUR_PROJECT_ID}/operations/$OP_ID" \
    -H "Authorization: Bearer $(gcloud auth print-access-token)" \
    | python3 -c "import sys,json; d=json.load(sys.stdin); p=d.get('metadata',{}).get('progress',{}); print(p.get('percentDone','?'),'%',p.get('description',''),'|',d.get('metadata',{}).get('state',''))")
  echo "$(date '+%H:%M:%S') $STATE"
  if echo "$STATE" | grep -q "FINISHED\|FAILED"; then break; fi
  sleep 30
done
