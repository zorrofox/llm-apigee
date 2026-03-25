/**
 * JS-ComputeLatency: 计算请求延迟并存入变量供 ML-CloudLogging 记录
 * totalLatencyMs  = system.timestamp - client.received.start.timestamp （总延迟，ms）
 * targetLatencyMs = target.sent.start.timestamp → target.received.end.timestamp（后端耗时，ms）
 */
try {
  var clientStart = context.getVariable('client.received.start.timestamp');
  var now         = context.getVariable('system.timestamp');

  var totalMs = -1;
  if (clientStart !== null && clientStart !== undefined && now !== null && now !== undefined) {
    var startNum = parseInt(String(clientStart), 10);
    var nowNum   = parseInt(String(now), 10);
    if (!isNaN(startNum) && !isNaN(nowNum) && nowNum > startNum) {
      totalMs = nowNum - startNum;
    }
  }

  // target.elapsed.time 仅在走后端时有值，cache HIT 时为空
  var targetStart = context.getVariable('target.sent.start.timestamp');
  var targetEnd   = context.getVariable('target.received.end.timestamp');
  var targetMs    = -1;
  if (targetStart !== null && targetStart !== undefined &&
      targetEnd   !== null && targetEnd   !== undefined) {
    var ts = parseInt(String(targetStart), 10);
    var te = parseInt(String(targetEnd),   10);
    if (!isNaN(ts) && !isNaN(te) && te > ts) {
      targetMs = te - ts;
    }
  }

  context.setVariable('llm.total_latency_ms',  totalMs  >= 0 ? String(totalMs)  : '');
  context.setVariable('llm.target_latency_ms', targetMs >= 0 ? String(targetMs) : '');
} catch (e) {
  // 不允许延迟计算失败影响正常响应
  context.setVariable('llm.total_latency_ms',  '');
  context.setVariable('llm.target_latency_ms', '');
}
