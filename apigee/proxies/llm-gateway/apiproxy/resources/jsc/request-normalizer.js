/**
 * JS-RequestNormalizer: Adapt OpenAI request to backend-specific format.
 *
 *  - Gemini     → contents[] + generationConfig
 *  - Claude     → Anthropic format + anthropic_version
 *  - MaaS/OpenAPI → passthrough, rewrite model to "publisher/model" format
 *  - OpenCode   → passthrough, strip "opencode/" prefix from model
 */

var publisher     = context.getVariable("llm.publisher")     || "google";
var action        = context.getVariable("llm.action")        || "generateContent";
var opencodeModel = context.getVariable("llm.opencode_model") || "";
var openapiModel  = context.getVariable("llm.openapi_model")  || "";
var resolvedModel = context.getVariable("llm.resolved_model") || "";

try {
  var body = JSON.parse(context.getVariable("request.content") || "{}");
  var messages    = body.messages || [];
  var maxTokens   = body.max_tokens;
  var temperature = body.temperature;
  var stream      = body.stream || false;
  var newBody;

  if (action === "generateContent" || action === "streamGenerateContent") {
    // Gemini generateContent format
    var contents = [];
    var systemInstruction = null;
    messages.forEach(function(msg) {
      var content = msg.content;
      var text = (typeof content === "string") ? content :
                 (Array.isArray(content) ? content.map(function(c){ return c.text||""; }).join("") : String(content));
      if (msg.role === "system") {
        systemInstruction = { parts: [{ text: text }] };
      } else {
        contents.push({ role: (msg.role === "assistant") ? "model" : "user", parts: [{ text: text }] });
      }
    });
    newBody = { contents: contents, generationConfig: { maxOutputTokens: maxTokens || 8192 } };
    if (temperature !== undefined && temperature !== null) newBody.generationConfig.temperature = temperature;
    if (systemInstruction) newBody.systemInstruction = systemInstruction;

    // responseModalities: pass through from client, or default to ["TEXT","IMAGE"] for image models
    var responseModalities = body.responseModalities;
    var imageModels = ["gemini-3.1-flash-image-preview", "gemini-2.5-flash-image"];
    if (!responseModalities && imageModels.indexOf(resolvedModel) !== -1) {
      responseModalities = ["TEXT", "IMAGE"];
    }
    if (responseModalities) {
      newBody.generationConfig.responseModalities = responseModalities;
    }

  } else if (action === "rawPredict") {
    // Anthropic Claude rawPredict format
    var claudeMessages = [];
    var claudeSystem = null;
    messages.forEach(function(msg) {
      var content = msg.content;
      var text = (typeof content === "string") ? content :
                 (Array.isArray(content) ? content.map(function(c){ return c.text||""; }).join("") : String(content));
      if (msg.role === "system") { claudeSystem = text; }
      else { claudeMessages.push({ role: msg.role, content: text }); }
    });
    newBody = { anthropic_version: "vertex-2023-10-16", messages: claudeMessages, max_tokens: maxTokens || 8192 };
    if (claudeSystem) newBody.system = claudeSystem;
    if (temperature !== undefined && temperature !== null) newBody.temperature = temperature;
    if (stream) newBody.stream = true;

  } else if (action === "openapi" && openapiModel) {
    // Vertex AI OpenAPI MaaS endpoint: rewrite model field to "publisher/model" format
    newBody = body;
    newBody.model = openapiModel;   // e.g. "zai-org/glm-5-maas"

  } else if (opencodeModel) {
    // OpenCode Zen: strip "opencode/" prefix
    newBody = body;
    newBody.model = opencodeModel;

  } else {
    // Fallback passthrough
    newBody = body;
  }

  context.setVariable("request.content", JSON.stringify(newBody));
  context.setVariable("request.header.Content-Type", "application/json");

} catch(e) {
  context.setVariable("llm.normalizer_error", e.message);
}
