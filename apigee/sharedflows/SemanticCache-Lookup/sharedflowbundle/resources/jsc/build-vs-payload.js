/**
 * Parse embedding response in JS (more reliable than EV for arrays).
 * Build Vector Search findNeighbors payload.
 */
var DEPLOYED_INDEX_ID = "llm_semantic_cache";
var embedStatus = parseInt(context.getVariable("embeddingResponse.status.code") || "0");
var embedContent = context.getVariable("embeddingResponse.content") || "";

context.setVariable("llm.cache.lookup_embed_status", embedStatus);

if (embedStatus === 200 && embedContent.length > 0) {
  try {
    var embedResponse = JSON.parse(embedContent);
    var embeddingArray = embedResponse.predictions[0].embeddings.values;

    if (embeddingArray && embeddingArray.length > 0) {
      // Also store for potential reuse
      context.setVariable("llm.cache.embedding_json", JSON.stringify(embeddingArray));

      var vsPayload = JSON.stringify({
        "deployed_index_id": DEPLOYED_INDEX_ID,
        "queries": [{
          "datapoint": {
            "datapointId": "query",
            "featureVector": embeddingArray
          },
          "neighborCount": 1
        }]
      });
      context.setVariable("llm.cache.vs_payload", vsPayload);
      context.setVariable("llm.cache.embedding_ready", true);
    } else {
      context.setVariable("llm.cache.embedding_ready", false);
    }
  } catch(e) {
    context.setVariable("llm.cache.embedding_ready", false);
    context.setVariable("llm.cache.embed_parse_error", e.message);
  }
} else {
  context.setVariable("llm.cache.embedding_ready", false);
}
