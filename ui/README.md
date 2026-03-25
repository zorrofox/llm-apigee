# LLM Gateway — 管理控制台

基于 Next.js 15 构建的 LLM 网关管理控制台，提供 API Key 管理、Token 配额配置、实时监控 Dashboard 等功能。通过 Google Cloud IAP 认证，部署在 Cloud Run。

## 访问地址

**生产环境**：`https://34-117-30-51.nip.io`（需要 IAP 认证）

## 功能模块

| 页面 | 路由 | 优先级 | 功能 |
|------|------|--------|------|
| Dashboard | `/` | P0 | 请求量、Token 用量、缓存命中率、延迟趋势图；模型在线状态；近期活动日志 |
| API Keys | `/keys` | P1 | 查看/创建/撤销 App；Token 配额进度条 |
| 配额配置 | `/quota` | P1 | Product 级 / App 级 Token 配额；模型成本权重（自动生成）|
| 请求日志 | `/logs` | P2 | 结构化日志查看，URL 参数驱动筛选和分页 |
| 模型路由 | `/models` | P3 | 读取 Apigee bundle + KVM + Cloud Logging；模型路由状态；PATCH 更新 |
| 缓存管理 | `/cache` | P3 | 缓存命中率统计；相似度阈值动态配置 |
| 告警策略 | `/alerts` | P3 | Cloud Monitoring 告警策略和通知渠道管理 |

## 技术栈

- **框架**：Next.js 15.2.3（App Router）+ React 19
- **UI**：shadcn/ui + Tailwind CSS，「命令中枢」深色主题
- **图表**：Recharts
- **认证**：Cloud IAP（主防线）+ lib/auth.ts Route Handler 验证（纵深防御）
- **数据源**：Apigee Management API、Cloud Logging API、Cloud Monitoring API、Vertex AI

> **安全**：Next.js < 15.2.3 存在 CVE-2025-29927 中间件绕过漏洞，固定使用 15.2.3+

## 本地开发

```bash
cd ui
npm install
npm run dev     # http://localhost:3000（Turbopack，热更新）
```

本地开发时 IAP 验证自动跳过（`NODE_ENV=development`），无需配置认证。

### 可用命令

| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动开发服务器（Turbopack，http://localhost:3000）|
| `npm run build` | 生产构建（Next.js standalone 输出）|
| `npm run start` | 启动生产服务器（需先 build）|
| `npm run lint` | ESLint 检查（eslint-config-next）|

## 部署

```bash
cd ui

# 构建镜像
docker build -t us-central1-docker.pkg.dev/YOUR_PROJECT_ID/llm-gateway/admin-ui:latest .

# 推送到 Artifact Registry
docker push us-central1-docker.pkg.dev/YOUR_PROJECT_ID/llm-gateway/admin-ui:latest

# 部署到 Cloud Run
gcloud run deploy llm-gateway-ui \
  --image=us-central1-docker.pkg.dev/YOUR_PROJECT_ID/llm-gateway/admin-ui:latest \
  --region=us-central1 \
  --project=YOUR_PROJECT_ID
```

## 目录结构

```
ui/
├── app/
│   ├── layout.tsx              # 全局布局（Sidebar + IAP 用户读取）
│   ├── page.tsx                # Dashboard（Server Component，force-dynamic）
│   ├── keys/page.tsx           # API Key 管理
│   ├── quota/page.tsx          # 配额配置
│   ├── logs/page.tsx           # 请求日志（URL 参数筛选 + 分页）
│   ├── models/page.tsx         # 模型路由状态
│   ├── cache/page.tsx          # 缓存管理
│   ├── alerts/page.tsx         # 告警策略
│   └── api/
│       ├── apps/route.ts              # POST 创建 App（自动创建开发者）
│       ├── keys/route.ts              # POST 撤销 Key / PATCH 更新 App 属性
│       ├── quota/route.ts             # POST 更新 Product 配额（批量写，避免竞争）
│       ├── quota/app/route.ts         # POST 更新 App 级配额覆盖
│       ├── weights/generate/route.ts  # POST 自动生成模型权重（Vertex AI）
│       ├── models/route.ts            # PATCH 更新模型路由配置
│       ├── cache/route.ts             # GET 缓存统计 / PATCH 更新阈值配置
│       └── alerts/route.ts            # GET/POST/PATCH/DELETE 告警策略管理
├── components/
│   ├── layout/                 # Sidebar、Topbar
│   ├── dashboard/              # MetricCard、RequestChart、ModelStatus、ActivityFeed
│   ├── keys/KeyTable.tsx       # API Key 表格（含新建/编辑/撤销弹窗）
│   └── quota/QuotaEditor.tsx   # 配额编辑器（Product/App/权重三区块）
├── lib/
│   ├── auth.ts                 # IAP header 验证
│   ├── apigee.ts               # Apigee Management API client
│   ├── logging.ts              # Cloud Logging API client
│   ├── monitoring.ts           # Cloud Monitoring API client
│   └── model-status.ts         # 模型健康状态（Cloud Logging 成功率统计）
├── Dockerfile                  # standalone 输出，非 root 用户运行
└── package.json                # "next": "15.2.3"
```

## 关键设计

### 认证（双重防线）
```
Browser → Cloud LB（IAP）→ Cloud Run → lib/auth.ts → Route Handler
```
- IAP 是主防线，未认证请求在 GCP 基础设施层被拦截
- 每个 Route Handler 独立调用 `requireIAP(req.headers)` 验证（不依赖 middleware）
- Cloud Run 设置 `--ingress=internal-and-cloud-load-balancing`，直接访问 run.app URL 被拒绝

### 自动生成模型权重
- 调用 `gemini-2.5-flash` + `thinkingConfig.thinkingBudget: 0`（禁用 thinking 节省 token）
- `responseMimeType: "application/json"` 强制 JSON 输出
- 使用 Cloud Run SA 的 Google Auth 直接调 Vertex AI，不经过 Apigee 网关

### Apigee 属性写入
- `setProductAttributes()` 一次读取再批量 POST（避免 `PUT /attributes/{attr}` 对新属性 404）
- 并发写入有竞争风险，所有配额属性合并为单次调用

### 数据策略
- Dashboard 指标：Cloud Monitoring（ALIGN_DELTA 计数）+ Cloud Logging（延迟、缓存命中率）
- 模型健康：Cloud Logging 过去 1h 请求成功率，成功率 ≥95% = online
- 所有页面 `force-dynamic`，禁用 ISR 缓存，确保数据实时性
