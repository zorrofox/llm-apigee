/**
 * JS-ModelRouter: Route requests to the correct backend.
 *
 * Backend types:
 *  - "vertex-gemini"  → Vertex AI generateContent (Gemini models)
 *  - "vertex-claude"  → Vertex AI rawPredict (Claude models)
 *  - "vertex-openapi" → Vertex AI OpenAPI-compat endpoint (all MaaS partner models)
 *  - "opencode"       → OpenCode Zen free models
 *
 * Dynamic config via KVM `model-routing-config` (read by KV-ReadModelConfig policy):
 *   kvm.disabled_models  — comma-separated model names to disable (route to DEFAULT)
 *   kvm.default_model    — override the default fallback model
 *   kvm.extra_routes     — JSON to add new models without redeployment:
 *     {
 *       "gemini":  { "alias": { "project": "YOUR_PROJECT_ID", "model": "actual-model-id" } },
 *       "claude":  { "alias": "actual-model-id" },
 *       "maas":    { "alias": { "pub": "publisher", "model": "publisher/model-id" } },
 *       "opencode":{ "opencode/alias": "actual-model-id" }
 *     }
 *
 * target.url MUST be set here (TargetEndpoint PreFlow).
 * copy.pathsuffix=false in TargetEndpoint prevents /chat/completions from being appended.
 */

var PROJECT_02 = "YOUR_PROJECT_ID";
var PROJECT_GH = "YOUR_CROSS_PROJECT_ID";  // optional: secondary project for quota isolation
var VA_BASE    = "https://aiplatform.googleapis.com/v1/projects";
var GLOBAL_LOC = "locations/global";
var OPENAPI_URL = "https://aiplatform.googleapis.com/v1/projects/" + PROJECT_02 + "/" + GLOBAL_LOC + "/endpoints/openapi/chat/completions";
var OPENCODE    = "https://opencode.ai/zen/v1/chat/completions";

// ── 静态路由表 ────────────────────────────────────────────────────────────────

var OPENAPI_ROUTES = {
  // GLM
  "glm-4.7":                        { pub: "zai-org",    model: "zai-org/glm-4.7-maas" },
  "glm-5":                          { pub: "zai-org",    model: "zai-org/glm-5-maas" },
  "glm-4.7-maas":                   { pub: "zai-org",    model: "zai-org/glm-4.7-maas" },
  "glm-5-maas":                     { pub: "zai-org",    model: "zai-org/glm-5-maas" },
  // DeepSeek
  "deepseek-v3.2":                  { pub: "deepseek-ai", model: "deepseek-ai/deepseek-v3.2-maas" },
  "deepseek-v3.2-maas":             { pub: "deepseek-ai", model: "deepseek-ai/deepseek-v3.2-maas" },
  "deepseek-ocr":                   { pub: "deepseek-ai", model: "deepseek-ai/deepseek-ocr-maas" },
  "deepseek-ocr-maas":              { pub: "deepseek-ai", model: "deepseek-ai/deepseek-ocr-maas" },
  // Kimi
  "kimi-k2-thinking":               { pub: "moonshotai", model: "moonshotai/kimi-k2-thinking-maas" },
  "kimi-k2-thinking-maas":          { pub: "moonshotai", model: "moonshotai/kimi-k2-thinking-maas" },
  // MiniMax
  "minimax-m2":                     { pub: "minimaxai",  model: "minimaxai/minimax-m2-maas" },
  "minimax-m2-maas":                { pub: "minimaxai",  model: "minimaxai/minimax-m2-maas" },
  // Qwen
  "qwen3-235b":                     { pub: "qwen", model: "qwen/qwen3-235b-a22b-instruct-2507-maas" },
  "qwen3-235b-a22b-instruct-2507-maas": { pub: "qwen", model: "qwen/qwen3-235b-a22b-instruct-2507-maas" },
  "qwen3-next-80b":                 { pub: "qwen", model: "qwen/qwen3-next-80b-a3b-instruct-maas" },
  "qwen3-next-80b-a3b-instruct-maas": { pub: "qwen", model: "qwen/qwen3-next-80b-a3b-instruct-maas" },
  "qwen3-next-80b-think":           { pub: "qwen", model: "qwen/qwen3-next-80b-a3b-thinking-maas" },
  "qwen3-next-80b-a3b-thinking-maas": { pub: "qwen", model: "qwen/qwen3-next-80b-a3b-thinking-maas" },
  "qwen3-coder":                    { pub: "qwen", model: "qwen/qwen3-coder-480b-a35b-instruct-maas" },
  "qwen3-coder-480b-a35b-instruct-maas": { pub: "qwen", model: "qwen/qwen3-coder-480b-a35b-instruct-maas" },
  // Grok (xAI) — Vertex AI publisher is "xai" (not "x-ai")
  // Only grok-4.20-reasoning is enabled in this project; others require Model Garden enablement
  "grok-4.20-reasoning":            { pub: "xai", model: "xai/grok-4.20-reasoning" },
  "grok":                           { pub: "xai", model: "xai/grok-4.20-reasoning" },
  "grok-4":                         { pub: "xai", model: "xai/grok-4" },
  "grok-4-fast":                    { pub: "xai", model: "xai/grok-4-fast" },
  "grok-3":                         { pub: "xai", model: "xai/grok-3" },
  "grok-3-mini":                    { pub: "xai", model: "xai/grok-3-mini" },
  "grok-code-fast-1":               { pub: "xai", model: "xai/grok-code-fast-1" },
};

var GEMINI_ROUTES = {
  // Gemini 3.1
  "gemini-3.1-pro-preview":         { project: PROJECT_02, model: "gemini-3.1-pro-preview" },
  "gemini-3.1-flash-image-preview": { project: PROJECT_02, model: "gemini-3.1-flash-image-preview" },
  "gemini-3.1-flash-lite-preview":  { project: PROJECT_02, model: "gemini-3.1-flash-lite-preview" },
  // Gemini 2.5 image
  "gemini-2.5-flash-image":         { project: PROJECT_02, model: "gemini-2.5-flash-image" },
  // Gemini 3.0
  "gemini-3-pro-preview":           { project: PROJECT_02, model: "gemini-3-pro-preview" },
  "gemini-3-flash-preview":         { project: PROJECT_02, model: "gemini-3-flash-preview" },
  // Gemini 2.5
  "gemini-2.5-pro":                 { project: PROJECT_02, model: "gemini-2.5-pro" },
  "gemini-2.5-flash":               { project: PROJECT_02, model: "gemini-2.5-flash" },
  "gemini-2.5-flash-lite":          { project: PROJECT_02, model: "gemini-2.5-flash-lite" },
  // (Gemini 2.0 series retired by Google — removed; requests fall through to default gemini-2.5-flash)
  // Cross-project: YOUR_CROSS_PROJECT_ID (optional, for quota isolation)
  "YOUR_CROSS_PROJECT_ID/gemini-3.1-pro-preview":        { project: PROJECT_GH, model: "gemini-3.1-pro-preview" },
  "YOUR_CROSS_PROJECT_ID/gemini-3.1-flash-lite-preview": { project: PROJECT_GH, model: "gemini-3.1-flash-lite-preview" },
  "YOUR_CROSS_PROJECT_ID/gemini-3-pro-preview":          { project: PROJECT_GH, model: "gemini-3-pro-preview" },
  "YOUR_CROSS_PROJECT_ID/gemini-3-flash-preview":        { project: PROJECT_GH, model: "gemini-3-flash-preview" },
  "YOUR_CROSS_PROJECT_ID/gemini-2.5-pro":                { project: PROJECT_GH, model: "gemini-2.5-pro" },
  "YOUR_CROSS_PROJECT_ID/gemini-2.5-flash":              { project: PROJECT_GH, model: "gemini-2.5-flash" },
};

var CLAUDE_ROUTES = {
  // Claude 4.7 (Opus available; Sonnet/Haiku not yet released by Anthropic)
  "claude-opus-4-7":   "claude-opus-4-7",
  // Claude 4.6
  "claude-opus-4-6":   "claude-opus-4-6",
  "claude-sonnet-4-6": "claude-sonnet-4-6",
  "claude-haiku-4-5":  "claude-haiku-4-5",
  "claude-opus-4-5":   "claude-opus-4-5",
  "claude-sonnet-4-5": "claude-sonnet-4-5",
  "claude-opus-4":     "claude-opus-4",
  "claude-opus-4-1":   "claude-opus-4-1",
};

// OpenCode Zen free models (verified live 2026-04-23 via /zen/v1/models endpoint)
// Source: https://opencode.ai/docs/zen/
var OPENCODE_MODELS = {
  "opencode/nemotron-3-super-free":      "nemotron-3-super-free",
  "opencode/big-pickle":                 "big-pickle",
  "opencode/minimax-m2.5-free":          "minimax-m2.5-free",
  "opencode/hy3-preview-free":           "hy3-preview-free",
  "opencode/ling-2.6-flash-free":        "ling-2.6-flash-free",
  "opencode/gpt-5-nano":                 "gpt-5-nano",
};

var DEFAULT = { project: PROJECT_02, model: "gemini-2.5-flash" };

// ── KVM 动态配置（由 KV-ReadModelConfig policy 读取）────────────────────────

// 1. 解析禁用模型列表
var kvDisabled = context.getVariable("kvm.disabled_models") || "";
var disabledSet = {};
if (kvDisabled) {
  kvDisabled.split(",").forEach(function(m) {
    var t = m.trim();
    if (t) disabledSet[t] = true;
  });
}

// 2. 覆盖默认回退模型
var kvDefault = context.getVariable("kvm.default_model") || "";
if (kvDefault) {
  DEFAULT = { project: PROJECT_02, model: kvDefault };
}

// 3. 合并额外路由（支持动态新增模型）
var kvExtra = context.getVariable("kvm.extra_routes") || "{}";
try {
  var extra = JSON.parse(kvExtra);
  // 合并各类型的扩展路由
  if (extra.gemini)   { for (var k1 in extra.gemini)   { GEMINI_ROUTES[k1]  = extra.gemini[k1];   } }
  if (extra.claude)   { for (var k2 in extra.claude)   { CLAUDE_ROUTES[k2]  = extra.claude[k2];   } }
  if (extra.maas)     { for (var k3 in extra.maas)     { OPENAPI_ROUTES[k3] = extra.maas[k3];     } }
  if (extra.opencode) { for (var k4 in extra.opencode) { OPENCODE_MODELS[k4]= extra.opencode[k4]; } }
} catch (e) {
  // JSON 解析失败时跳过，不影响正常路由
  context.setVariable("llm.kvm_parse_error", e.message);
}

// ── 路由决策 ─────────────────────────────────────────────────────────────────

var requestedModel = context.getVariable("llm.model") || "";
var isStreaming     = context.getVariable("llm.streaming") === "true";

// 被禁用的模型强制走 DEFAULT（不匹配任何路由）
if (disabledSet[requestedModel]) {
  requestedModel = "";
  context.setVariable("llm.model_disabled", "true");
}

if (OPENCODE_MODELS[requestedModel]) {
  var ocModel = OPENCODE_MODELS[requestedModel];
  context.setVariable("target.url",          OPENCODE);
  context.setVariable("llm.backend",         "opencode");
  context.setVariable("llm.publisher",       "opencode");
  context.setVariable("llm.action",          "chat");
  context.setVariable("llm.project",         "opencode");
  context.setVariable("llm.resolved_model",  ocModel);
  context.setVariable("llm.requested_model", requestedModel);
  context.setVariable("llm.opencode_model",  ocModel);

} else if (OPENAPI_ROUTES[requestedModel]) {
  var r = OPENAPI_ROUTES[requestedModel];
  context.setVariable("target.url",          OPENAPI_URL);
  context.setVariable("llm.backend",         "vertex");
  context.setVariable("llm.publisher",       r.pub);
  context.setVariable("llm.action",          "openapi");
  context.setVariable("llm.project",         PROJECT_02);
  context.setVariable("llm.resolved_model",  r.model);
  context.setVariable("llm.requested_model", requestedModel);
  context.setVariable("llm.openapi_model",   r.model);

} else if (CLAUDE_ROUTES[requestedModel]) {
  var claudeModel = CLAUDE_ROUTES[requestedModel];
  var claudeUrl = VA_BASE + "/" + PROJECT_02 + "/" + GLOBAL_LOC +
                  "/publishers/anthropic/models/" + claudeModel + ":rawPredict";
  context.setVariable("target.url",          claudeUrl);
  context.setVariable("llm.backend",         "vertex");
  context.setVariable("llm.publisher",       "anthropic");
  context.setVariable("llm.action",          "rawPredict");
  context.setVariable("llm.project",         PROJECT_02);
  context.setVariable("llm.resolved_model",  claudeModel);
  context.setVariable("llm.requested_model", requestedModel);

} else {
  // Vertex AI Gemini: generateContent / streamGenerateContent（含 DEFAULT 兜底）
  var gr = GEMINI_ROUTES[requestedModel] || DEFAULT;
  var geminiAction = isStreaming ? "streamGenerateContent?alt=sse" : "generateContent";
  var geminiUrl = VA_BASE + "/" + gr.project + "/" + GLOBAL_LOC +
                  "/publishers/google/models/" + gr.model + ":" + geminiAction;
  context.setVariable("target.url",          geminiUrl);
  context.setVariable("llm.backend",         "vertex");
  context.setVariable("llm.publisher",       "google");
  context.setVariable("llm.action",          "generateContent");   // normalizer uses this; SSE is URL-only
  context.setVariable("llm.project",         gr.project);
  context.setVariable("llm.resolved_model",  gr.model);
  context.setVariable("llm.requested_model", requestedModel || DEFAULT.model);
}
