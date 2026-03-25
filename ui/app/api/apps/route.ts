/**
 * POST /api/apps — 创建新 Developer App
 *
 * 如果开发者不存在，自动先创建开发者，再创建 App。
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireIAP }               from '@/lib/auth';
import { GoogleAuth }               from 'google-auth-library';

const ORG  = process.env.APIGEE_ORG ?? '';
const BASE = `https://apigee.googleapis.com/v1/organizations/${ORG}`;
const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });

async function getToken() {
  const client = await auth.getClient();
  return (await client.getAccessToken()).token!;
}

/** 检查开发者是否存在 */
async function developerExists(email: string, token: string): Promise<boolean> {
  const res = await fetch(`${BASE}/developers/${email}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.ok;
}

/** 自动创建开发者（从邮箱推断姓名） */
async function createDeveloper(email: string, token: string): Promise<void> {
  // 从邮箱解析用户名作为显示名称
  const username    = email.split('@')[0].replace(/[._-]/g, ' ');
  const parts       = username.split(' ');
  const firstName   = parts[0] ?? 'User';
  const lastName    = parts.slice(1).join(' ') || firstName;

  const res = await fetch(`${BASE}/developers`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      firstName,
      lastName,
      userName: email,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as {error?: {message?: string}}).error?.message ?? '创建开发者失败');
  }
}

export async function POST(req: NextRequest) {
  try { requireIAP(req.headers); }
  catch { return NextResponse.json({ error: '未授权' }, { status: 401 }); }

  const { developerEmail, appName, productName, tokenQuotaLimit } = await req.json();

  if (!developerEmail || !appName || !productName) {
    return NextResponse.json({ error: '参数错误：缺少必填字段' }, { status: 400 });
  }

  try {
    const token = await getToken();

    // 开发者不存在时自动创建
    const exists = await developerExists(developerEmail, token);
    if (!exists) {
      await createDeveloper(developerEmail, token);
    }

    // 创建 App
    const res = await fetch(`${BASE}/developers/${developerEmail}/apps`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: appName,
        apiProducts: [productName],
        ...(tokenQuotaLimit ? {
          attributes: [{ name: 'token.quota.limit', value: String(tokenQuotaLimit) }],
        } : {}),
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return NextResponse.json(
        { error: (err as {error?: {message?: string}}).error?.message ?? 'App 创建失败' },
        { status: res.status },
      );
    }

    const app = await res.json();
    return NextResponse.json({
      ok: true,
      app,
      developerCreated: !exists, // 告知前端是否同时创建了开发者
    });

  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
