/**
 * JS-ResolveTokenQuota
 *
 * 优先级：App 级覆盖 > API Product 默认 > 兜底值（1,000,000）
 *
 * App 级覆盖通过 UI 写入 Apigee App 自定义属性 `token.quota.limit`，
 * VerifyAPIKey 执行后可通过以下变量读取：
 *   verifyapikey.VA-VerifyApiKey.app.token.quota.limit
 *
 * API Product 默认通过属性 `developer.token.quota.limit` 读取：
 *   verifyapikey.VA-VerifyApiKey.apiproduct.developer.token.quota.limit
 */
var appOverride  = context.getVariable('verifyapikey.VA-VerifyApiKey.app.token.quota.limit');
var productLimit = context.getVariable('verifyapikey.VA-VerifyApiKey.apiproduct.developer.token.quota.limit');

var effective;
if (appOverride && parseInt(appOverride, 10) > 0) {
  effective = appOverride;                       // App 级覆盖
} else if (productLimit && parseInt(productLimit, 10) > 0) {
  effective = productLimit;                      // Product 默认
} else {
  effective = '1000000';                         // 兜底 1M tokens/hr
}

context.setVariable('token.quota.effective_limit', effective);
context.setVariable('token.quota.source',
  appOverride ? 'app_override' : productLimit ? 'product_default' : 'fallback');
