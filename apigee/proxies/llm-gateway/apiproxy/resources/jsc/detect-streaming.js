/**
 * JS-DetectStreaming: Detect if client requested streaming mode.
 * Must run in ProxyEndpoint PreFlow before FC-SemanticCacheLookup.
 * Sets llm.streaming = "true" | "false"
 */
try {
  var body = JSON.parse(context.getVariable("request.content") || "{}");
  context.setVariable("llm.streaming", body.stream === true ? "true" : "false");
} catch(e) {
  context.setVariable("llm.streaming", "false");
}
