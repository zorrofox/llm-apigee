/**
 * Extract prompt text and build embedding request payload.
 */
try {
  var body = JSON.parse(context.getVariable("request.content") || "{}");
  var messages = body.messages || [];
  var model = body.model || "";

  var promptText = "";
  for (var i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") {
      var content = messages[i].content;
      promptText = (typeof content === "string") ? content :
                   (Array.isArray(content) ? content.map(function(c){ return c.text||""; }).join(" ") : String(content));
      break;
    }
  }

  var cacheKeyText = model + ":" + promptText;
  context.setVariable("llm.cache.prompt_text", promptText);
  context.setVariable("llm.cache.key_text",    cacheKeyText);
  context.setVariable("llm.cache.hit",         false);

  // JSON-escape content for safe embedding in Apigee payload template
  // (avoids double-substitution when variable value contains JSON braces)
  context.setVariable("llm.cache.key_text_escaped", JSON.stringify(cacheKeyText).slice(1,-1));

} catch(e) {
  context.setVariable("llm.cache.error",       "extract-prompt: " + e.message);
  context.setVariable("llm.cache.prompt_text", "");
  context.setVariable("llm.cache.key_text",    "");
  context.setVariable("llm.cache.hit",         false);
}
