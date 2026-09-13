FROM node:22-slim AS deps
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-slim AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
# 容器默认 UTC，日志与 node 的本地时间都会比现场早 8 小时，统一设为东八区。
# 业务时间的正确性由 lib/format.ts 的固定业务时区保证，这里只为排查方便。
ENV TZ=Asia/Shanghai

RUN mkdir -p /app/data && chown -R node:node /app

COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static

VOLUME ["/app/data"]

USER node
EXPOSE 3000

CMD ["node", "server.js"]
