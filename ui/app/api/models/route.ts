/**
 * PATCH /api/models — 更新模型路由动态配置（写入 Apigee KVM）
 * body: { action: "disable"|"enable"|"setDefault"|"setExtraRoutes", model?: string, value?: string }
 * KVM 更新后约 30s 在 Apigee 运行时生效（ExpiryTimeInSecs=30）
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireIAP }               from '@/lib/auth';
import { setDisabledModels, setDefaultModel, setExtraRoutes, getRoutingConfig } from '@/lib/model-routing';

export async function PATCH(req: NextRequest) {
  try { requireIAP(req.headers); }
  catch { return NextResponse.json({ error: '未授权' }, { status: 401 }); }

  const body = await req.json();
  const { action, model, value } = body as { action: string; model?: string; value?: string };

  try {
    switch (action) {
      case 'disable': {
        if (!model) return NextResponse.json({ error: '缺少 model 参数' }, { status: 400 });
        const cfg = await getRoutingConfig();
        const next = [...new Set([...cfg.kvmDisabled, model])];
        await setDisabledModels(next);
        return NextResponse.json({ ok: true, disabled: next });
      }
      case 'enable': {
        if (!model) return NextResponse.json({ error: '缺少 model 参数' }, { status: 400 });
        const cfg2 = await getRoutingConfig();
        const next2 = cfg2.kvmDisabled.filter(m => m !== model);
        await setDisabledModels(next2);
        return NextResponse.json({ ok: true, disabled: next2 });
      }
      case 'setDefault': {
        if (!model) return NextResponse.json({ error: '缺少 model 参数' }, { status: 400 });
        await setDefaultModel(model);
        return NextResponse.json({ ok: true, defaultModel: model });
      }
      case 'setExtraRoutes': {
        if (!value) return NextResponse.json({ error: '缺少 value 参数' }, { status: 400 });
        await setExtraRoutes(value);
        return NextResponse.json({ ok: true });
      }
      default:
        return NextResponse.json({ error: `未知 action: ${action}` }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
