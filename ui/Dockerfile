# ── 构建阶段 ──────────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

# 安装依赖（先复制 package.json 利用 Docker 层缓存）
COPY package*.json ./
RUN npm ci

# 复制源码并构建
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ── 运行阶段（最小化镜像）──────────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# 创建非 root 用户
RUN addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid  1001 nextjs

# standalone 输出只包含必要文件
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static     ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public           ./public

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["node", "server.js"]
