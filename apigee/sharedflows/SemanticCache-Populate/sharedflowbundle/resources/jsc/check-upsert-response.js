var upsertStatus = context.getVariable("upsertResponse.status.code") || "null";
var upsertContent = context.getVariable("upsertResponse.content") || "";
context.setVariable("llm.cache.upsert_status", upsertStatus);
context.setVariable("llm.cache.upsert_resp", upsertContent.slice(0, 150));
