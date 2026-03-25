/**
 * JS-HandleDisabledModel
 *
 * 在语义缓存查找之前（ProxyEndpoint PreFlow）处理被禁用的模型：
 * 1. 读取 kvm.disabled_models（由 KV-ReadModelConfig 设置）
 * 2. 若当前模型被禁用：
 *    a. 修改 request.content 里的 model 字段为默认模型
 *       → 语义缓存将使用 DEFAULT 模型的 key，不会命中被禁用模型的旧缓存
 *    b. 更新 llm.model 为默认模型
 *    c. 记录 llm.original_model 以备日志使用
 *
 * 注意：Apigee Rhino JS 不支持顶层 return，全部用 if-else 结构。
 */
try {
  var kvDisabled = context.getVariable("kvm.disabled_models") || "";
  var currentModel = context.getVariable("llm.model") || "";

  if (kvDisabled && currentModel) {
    // 解析禁用列表
    var disabledSet = {};
    kvDisabled.split(",").forEach(function(m) {
      var t = m.trim();
      if (t) { disabledSet[t] = true; }
    });

    if (disabledSet[currentModel]) {
      // 确定替换目标模型
      var kvDefault   = context.getVariable("kvm.default_model") || "";
      var targetModel = kvDefault || "gemini-2.0-flash-001";

      // 修改 request.content 中的 model 字段（SemanticCache 读 request.content 构建 key）
      var bodyStr = context.getVariable("request.content") || "{}";
      try {
        var body = JSON.parse(bodyStr);
        body.model = targetModel;
        context.setVariable("request.content", JSON.stringify(body));
      } catch(parseErr) {
        context.setVariable("llm.disabled_handler_parse_error", parseErr.message);
      }

      // 更新 llm.model（JS-DetectBackend 和 JS-ModelRouter 使用此变量）
      context.setVariable("llm.original_model", currentModel);
      context.setVariable("llm.model",           targetModel);
      context.setVariable("llm.model_disabled",  "true");
    }
  }
} catch(e) {
  context.setVariable("llm.disabled_handler_error", e.message);
}
