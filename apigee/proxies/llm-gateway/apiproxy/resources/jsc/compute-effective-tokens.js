/**
 * JS-ComputeEffectiveTokens: Compute model-weighted effective token count.
 *
 * Effective tokens = (input + output * 4) * model_weight
 * - Output tokens cost ~4x input tokens on average
 * - Model weight reflects relative pricing vs gemini-2.0-flash-001 (baseline = 1.0)
 * - Used as MessageWeight in Q-TokenQuotaCounter so quota reflects actual cost
 */

var MODEL_WEIGHTS = {
  // Gemini 2.0 (baseline)
  "gemini-2.0-flash-001":  1.0,
  "gemini-2.0-flash":      1.0,
  "gemini-2.0-flash-lite": 0.5,
  // Gemini 2.5
  "gemini-2.5-flash-lite": 1.0,
  "gemini-2.5-flash":      3.5,
  "gemini-2.5-pro":        37.5,
  // Gemini 3
  "gemini-3-flash-preview":        3.5,
  "gemini-3-pro-preview":          37.5,
  "gemini-3.1-flash-lite-preview": 1.0,
  "gemini-3.1-flash-image-preview":3.5,
  "gemini-3.1-pro-preview":        37.5,
  // Claude
  "claude-haiku-4-5":  6.25,
  "claude-sonnet-4-5": 37.5,
  "claude-sonnet-4-6": 37.5,
  "claude-opus-4":     187.5,
  "claude-opus-4-1":   187.5,
  "claude-opus-4-5":   187.5,
  "claude-opus-4-6":   187.5,
  // MaaS partner models (approximate mid-range weight)
  "glm-4.7":       5.0,
  "glm-5":         10.0,
  "deepseek-v3.2": 5.0,
  "deepseek-ocr":  5.0,
  "kimi-k2-thinking": 15.0,
  "minimax-m2":    10.0,
  "qwen3-235b":    10.0,
  "qwen3-next-80b":5.0,
  "qwen3-next-80b-think": 10.0,
  "qwen3-coder":   10.0,
};

var model     = context.getVariable("llm.resolved_model") || "";
var weight    = MODEL_WEIGHTS[model] || 5.0;  // unknown models: mid-range default
var inputTok  = parseInt(context.getVariable("llm.prompt_tokens")     || 0);
var outputTok = parseInt(context.getVariable("llm.completion_tokens") || 0);

// output tokens priced ~4x input; multiply by model weight for cost equivalence
// Store as string "NNN" — Apigee Quota MessageWeight rejects JS floats (e.g. 375.0)
// but correctly parses string integers (e.g. "375")
var effectiveNum = Math.max(1, Math.ceil((inputTok + outputTok * 4) * weight));
var effective    = String(Math.floor(effectiveNum));

context.setVariable("llm.effective_tokens", effective);
context.setVariable("llm.token_weight",     weight);
