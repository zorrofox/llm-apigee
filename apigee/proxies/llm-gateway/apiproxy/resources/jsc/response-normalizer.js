/**
 * JS-ResponseNormalizer: Normalize backend response to OpenAI format.
 *
 *  - Gemini (generateContent) → OpenAI
 *  - Claude (rawPredict)      → OpenAI
 *  - OpenAPI/MaaS/OpenCode    → passthrough; handle null content + reasoning_content
 */

var publisher = context.getVariable("llm.publisher") || "google";
var action    = context.getVariable("llm.action")    || "generateContent";
var resolvedModel = context.getVariable("llm.resolved_model") || "unknown";
var statusCode = parseInt(context.getVariable("response.status.code") || "200");

if (statusCode >= 400) {
  // Normalize backend error responses to consistent OpenAI-compatible format.
  // Without this, Vertex AI / MaaS raw error bodies pass through as-is,
  // making it impossible for clients to distinguish gateway errors from model errors.
  try {
    var errRaw  = context.getVariable("response.content") || "{}";
    var errBody = JSON.parse(errRaw);
    // Extract message from various backend formats:
    //   Vertex AI:  {"error":{"message":"...","status":"RESOURCE_EXHAUSTED"}}
    //   MaaS:       {"error":{"message":"...","code":429}}
    //   Anthropic:  {"error":{"message":"...","type":"..."}}
    var errObj    = errBody.error || errBody;
    var errMsg    = errObj.message || ("Upstream model error (HTTP " + statusCode + ")");
    var errStatus = errObj.status  || "";
    var errCode   = (statusCode === 429) ? "upstream_rate_limit" : "upstream_error";
    var normalized = {
      error: {
        message: errMsg + (errStatus ? " (" + errStatus + ")" : ""),
        type:    "upstream_error",
        code:    errCode,
        source:  "model"
      }
    };
    context.setVariable("response.content",             JSON.stringify(normalized));
    context.setVariable("response.header.Content-Type", "application/json");
    if (statusCode === 429) {
      context.setVariable("response.header.Retry-After", "60");
    }
  } catch(e) {
    // Leave raw response if parsing fails
  }
} else if (statusCode < 400) {
  try {
    var raw  = context.getVariable("response.content") || "{}";
    var body = JSON.parse(raw);
    var resp;

    if (action === "generateContent") {
      // Gemini → OpenAI
      var candidate = (body.candidates || [{}])[0];
      var parts = (candidate.content || {}).parts || [{}];
      var usage = body.usageMetadata || {};

      // Check if response contains image parts (inlineData)
      var hasImage = false;
      for (var pi = 0; pi < parts.length; pi++) {
        if (parts[pi].inlineData) { hasImage = true; break; }
      }
      if (hasImage) {
        context.setVariable("llm.has_image", "true");
      }

      var content;
      if (hasImage) {
        // Mixed text + image: return OpenAI content array format
        var contentItems = [];
        var pendingText = [];
        for (var pj = 0; pj < parts.length; pj++) {
          var p = parts[pj];
          if (p.text) {
            pendingText.push(p.text);
          } else if (p.inlineData) {
            if (pendingText.length > 0) {
              contentItems.push({ type: "text", text: pendingText.join("") });
              pendingText = [];
            }
            contentItems.push({
              type: "image_url",
              image_url: { url: "data:" + p.inlineData.mimeType + ";base64," + p.inlineData.data }
            });
          }
        }
        if (pendingText.length > 0) {
          contentItems.push({ type: "text", text: pendingText.join("") });
        }
        content = contentItems;
      } else {
        // Text only: return as plain string (existing behavior)
        content = parts.map(function(p){ return p.text || ""; }).join("");
      }

      resp = {
        id: "chatcmpl-" + context.getVariable("messageid"),
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: resolvedModel,
        choices: [{
          index: 0,
          message: { role: "assistant", content: content },
          finish_reason: (candidate.finishReason || "STOP").toLowerCase()
        }],
        usage: {
          prompt_tokens:     usage.promptTokenCount || 0,
          completion_tokens: usage.candidatesTokenCount || 0,
          total_tokens:      usage.totalTokenCount || 0
        }
      };

    } else if (action === "rawPredict") {
      // Claude → OpenAI
      var blocks = body.content || [{}];
      var claudeText = blocks.map(function(b){ return b.text || ""; }).join("");
      var claudeUsage = body.usage || {};
      var stopReason = body.stop_reason || "stop";
      resp = {
        id: "chatcmpl-" + (body.id || context.getVariable("messageid")),
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: resolvedModel,
        choices: [{
          index: 0,
          message: { role: "assistant", content: claudeText },
          finish_reason: (stopReason === "end_turn") ? "stop" : stopReason
        }],
        usage: {
          prompt_tokens:     claudeUsage.input_tokens || 0,
          completion_tokens: claudeUsage.output_tokens || 0,
          total_tokens:      (claudeUsage.input_tokens || 0) + (claudeUsage.output_tokens || 0)
        }
      };

    } else {
      // OpenAPI MaaS / OpenCode: already OpenAI-compat
      // Handle null content + reasoning_content (thinking models: GLM-5, Kimi, Qwen-thinking, etc.)
      if (body.choices && body.choices.length > 0) {
        var msg = body.choices[0].message || {};
        if (msg.content === null || msg.content === undefined) {
          // Extract from reasoning_content (Vertex OpenAPI) or reasoning_details (OpenCode)
          var text2 = msg.reasoning_content || "";
          if (!text2) {
            var details = msg.reasoning_details || [];
            for (var i = 0; i < details.length; i++) { text2 += (details[i].text || ""); }
          }
          msg.content = text2 || "";
        }
        body.model = resolvedModel;
      }
      resp = body;
    }

    // Store token counts for logging
    if (resp.usage) {
      context.setVariable("llm.prompt_tokens",     resp.usage.prompt_tokens);
      context.setVariable("llm.completion_tokens", resp.usage.completion_tokens);
      context.setVariable("llm.total_tokens",      resp.usage.total_tokens);
    }

    context.setVariable("response.content", JSON.stringify(resp));
    context.setVariable("response.header.Content-Type", "application/json");

  } catch(e) {
    context.setVariable("llm.response_normalizer_error", e.message);
  }
} // end else if (statusCode < 400)
