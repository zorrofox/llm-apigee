/**
 * POST /api/quota/app — 设置单个 App 的 token 配额覆盖
 *
 * 写入 App 自定义属性 `token.quota.limit`
 * Apigee 代理中 JS-ResolveTokenQuota 优先读取此属性，
 * 未设置时回退到 API Product 级默认值。
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireIAP }               from '@/lib/auth';
import { GoogleAuth }               from 'google-auth-library';

const ORG  = process.env.APIGEE_ORG ?? '';
const BASE = `https://apigee.googleapis.com/v1/organizations/${ORG}`;
const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });

export async function POST(req: NextRequest) {
  try { requireIAP(req.headers); }
  catch { return NextResponse.json({ error: '未授权' }, { status: 401 }); }

  const { developerEmail, appName, tokenQuotaLimit } = await req.json();

  if (!developerEmail || !appName) {
    return NextResponse.json({ error: '参数错误：缺少 developerEmail 或 appName' }, { status: 400 });
  }

  const client = await auth.getClient();
  const token  = await client.getAccessToken();

  // tokenQuotaLimit 为 null/'' 时表示清除覆盖（回退到 Product 默认）
  const value = tokenQuotaLimit != null && tokenQuotaLimit !== '' ? String(tokenQuotaLimit) : '';

  const res = await fetch(
    `${BASE}/developers/${developerEmail}/apps/${appName}/attributes/token.quota.limit`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'token.quota.limit', value }),
    },
  );

  if (!res.ok) {
    const err = await res.text();
    return NextResponse.json({ error: `Apigee 错误: ${err}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
