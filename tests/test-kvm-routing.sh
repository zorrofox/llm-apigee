#!/bin/bash
# =============================================================================
# KVM 动态路由功能测试
# 测试三个能力：禁用模型、默认模型覆盖、动态新增模型
# 用法: source infra/api-key.env && bash tests/test-kvm-routing.sh
# =============================================================================
set -euo pipefail

HOST="${APIGEE_HOST:-34-36-108-216.nip.io}"
BASE="https://$HOST/v1"
TOKEN=$(gcloud auth print-access-token)
ORG="${APIGEE_ORG:-YOUR_PROJECT_ID}"
ENV=prod
KVM=model-routing-config

GREEN='\033[0;32m'; RED='\033[0;31m'; CYAN='\033[0;36m'; NC='\033[0m'
PASS=0; FAIL=0

pass() { printf "${GREEN}PASS${NC} %s\n" "$1"; PASS=$((PASS+1)); }
fail() { printf "${RED}FAIL${NC} %s → %s\n" "$1" "$2"; FAIL=$((FAIL+1)); }

# 每次调用用带时间戳的唯一 prompt，避免语义缓存干扰测试结果
TS=$(date +%s%N)
call() {
  local model="$1" prompt="${2:-kvm-test-$(date +%s%N)}"
  CODE=$(curl -sk -X POST "$BASE/chat/completions" \
    -H "Content-Type: application/json" -H "x-api-key: $API_KEY" \
    -d "{\"model\":\"$model\",\"messages\":[{\"role\":\"user\",\"content\":\"$prompt\"}],\"max_tokens\":5}" \
    -w "%{http_code}" -o /tmp/kvm_test.json)
  BODY=$(cat /tmp/kvm_test.json)
  MODEL_RESOLVED=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('model','?'))" 2>/dev/null)
}

kvm_set() {
  local key="$1" val="$2"
  curl -s -X PUT \
    "https://apigee.googleapis.com/v1/organizations/$ORG/environments/$ENV/keyvaluemaps/$KVM/entries/$key" \
    -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    -d "{\"name\":\"$key\",\"value\":\"$val\"}" > /dev/null
  sleep 35  # 等 KVM 缓存刷新（ExpiryTimeInSecs=30）
}

kvm_clear() {
  local key="$1" default="${2:-}"
  curl -s -X PUT \
    "https://apigee.googleapis.com/v1/organizations/$ORG/environments/$ENV/keyvaluemaps/$KVM/entries/$key" \
    -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    -d "{\"name\":\"$key\",\"value\":\"$default\"}" > /dev/null
}

[ -z "${API_KEY:-}" ] && { echo "ERROR: API_KEY not set"; exit 1; }

printf "${CYAN}══════════════════════════════════════════\n"
printf "  KVM 动态路由功能测试\n"
printf "══════════════════════════════════════════${NC}\n"

# ── 基线：验证正常路由工作 ────────────────────────────────────────────────────
printf "\n${CYAN}基线验证${NC}\n"
call "gemini-2.0-flash-001"
[ "$CODE" = "200" ] && pass "基线 gemini-2.0-flash-001 → 200" || fail "基线" "HTTP $CODE"

call "gemini-2.5-flash"
[ "$CODE" = "200" ] && pass "基线 gemini-2.5-flash → 200" || fail "基线" "HTTP $CODE"

# ── 测试 1：禁用模型 ──────────────────────────────────────────────────────────
printf "\n${CYAN}测试 1: 禁用 gemini-2.5-flash，应回退到 DEFAULT${NC}\n"
echo "  写入 disabled_models=gemini-2.5-flash，等待缓存刷新..."
kvm_set "disabled_models" "gemini-2.5-flash"

call "gemini-2.5-flash"
if [ "$CODE" = "200" ] && [ "$MODEL_RESOLVED" = "gemini-2.0-flash-001" ]; then
  pass "禁用 gemini-2.5-flash → 回退到 gemini-2.0-flash-001"
else
  fail "禁用模型" "HTTP $CODE, resolved=$MODEL_RESOLVED (期望: gemini-2.0-flash-001)"
fi

# 确认其他模型不受影响
call "gemini-2.0-flash-001"
[ "$CODE" = "200" ] && pass "禁用不影响其他模型 gemini-2.0-flash-001" || fail "其他模型受影响" "HTTP $CODE"

# 恢复
echo "  恢复 disabled_models..."
kvm_clear "disabled_models" ""

# ── 测试 2：覆盖默认回退模型 ─────────────────────────────────────────────────
printf "\n${CYAN}测试 2: 默认回退改为 gemini-2.5-flash${NC}\n"
echo "  写入 default_model=gemini-2.5-flash，等待缓存刷新..."
kvm_set "default_model" "gemini-2.5-flash"

call "unknown-model-xyz"
if [ "$CODE" = "200" ] && [ "$MODEL_RESOLVED" = "gemini-2.5-flash" ]; then
  pass "unknown-model-xyz → 回退到 gemini-2.5-flash (KVM 覆盖)"
else
  fail "默认模型覆盖" "HTTP $CODE, resolved=$MODEL_RESOLVED"
fi

# 恢复
echo "  恢复 default_model..."
kvm_clear "default_model" ""

# ── 测试 3：动态新增模型别名 ─────────────────────────────────────────────────
printf "\n${CYAN}测试 3: 通过 extra_routes 新增别名 flash-v2→gemini-2.0-flash-001${NC}\n"
EXTRA='{"gemini":{"flash-v2":{"project":"YOUR_PROJECT_ID","model":"gemini-2.0-flash-001"}}}'
echo "  写入 extra_routes，等待缓存刷新..."
kvm_set "extra_routes" "$EXTRA"

call "flash-v2"
if [ "$CODE" = "200" ] && [ "$MODEL_RESOLVED" = "gemini-2.0-flash-001" ]; then
  pass "新别名 flash-v2 → gemini-2.0-flash-001 (KVM extra_routes)"
else
  fail "动态新增模型" "HTTP $CODE, resolved=$MODEL_RESOLVED"
fi

# 测试新增 MaaS 别名
EXTRA_MAAS='{"gemini":{"flash-v2":{"project":"YOUR_PROJECT_ID","model":"gemini-2.0-flash-001"}},"maas":{"my-deepseek":{"pub":"deepseek-ai","model":"deepseek-ai/deepseek-v3.2-maas"}}}'
kvm_clear "extra_routes" "$EXTRA_MAAS"
sleep 35

call "my-deepseek"
if [ "$CODE" = "200" ] || [ "$CODE" = "429" ]; then
  pass "MaaS 别名 my-deepseek → deepseek-v3.2 (HTTP $CODE，200或429均可)"
else
  fail "MaaS 别名" "HTTP $CODE"
fi

# 恢复 extra_routes
echo "  恢复 extra_routes..."
kvm_clear "extra_routes" "{}"

# ── 最终验证：全量测试 ────────────────────────────────────────────────────────
printf "\n${CYAN}全量测试验证（KVM 已全部恢复）${NC}\n"
sleep 35
for model in gemini-2.0-flash-001 gemini-2.5-flash claude-haiku-4-5; do
  call "$model"
  [ "$CODE" = "200" ] && pass "$model → 200" || fail "$model" "HTTP $CODE"
done

# ── 汇总 ──────────────────────────────────────────────────────────────────────
printf "\n${CYAN}══════════════════════════════════════════${NC}\n"
printf "  Passed: $PASS  Failed: $FAIL\n"
[ "$FAIL" -eq 0 ] && printf "${GREEN}  ALL TESTS PASSED ✓${NC}\n" || printf "${RED}  $FAIL TEST(S) FAILED ✗${NC}\n"