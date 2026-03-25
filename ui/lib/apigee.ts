/**
 * Apigee Management API 客户端
 * Server-side only — 凭据不暴露给浏览器
 */
import { GoogleAuth } from 'google-auth-library';

const ORG  = process.env.APIGEE_ORG  ?? '';
const BASE = `https://apigee.googleapis.com/v1/organizations/${ORG}`;

const auth = new GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/cloud-platform'],
});

async function apigeeGet(path: string) {
  const client = await auth.getClient();
  const token  = await client.getAccessToken();
  const res    = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token.token}` },
    cache: 'no-store', // 不缓存，确保 App 创建后立即可见
  });
  if (!res.ok) throw new Error(`Apigee API 错误 ${res.status}: ${path}`);
  return res.json();
}


// ── 类型定义 ──────────────────────────────────────────────────────────────────

export interface ApiApp {
  appId:       string;
  name:        string;
  developerId: string;
  developerEmail?: string;
  status:      string;
  credentials: Array<{
    consumerKey:    string;
    consumerSecret: string;
    status:         string;
    expiresAt:      string;
    apiProducts:    Array<{ apiproduct: string; status: string }>;
  }>;
  attributes?: Array<{ name: string; value: string }>;
  createdAt:   string;
  lastModifiedAt: string;
}

export interface ApiProduct {
  name:       string;
  displayName?: string;
  attributes: Array<{ name: string; value: string }>;
  quota?:     string;
  quotaInterval?: string;
  quotaTimeUnit?: string;
}

export interface TokenQuotaUsage {
  appName:      string;
  used:         number;
  limit:        number;
  interval:     string;
  timeUnit:     string;
}

// ── API 调用 ──────────────────────────────────────────────────────────────────

/** 获取所有开发者邮箱列表 */
export async function listDevelopers(): Promise<string[]> {
  const data = await apigeeGet('/developers?expand=false');
  // API 返回 [{email: "..."}] 对象数组，提取 email 字段
  return (data.developer ?? []).map((d: { email: string } | string) =>
    typeof d === 'string' ? d : d.email
  );
}

/** 获取开发者的所有 App */
export async function listDeveloperApps(email: string): Promise<ApiApp[]> {
  const data = await apigeeGet(`/developers/${email}/apps?expand=true`);
  return (data.app ?? []).map((a: ApiApp) => ({ ...a, developerEmail: email }));
}

/** 获取所有 App（遍历所有开发者） */
export async function listAllApps(): Promise<ApiApp[]> {
  const emails = await listDevelopers();
  const results = await Promise.all(emails.map(listDeveloperApps));
  return results.flat();
}

/** 获取单个 App 详情 */
export async function getApp(email: string, appName: string): Promise<ApiApp> {
  return apigeeGet(`/developers/${email}/apps/${appName}`);
}

/** 获取 API Product 详情 */
export async function getApiProduct(name: string): Promise<ApiProduct> {
  return apigeeGet(`/apiproducts/${name}`);
}

/**
 * 批量更新 API Product 的多个属性（一次读、一次写，避免并发覆盖）。
 * Apigee PUT /attributes/{attr} 对不存在的属性返回 404，
 * 因此改用 POST /attributes 批量写入，先读现有属性再合并。
 */
export async function setProductAttributes(
  productName: string,
  updates: Record<string, string>,   // { attrName: value, ... }
) {
  // 一次性读取现有所有属性
  const product  = await apigeeGet(`/apiproducts/${productName}`);
  const existing: Array<{ name: string; value: string }> = product.attributes ?? [];

  // 合并：覆盖要更新的，保留其余的
  const map = new Map(existing.map(a => [a.name, a.value]));
  for (const [k, v] of Object.entries(updates)) map.set(k, v);
  const merged = Array.from(map.entries()).map(([name, value]) => ({ name, value }));

  const client = await auth.getClient();
  const token  = await client.getAccessToken();
  const res    = await fetch(`${BASE}/apiproducts/${productName}/attributes`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ attribute: merged }),
  });
  if (!res.ok) throw new Error(`Apigee setProductAttributes 失败 ${res.status}`);
  return res.json();
}

/** 单属性更新（兼容现有调用方） */
export async function setProductAttribute(
  productName: string,
  attrName: string,
  value: string,
) {
  return setProductAttributes(productName, { [attrName]: value });
}

/** 撤销 API Key */
export async function revokeKey(email: string, appName: string, key: string) {
  const client = await auth.getClient();
  const token  = await client.getAccessToken();
  const res    = await fetch(
    `${BASE}/developers/${email}/apps/${appName}/keys/${key}?action=revoke`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token.token}` },
    },
  );
  if (!res.ok) throw new Error(`撤销 Key 失败: ${res.status}`);
}

/** 创建新 App（同时生成 API Key） */
export async function createApp(email: string, appName: string, productName: string) {
  const client = await auth.getClient();
  const token  = await client.getAccessToken();
  const res    = await fetch(`${BASE}/developers/${email}/apps`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: appName,
      apiProducts: [productName],
    }),
  });
  if (!res.ok) throw new Error(`创建 App 失败: ${res.status}`);
  return res.json();
}
