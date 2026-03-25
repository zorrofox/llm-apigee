/**
 * JS-DetectBackend: Determine backend from model name BEFORE RouteRule evaluation.
 * Must run in ProxyEndpoint PreFlow so RouteRule can select correct TargetEndpoint.
 *
 * "opencode" → opencode TargetEndpoint (no GoogleAuth)
 * "vertex"   → default TargetEndpoint (GoogleAccessToken auth) — Gemini, Claude, MaaS
 *
 * KVM disabled check: if model is in kvm.disabled_models, force "vertex"
 * so disabled opencode models don't accidentally route to opencode TargetEndpoint.
 */
var model = context.getVariable("llm.model") || "";

// 检查 KVM 禁用列表（由 KV-ReadModelConfig 在 PreFlow 最顶部读取）
var kvDisabled = context.getVariable("kvm.disabled_models") || "";
var disabledSet = {};
if (kvDisabled) {
  kvDisabled.split(",").forEach(function(m) {
    var t = m.trim();
    if (t) disabledSet[t] = true;
  });
}

// 被禁用的模型强制走 vertex（不管原来是什么类型）
var isDisabled = disabledSet[model];
var backend = (!isDisabled && model.indexOf("opencode/") === 0) ? "opencode" : "vertex";
context.setVariable("llm.backend", backend);
