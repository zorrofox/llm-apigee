/**
 * POST /api/quota — 批量更新 API Product 配额属性（一次读写，避免并发覆盖）
 */
import { NextRequest, NextResponse } from 'next/server';
import { setProductAttributes }      from '@/lib/apigee';
import { requireIAP }                from '@/lib/auth';

export async function POST(req: NextRequest) {
  try { requireIAP(req.headers); }
  catch { return NextResponse.json({ error: '未授权' }, { status: 401 }); }

  const body = await req.json();
  const { productName, tokenQuotaLimit, reqQuota, interval, timeUnit } = body;

  if (!productName) {
    return NextResponse.json({ error: '参数错误：缺少 productName' }, { status: 400 });
  }

  // 收集所有要更新的属性，一次性写入（避免并发读写竞争）
  const updates: Record<string, string> = {};

  if (typeof tokenQuotaLimit === 'number') {
    updates['developer.token.quota.limit'] = String(tokenQuotaLimit);
    if (interval)  updates['developer.token.quota.interval'] = String(interval);
    if (timeUnit)  updates['developer.token.quota.timeunit'] = timeUnit;
  }

  if (typeof reqQuota === 'number') {
    updates['developer.quota.limit'] = String(reqQuota);
    if (interval)  updates['developer.quota.interval'] = String(interval);
    if (timeUnit)  updates['developer.quota.timeunit'] = timeUnit;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: '没有可更新的字段' }, { status: 400 });
  }

  try {
    await setProductAttributes(productName, updates);
    return NextResponse.json({ ok: true, updated: Object.keys(updates) });
  } catch (e) {
    console.error('配额更新失败:', e);
    return NextResponse.json({ error: '配额更新失败' }, { status: 500 });
  }
}
