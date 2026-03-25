/**
 * Parse embedding response in JS (more reliable than EV for arrays).
 * Build upsert payload and store cache.
 */
var cacheId = context.getVariable("llm.cache.id") || "";
var embedStatus = parseInt(context.getVariable("embedPopResponse.status.code") || "0");
var embedContent = context.getVariable("embedPopResponse.content") || "";

if (embedStatus === 200 && embedContent.length > 0 && cacheId) {
  try {
    var embedResponse = JSON.parse(embedContent);
    var embeddingArray = embedResponse.predictions[0].embeddings.values;

    if (embeddingArray && embeddingArray.length > 0) {
      context.setVariable("llm.cache.upsert_payload", JSON.stringify({
        "datapoints": [{"datapointId": cacheId, "featureVector": embeddingArray}]
      }));
      context.setVariable("llm.cache.upsert_ready", true);
    } else {
      context.setVariable("llm.cache.upsert_ready", false);
    }
  } catch(e) {
    context.setVariable("llm.cache.upsert_ready", false);
    context.setVariable("llm.cache.upsert_error", e.message);
  }
} else {
  context.setVariable("llm.cache.upsert_ready", false);
}

// Note: upsert response check is done after SC-UpsertVector runs
// but we can't easily check it here since SC-UpsertVector runs AFTER this JS
