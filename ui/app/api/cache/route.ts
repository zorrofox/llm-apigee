/**
 * GET  /api/cache — 读取 KVM cache-config 当前配置
 * PATCH /api/cache — 更新配置（similarity_threshold）
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireIAP }               from '@/lib/auth';
import { GoogleAuth }               from 'google-auth-library';

const ORG  = process.env.APIGEE_ORG ?? '';
const ENV  = process.env.APIGEE_ENV ?? 'eval';
const BASE = `https://apigee.googleapis.com/v1/organizations/${ORG}`;
const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });

async function getToken() {
  const client = await auth.getClient();
  return (await client.getAccessToken()).token!;
}

async function kvmGet(key: string): Promise<string> {
  const token = await getToken();
  const res   = await fetch(`${BASE}/environments/${ENV}/keyvaluemaps/cache-config/entries/${key}`, {
    headers: { Authorization: `Bearer ${token}` }, cache: 'no-store',
  });
  if (!res.ok) return '';
  return (await res.json()).value ?? '';
}

async function kvmSet(key: string, value: string): Promise<void> {
  const token = await getToken();
  const res   = await fetch(`${BASE}/environments/${ENV}/keyvaluemaps/cache-config/entries/${key}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: key, value }),
  });
  if (!res.ok) throw new Error(`KVM 写入失败: ${res.status}`);
}

export async function GET(req: NextRequest) {
  try { requireIAP(req.headers); }
  catch { return NextResponse.json({ error: '未授权' }, { status: 401 }); }

  const threshold = await kvmGet('similarity_threshold');
  return NextResponse.json({
    similarityThreshold: threshold ? Number(threshold) : null,  // null = 使用代码默认值 0.95
    defaultThreshold:    0.95,
  });
}

export async function PATCH(req: NextRequest) {
  try { requireIAP(req.headers); }
  catch { return NextResponse.json({ error: '未授权' }, { status: 401 }); }

  const { similarityThreshold } = await req.json();

  if (similarityThreshold !== null && (typeof similarityThreshold !== 'number' || similarityThreshold <= 0 || similarityThreshold > 1)) {
    return NextResponse.json({ error: '阈值必须为 0~1 之间的数值，或 null（恢复默认）' }, { status: 400 });
  }

  try {
    // null = 清空 → 代码内默认值 0.95 生效
    await kvmSet('similarity_threshold', similarityThreshold !== null ? String(similarityThreshold) : '');
    return NextResponse.json({ ok: true, similarityThreshold });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
