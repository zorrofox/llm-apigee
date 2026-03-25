/**
 * 模型路由配置读取
 * - 静态路由：从 Apigee proxy bundle 解析 model-router.js
 * - 动态配置：从 Apigee KVM model-routing-config 读取
 * - 流量统计：从 Cloud Logging 聚合每模型调用量
 */
import { GoogleAuth } from 'google-auth-library';

const PROJECT = process.env.GOOGLE_CLOUD_PROJECT ?? '';
const ORG     = process.env.APIGEE_ORG ?? '';
const ENV     = 'prod';
const BASE    = `https://apigee.googleapis.com/v1/organizations/${ORG}`;

const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });

// ── 类型定义 ──────────────────────────────────────────────────────────────────

export type BackendType = 'gemini' | 'claude' | 'maas' | 'opencode';

export interface ModelEntry {
  alias:       string;        // 客户端传入的模型名（主别名）
  aliases:     string[];      // 所有别名
  backend:     BackendType;
  publisher:   string;
  actualModel: string;        // 实际调用的模型 ID
  project?:    string;        // Gemini cross-project 路由
  disabled:    boolean;       // 是否在 KVM disabled_models 中
  isDefault:   boolean;       // 是否为当前 DEFAULT 模型
  isExtra:     boolean;       // 是否通过 KVM extra_routes 动态添加
  callsLastHr: number;        // 最近 1h 调用次数（Cloud Logging 统计）
}

export interface RoutingConfig {
  models:        ModelEntry[];
  defaultModel:  string;       // 当前有效的 DEFAULT 模型（含 KVM 覆盖）
  kvmDefault:    string;       // KVM 中的 default_model（空 = 未覆盖）
  kvmDisabled:   string[];     // KVM 中的 disabled_models 列表
  kvmExtraRaw:   string;       // KVM 中的 extra_routes 原始 JSON
}

// ── Apigee KVM 读取 ───────────────────────────────────────────────────────────

async function getToken() {
  const client = await auth.getClient();
  return (await client.getAccessToken()).token!;
}

async function kvmGet(key: string): Promise<string> {
  const token = await getToken();
  const res   = await fetch(
    `${BASE}/environments/${ENV}/keyvaluemaps/model-routing-config/entries/${key}`,
    { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' },
  );
  if (!res.ok) return '';
  const d = await res.json();
  return d.value ?? '';
}

// ── 解析 model-router.js 静态路由表 ──────────────────────────────────────────

async function fetchModelRouterJs(): Promise<string> {
  const token = await getToken();
  // 下载 bundle zip，提取 model-router.js
  const res = await fetch(
    `${BASE}/apis/llm-gateway/revisions/47?format=bundle`,
    { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' },
  );
  if (!res.ok) return '';
  const buf  = Buffer.from(await res.arrayBuffer());
  // 解析 zip 找到 model-router.js
  const { default: AdmZip } = await import('adm-zip').catch(() => ({ default: null }));
  if (!AdmZip) return '';
  const zip   = new AdmZip(buf);
  const entry = zip.getEntry('apiproxy/resources/jsc/model-router.js');
  return entry ? entry.getData().toString('utf8') : '';
}

/** 从 JS 字符串中提取对象字面量内容（简单正则，适用于已知格式的路由表） */
function extractObj(js: string, varName: string): string {
  const match = js.match(new RegExp(`var\\s+${varName}\\s*=\\s*(\\{[\\s\\S]*?\\});\\s*\\n`));
  return match ? match[1] : '{}';
}

/** 解析 GEMINI_ROUTES */
function parseGeminiRoutes(js: string): Array<{ alias: string; project: string; model: string }> {
  const block = extractObj(js, 'GEMINI_ROUTES');
  const out: Array<{ alias: string; project: string; model: string }> = [];
  const re = /"([^"]+)":\s*\{\s*project:\s*(PROJECT_\w+),\s*model:\s*"([^"]+)"\s*\}/g;
  let m;
  while ((m = re.exec(block)) !== null) {
    const proj = m[2] === 'PROJECT_GH'
      ? (process.env.CROSS_PROJECT_ID ?? process.env.GOOGLE_CLOUD_PROJECT ?? '')
      : (process.env.GOOGLE_CLOUD_PROJECT ?? '');
    out.push({ alias: m[1], project: proj, model: m[3] });
  }
  return out;
}

/** 解析 CLAUDE_ROUTES */
function parseClaudeRoutes(js: string): Array<{ alias: string; model: string }> {
  const block = extractObj(js, 'CLAUDE_ROUTES');
  const out: Array<{ alias: string; model: string }> = [];
  const re = /"([^"]+)":\s*"([^"]+)"/g;
  let m;
  while ((m = re.exec(block)) !== null) out.push({ alias: m[1], model: m[2] });
  return out;
}

/** 解析 OPENAPI_ROUTES */
function parseOpenapiRoutes(js: string): Array<{ alias: string; pub: string; model: string }> {
  const block = extractObj(js, 'OPENAPI_ROUTES');
  const out: Array<{ alias: string; pub: string; model: string }> = [];
  const re = /"([^"]+)":\s*\{\s*pub:\s*"([^"]+)",\s*model:\s*"([^"]+)"\s*\}/g;
  let m;
  while ((m = re.exec(block)) !== null) out.push({ alias: m[1], pub: m[2], model: m[3] });
  return out;
}

/** 解析 OPENCODE_MODELS */
function parseOpencodeModels(js: string): Array<{ alias: string; model: string }> {
  const block = extractObj(js, 'OPENCODE_MODELS');
  const out: Array<{ alias: string; model: string }> = [];
  const re = /"([^"]+)":\s*"([^"]+)"/g;
  let m;
  while ((m = re.exec(block)) !== null) out.push({ alias: m[1], model: m[2] });
  return out;
}

// ── Cloud Logging 流量统计 ────────────────────────────────────────────────────

async function getModelCallStats(): Promise<Map<string, number>> {
  const stats   = new Map<string, number>();
  const logAuth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/logging.read'] });
  const client  = await logAuth.getClient();
  const token   = await client.getAccessToken();
  const since   = new Date(Date.now() - 3600 * 1000).toISOString();

  try {
    const res = await fetch('https://logging.googleapis.com/v2/entries:list', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        resourceNames: [`projects/${PROJECT}`],
        filter: `logName="projects/${PROJECT}/logs/llm-gateway-requests" timestamp>="${since}"`,
        orderBy: 'timestamp desc',
        pageSize: 500,
      }),
      cache: 'no-store',
    });
    if (res.ok) {
      const data = await res.json();
      for (const e of (data.entries ?? [])) {
        const m = (e.jsonPayload ?? {}).modelResolved as string;
        if (m) stats.set(m, (stats.get(m) ?? 0) + 1);
      }
    }
  } catch { /* 失败时返回空 map */ }
  return stats;
}

// ── 主函数 ────────────────────────────────────────────────────────────────────

export async function getRoutingConfig(): Promise<RoutingConfig> {
  const [jsCode, kvmDisabledRaw, kvmDefaultRaw, kvmExtraRaw, callStats] = await Promise.all([
    fetchModelRouterJs(),
    kvmGet('disabled_models'),
    kvmGet('default_model'),
    kvmGet('extra_routes'),
    getModelCallStats(),
  ]);

  const kvmDisabled = kvmDisabledRaw ? kvmDisabledRaw.split(',').map(m => m.trim()).filter(Boolean) : [];
  const disabledSet = new Set(kvmDisabled);
  const kvmDefault  = kvmDefaultRaw || '';
  const defaultModelId = kvmDefault || 'gemini-2.0-flash-001';

  // 解析 extra_routes
  let extraGemini:  Record<string, { project: string; model: string }> = {};
  let extraClaude:  Record<string, string> = {};
  let extraMaas:    Record<string, { pub: string; model: string }> = {};
  let extraOpencode:Record<string, string> = {};
  try {
    const extra = JSON.parse(kvmExtraRaw || '{}');
    if (extra.gemini)   extraGemini   = extra.gemini;
    if (extra.claude)   extraClaude   = extra.claude;
    if (extra.maas)     extraMaas     = extra.maas;
    if (extra.opencode) extraOpencode = extra.opencode;
  } catch { /* 解析失败忽略 */ }

  const models: ModelEntry[] = [];

  // ── Gemini 模型（别名去重：同一 actualModel 合并） ──
  const geminiByModel = new Map<string, string[]>();
  const geminiProj    = new Map<string, string>();
  for (const r of parseGeminiRoutes(jsCode)) {
    if (!geminiByModel.has(r.model)) { geminiByModel.set(r.model, []); geminiProj.set(r.model, r.project); }
    geminiByModel.get(r.model)!.push(r.alias);
  }
  for (const [actualModel, aliases] of geminiByModel) {
    const mainAlias = aliases.find(a => a === actualModel) ?? aliases[0];
    models.push({
      alias: mainAlias, aliases, backend: 'gemini',
      publisher: 'google', actualModel, project: geminiProj.get(actualModel),
      disabled: disabledSet.has(mainAlias), isDefault: actualModel === defaultModelId,
      isExtra: false, callsLastHr: callStats.get(actualModel) ?? 0,
    });
  }
  // extra gemini
  for (const [alias, cfg] of Object.entries(extraGemini)) {
    models.push({
      alias, aliases: [alias], backend: 'gemini', publisher: 'google',
      actualModel: cfg.model, project: cfg.project,
      disabled: disabledSet.has(alias), isDefault: cfg.model === defaultModelId,
      isExtra: true, callsLastHr: callStats.get(cfg.model) ?? 0,
    });
  }

  // ── Claude 模型 ──
  const claudeByModel = new Map<string, string[]>();
  for (const r of parseClaudeRoutes(jsCode)) {
    if (!claudeByModel.has(r.model)) claudeByModel.set(r.model, []);
    claudeByModel.get(r.model)!.push(r.alias);
  }
  for (const [actualModel, aliases] of claudeByModel) {
    const mainAlias = aliases.find(a => a === actualModel) ?? aliases[0];
    models.push({
      alias: mainAlias, aliases, backend: 'claude',
      publisher: 'anthropic', actualModel,
      disabled: disabledSet.has(mainAlias), isDefault: false,
      isExtra: false, callsLastHr: callStats.get(actualModel) ?? 0,
    });
  }
  for (const [alias, model] of Object.entries(extraClaude)) {
    models.push({
      alias, aliases: [alias], backend: 'claude', publisher: 'anthropic', actualModel: model,
      disabled: disabledSet.has(alias), isDefault: false, isExtra: true,
      callsLastHr: callStats.get(model) ?? 0,
    });
  }

  // ── MaaS 模型（别名去重） ──
  const maasByModel = new Map<string, { pub: string; aliases: string[] }>();
  for (const r of parseOpenapiRoutes(jsCode)) {
    if (!maasByModel.has(r.model)) maasByModel.set(r.model, { pub: r.pub, aliases: [] });
    maasByModel.get(r.model)!.aliases.push(r.alias);
  }
  for (const [actualModel, { pub, aliases }] of maasByModel) {
    // 主别名：不带 -maas 后缀的那个（更简洁）
    const mainAlias = aliases.find(a => !a.endsWith('-maas')) ?? aliases[0];
    models.push({
      alias: mainAlias, aliases, backend: 'maas', publisher: pub, actualModel,
      disabled: disabledSet.has(mainAlias), isDefault: false,
      isExtra: false, callsLastHr: callStats.get(actualModel) ?? 0,
    });
  }
  for (const [alias, cfg] of Object.entries(extraMaas)) {
    models.push({
      alias, aliases: [alias], backend: 'maas', publisher: cfg.pub, actualModel: cfg.model,
      disabled: disabledSet.has(alias), isDefault: false, isExtra: true,
      callsLastHr: callStats.get(cfg.model) ?? 0,
    });
  }

  // ── OpenCode 模型 ──
  for (const r of parseOpencodeModels(jsCode)) {
    models.push({
      alias: r.alias, aliases: [r.alias], backend: 'opencode', publisher: 'opencode',
      actualModel: r.model, disabled: disabledSet.has(r.alias), isDefault: false,
      isExtra: false, callsLastHr: callStats.get(r.model) ?? 0,
    });
  }
  for (const [alias, model] of Object.entries(extraOpencode)) {
    models.push({
      alias, aliases: [alias], backend: 'opencode', publisher: 'opencode', actualModel: model,
      disabled: disabledSet.has(alias), isDefault: false, isExtra: true,
      callsLastHr: callStats.get(model) ?? 0,
    });
  }

  return { models, defaultModel: defaultModelId, kvmDefault, kvmDisabled, kvmExtraRaw: kvmExtraRaw || '{}' };
}

// ── KVM 写入操作 ──────────────────────────────────────────────────────────────

async function kvmSet(key: string, value: string): Promise<void> {
  const token = await getToken();
  const res   = await fetch(
    `${BASE}/environments/${ENV}/keyvaluemaps/model-routing-config/entries/${key}`,
    {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: key, value }),
    },
  );
  if (!res.ok) throw new Error(`KVM 写入失败: ${res.status}`);
}

export async function setDisabledModels(models: string[]): Promise<void> {
  await kvmSet('disabled_models', models.join(','));
}

export async function setDefaultModel(model: string): Promise<void> {
  await kvmSet('default_model', model);
}

export async function setExtraRoutes(json: string): Promise<void> {
  JSON.parse(json); // 验证 JSON 合法性
  await kvmSet('extra_routes', json);
}
