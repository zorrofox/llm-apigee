/**
 * IAP 认证工具
 *
 * 主防线：Cloud Load Balancer + IAP（GCP 基础设施层）
 * 纵深防御：每个 Route Handler 独立调用 requireIAP()，不依赖 middleware.ts
 *
 * 安全说明：Next.js < 15.2.3 存在 CVE-2025-29927 中间件绕过漏洞，
 * 攻击者可通过 x-middleware-subrequest header 完全跳过 middleware.ts，
 * 因此绝不以 middleware 作为唯一认证点。
 */

/** 从 IAP 注入的 header 中提取已认证用户邮箱 */
export function getIAPUser(headers: Headers): string | null {
  // Cloud Run + IAP 注入: accounts.google.com:user@example.com
  const raw = headers.get('x-goog-authenticated-user-email');
  if (!raw) return null;
  return raw.replace('accounts.google.com:', '');
}

/** 强制要求 IAP 认证，未认证时抛出 401 */
export function requireIAP(headers: Headers): string {
  // 本地开发跳过（仅限 localhost，生产环境 IAP 会拒绝无 header 请求）
  if (process.env.NODE_ENV === 'development') {
    return process.env.DEV_USER_EMAIL ?? 'dev@localhost';
  }
  const user = getIAPUser(headers);
  if (!user) throw new Response('Unauthorized', { status: 401 });
  return user;
}
