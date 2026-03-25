/**
 * POST /api/keys?action=revoke  — 撤销 API Key
 * PATCH /api/keys               — 更新 App 属性（配额覆盖、备注）
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireIAP }               from '@/lib/auth';
import { GoogleAuth }               from 'google-auth-library';

const ORG  = process.env.APIGEE_ORG ?? '';
const BASE = `https://apigee.googleapis.com/v1/organizations/${ORG}`;
const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });

async function apigee(method: string, path: string, body?: unknown) {
  const client = await auth.getClient();
  const token  = await client.getAccessToken();
  const res    = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token.token}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return res;
}

/** 撤销 API Key */
export async function POST(req: NextRequest) {
  try { requireIAP(req.headers); }
  catch { return NextResponse.json({ error: '未授权' }, { status: 401 }); }

  const { developerEmail, appName, consumerKey } = await req.json();
  if (!developerEmail || !appName || !consumerKey) {
    return NextResponse.json({ error: '参数错误' }, { status: 400 });
  }

  const res = await apigee(
    'POST',
    `/developers/${developerEmail}/apps/${appName}/keys/${consumerKey}?action=revoke`,
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return NextResponse.json({ error: (err as {error?: {message?: string}}).error?.message ?? '撤销失败' }, { status: res.status });
  }
  return NextResponse.json({ ok: true });
}

/** 更新 App 属性（token 配额覆盖 + 备注） */
export async function PATCH(req: NextRequest) {
  try { requireIAP(req.headers); }
  catch { return NextResponse.json({ error: '未授权' }, { status: 401 }); }

  const { developerEmail, appName, tokenQuotaLimit, notes } = await req.json();
  if (!developerEmail || !appName) {
    return NextResponse.json({ error: '参数错误' }, { status: 400 });
  }

  // 更新多个属性（token.quota.limit + notes）
  const updates = [
    { name: 'token.quota.limit', value: tokenQuotaLimit != null && tokenQuotaLimit !== '' ? String(tokenQuotaLimit) : '' },
    { name: 'notes',             value: notes ?? '' },
  ];

  const errors: string[] = [];
  for (const attr of updates) {
    const res = await apigee(
      'POST',
      `/developers/${developerEmail}/apps/${appName}/attributes/${attr.name}`,
      attr,
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      errors.push((err as {error?: {message?: string}}).error?.message ?? `更新 ${attr.name} 失败`);
    }
  }

  if (errors.length > 0) {
    return NextResponse.json({ error: errors.join('; ') }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
