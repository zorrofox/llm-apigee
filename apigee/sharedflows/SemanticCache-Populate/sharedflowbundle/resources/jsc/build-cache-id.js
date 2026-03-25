/**
 * Compute stable cache ID from prompt hash AND build embedding request payload.
 */
function fnv1a(str) {
  var hash = 2166136261;
  for (var i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 16777619) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

try {
  var keyText = context.getVariable("llm.cache.key_text") || "";
  var half = Math.floor(keyText.length / 2);
  var cacheId = fnv1a(keyText.slice(0, half)) + fnv1a(keyText.slice(half));
  context.setVariable("llm.cache.id", cacheId);

  // Ensure JSON-escaped key text is available for SC-GetEmbeddingPopulate payload template
  // (key_text_escaped may already be set by extract-prompt.js; set here as fallback)
  context.setVariable("llm.cache.key_text_escaped", JSON.stringify(keyText).slice(1,-1));

} catch(e) {
  context.setVariable("llm.cache.id", Date.now().toString(16));
  context.setVariable("llm.cache.embed_error", e.message);
}
