/**
 * 判断 Vector Search 结果是否命中语义缓存
 *
 * 相似度阈值优先级：
 *   KVM cache-config.similarity_threshold (由 KV-ReadCacheConfig 读取)
 *   > 代码内默认值 0.95
 *
 * 阈值通过 KVM 动态修改，约 30s 生效，无需重新部署。
 */

// 从 KVM 读取阈值（KV-ReadCacheConfig policy 在此之前运行）
var DEFAULT_THRESHOLD = 0.95;
var kvThreshold = context.getVariable("kvm.similarity_threshold");
var SIMILARITY_THRESHOLD = DEFAULT_THRESHOLD;
if (kvThreshold) {
  var parsed = parseFloat(kvThreshold);
  if (!isNaN(parsed) && parsed > 0 && parsed <= 1) {
    SIMILARITY_THRESHOLD = parsed;
  }
}

context.setVariable("llm.cache.hit",       false);
context.setVariable("llm.cache.threshold", String(SIMILARITY_THRESHOLD));

var vsStatus = context.getVariable("vectorSearchResponse.status.code") || "null";
context.setVariable("llm.cache.vs_status", vsStatus);

try {
  var raw = context.getVariable("vectorSearchResponse.content") || "{}";
  var vsResponse = JSON.parse(raw);
  var nearest = ((vsResponse.nearestNeighbors || [])[0] || {}).neighbors || [];

  context.setVariable("llm.cache.neighbor_count", nearest.length);

  if (nearest.length > 0) {
    var top   = nearest[0];
    var score = parseFloat(top.distance || 0);
    context.setVariable("llm.cache.score", score);
    if (score >= SIMILARITY_THRESHOLD) {
      context.setVariable("llm.cache.hit", true);
      context.setVariable("llm.cache.key", top.datapoint.datapointId);
    }
  } else {
    context.setVariable("llm.cache.score",          0);
    context.setVariable("llm.cache.neighbor_count", 0);
  }
} catch(e) {
  context.setVariable("llm.cache.vs_error", e.message);
}
