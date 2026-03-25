/**
 * GET    /api/alerts          → 列出告警策略
 * POST   /api/alerts          → 创建新告警策略
 * PATCH  /api/alerts?name=x  → 更新（enabled/threshold）
 * DELETE /api/alerts?name=x  → 删除
 *
 * GET    /api/alerts?channels=1 → 列出通知渠道
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireIAP }               from '@/lib/auth';
import {
  listAlertPolicies, listNotificationChannels,
  createAlertPolicy, setAlertEnabled, updateAlertThreshold,
  deleteAlertPolicy, ALERT_TEMPLATES,
} from '@/lib/alerts';

export async function GET(req: NextRequest) {
  try { requireIAP(req.headers); }
  catch { return NextResponse.json({ error: '未授权' }, { status: 401 }); }

  const { searchParams } = new URL(req.url);
  if (searchParams.get('channels') === '1') {
    const channels = await listNotificationChannels();
    return NextResponse.json({ channels });
  }
  const policies = await listAlertPolicies();
  return NextResponse.json({ policies });
}

export async function POST(req: NextRequest) {
  try { requireIAP(req.headers); }
  catch { return NextResponse.json({ error: '未授权' }, { status: 401 }); }

  const { templateIndex, threshold, channelIds } = await req.json();
  const tpl = ALERT_TEMPLATES[Number(templateIndex)];
  if (!tpl) return NextResponse.json({ error: '无效的模板索引' }, { status: 400 });

  try {
    const policy = await createAlertPolicy(tpl, Number(threshold), channelIds ?? []);
    return NextResponse.json({ ok: true, policy });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try { requireIAP(req.headers); }
  catch { return NextResponse.json({ error: '未授权' }, { status: 401 }); }

  const { searchParams } = new URL(req.url);
  const name = searchParams.get('name');
  if (!name) return NextResponse.json({ error: '缺少 name 参数' }, { status: 400 });
  const policyName = `projects/${process.env.GOOGLE_CLOUD_PROJECT ?? ''}/alertPolicies/${name}`;

  const body = await req.json();
  try {
    if ('enabled' in body) {
      await setAlertEnabled(policyName, Boolean(body.enabled));
    }
    if ('threshold' in body && 'conditionName' in body) {
      await updateAlertThreshold(policyName, body.conditionName, Number(body.threshold));
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try { requireIAP(req.headers); }
  catch { return NextResponse.json({ error: '未授权' }, { status: 401 }); }

  const { searchParams } = new URL(req.url);
  const name = searchParams.get('name');
  if (!name) return NextResponse.json({ error: '缺少 name 参数' }, { status: 400 });
  const policyName = `projects/${process.env.GOOGLE_CLOUD_PROJECT ?? ''}/alertPolicies/${name}`;

  try {
    await deleteAlertPolicy(policyName);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
