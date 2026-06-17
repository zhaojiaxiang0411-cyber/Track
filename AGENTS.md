# AGENTS.md — 项目说明（供 AI 代理 / 开发者快速上手）

> 本文件由通读代码后整理，描述项目目标、架构、约定与关键实现细节。修改代码前请先阅读对应章节。

## 1. 项目概述

**ACI Leaf Refresh Pipeline 协作工具**：用于成对交换机（如 `201` / `202`）替换维护窗口的 Web 协作跟踪工具。

- 两个 Team 通过颜色状态协作，按固定顺序逐步完成一条 14 步流水线。
- 自动记录每步的开始 / 完成时间与耗时，支持多个 Pair（成对交换机）并行跟踪。
- 通过 SSE 实时推送，任意一方完成步骤后，其他人浏览器即时看到更新。
- 支持登录与基于角色的权限控制，以及全量时间记录的 CSV 导出。

### Team 与角色映射（重要，容易混淆）

代码内部用 `Team = "A" | "B"`，对外显示名称固定映射（见 `lib/format.ts`）：

| 内部 Team | 显示名称 | 颜色 | 负责步骤类型 |
|-----------|----------|------|--------------|
| `A` | **cisco** | 蓝色 | Pipeline Start / Snapshot / Decommission / Register / Post Check |
| `B` | **homison** | 橙色 | Label / Rack & Plugin Uplinks / Plugin Downlinks |

| 角色 `Role` | 账号 | 权限 |
|-------------|------|------|
| `admin` | `cisco` | 全部：完成任意步骤、新建/删除 pipeline、改全部 Info、导出 |
| `homison` | `homison` | 完成 Team B 步骤、仅改 Info(footprint)、导出 |
| `guest` | 未登录 | 只读：查看、实时更新、导出 CSV |

## 2. 技术栈

- **Next.js 15**（App Router）+ **React 19** + **TypeScript 5.7**（`strict`）
- **Tailwind CSS 3.4**
- **数据库**：`node:sqlite`（`DatabaseSync`）—— 依赖 **Node.js ≥ 22.5**，无需编译原生模块
- **构建产物**：`output: "standalone"`（见 `next.config.ts`，用于 Docker 精简镜像）
- 路径别名：`@/*` → 项目根目录（见 `tsconfig.json`）
- 运行时极简，**业务运行时无第三方依赖**（仅 next / react / react-dom）

## 3. 目录结构

```
app/
  layout.tsx                 # 根布局（lang=zh-CN）
  page.tsx                   # 主页（客户端组件，组装所有 UI）
  globals.css                # Tailwind 全局样式
  api/
    auth/{login,logout,me}/route.ts   # 登录 / 登出 / 当前会话
    pairs/route.ts                    # GET 列表(公开) / POST 新建(admin)
    pairs/[id]/route.ts               # GET(公开) / PATCH 改Info / DELETE(admin)
    pairs/[id]/steps/[order]/complete/route.ts  # POST 完成步骤
    events/route.ts                   # SSE 实时事件流
    export/route.ts                   # CSV 导出
components/                  # 客户端 UI 组件（见下）
hooks/
  useAuth.ts                 # 登录态管理
  usePairs.ts                # 拉取 pairs + SSE 订阅 + 最近更新高亮
lib/
  types.ts                   # 全部 TypeScript 类型
  pipeline.ts                # 流水线步骤模板（单一事实来源）
  db.ts                      # SQLite 连接、建表、迁移
  pairs.ts                   # 核心业务逻辑（CRUD、完成步骤、CSV）
  auth.ts                    # 会话签名/校验、账号、认证
  permissions.ts             # 纯权限判断函数（服务端+客户端共用）
  events.ts                  # SSE 客户端注册与广播
  format.ts                  # Team 名称、本地时间、时长格式化
data/track.db                # SQLite 数据文件（首次启动自动创建，.gitignore）
Dockerfile / .dockerignore   # 容器化
```

### 组件清单（`components/`，均为 `"use client"`）

- `AuthBar.tsx`：登录 / 登出条
- `CreatePairForm.tsx`：新建 Pair 表单（仅 admin 可见）
- `PairFilter.tsx`：筛选条（全部 / 等 cisco / 等 homison / 已完成）
- `PipelineOverview.tsx`：全部 Pair 的流水线总览，可跳转
- `PipelineProgressDots.tsx`：进度点
- `PairCard.tsx`：单个 Pair 卡片（步骤、Info 编辑、删除）
- `StepButton.tsx`：单个步骤按钮（按权限/顺序启用）
- `LiveDuration.tsx`：进行中步骤的实时耗时显示

## 4. 核心数据模型

数据库表（见 `lib/db.ts`）：

- **`pairs`**：`id, switch1, switch2, rack, footprint, owner, status('active'|'completed'), created_at`
- **`step_instances`**：`id, pair_id(FK,级联删除), step_order, action_key, team, label, started_at, completed_at, duration_sec`，唯一约束 `(pair_id, step_order)`

关键类型见 `lib/types.ts`：`Pair` / `StepInstance` / `PairWithSteps`（含 `current_step_order`、`waiting_team`、`total_duration_sec`）/ `Role` / `SessionUser`。

### 流水线步骤（14 步，定义于 `lib/pipeline.ts` — 单一事实来源）

| # | Action(label) | Team | Phase |
|---|---------------|------|-------|
| 1 | Pipeline Start | A | 全局 |
| 2 | Snapshot | A | 全局 |
| 3 | Label | B | SW1 |
| 4 | Decommission | A | SW1 |
| 5 | Rack and Plugin Uplinks | B | SW1 |
| 6 | Register | A | SW1 |
| 7 | Plugin Downlinks | B | SW1 |
| 8 | Post Check | A | SW1 |
| 9–14 | 同 3–8 流程对称重复 | B/A | SW2 |

> 注：`README.md` 步骤表略旧（写为 13 步、含「发现后 Commission」旧文案），**以 `lib/pipeline.ts` 为准**。

## 5. 关键业务规则（改代码务必遵守）

1. **严格顺序执行**：只能完成 `current_step_order`（第一个未完成步骤），否则 `completeStep` 抛错。
2. **计时基准**：总耗时从 **Snapshot（步骤 2）完成时刻** 起算，**不计入** 步骤 1（Pipeline Start）和步骤 2（Snapshot）本身的耗时。CSV 导出也排除步骤 1、2。
3. **时区**：统一以**本地时间**（东八区）字符串 `YYYY-MM-DD HH:mm:ss` 写库与显示。
   - **必须用 `nowLocalString()`，禁止用 `new Date().toISOString()`**（那是 UTC，会偏 8 小时）。
   - 解析用 `parseLocalTimeMs()`（`lib/format.ts`）。
4. **完成步骤的连锁**：完成某步时写入 `completed_at` / `duration_sec`，并把下一步的 `started_at` 置为该完成时刻；最后一步完成则把 pair `status` 置 `completed`。
5. **权限三处一致**：判断逻辑集中在 `lib/permissions.ts`（`canCompleteStep` / `canManagePairs` / `canEditInfo`），前端按钮与服务端 API 都调用它。**前端禁用仅为体验，真正的强制在服务端 API**（返回 401/403）。
   - 注意 PATCH 改 Info：`footprint` 任意登录用户可改；`rack` / `owner` 仅 admin 可改。

## 6. 认证与会话（`lib/auth.ts`）

- 会话用 **HMAC-SHA256 签名**的 token：`base64url(payload).hmac`，存于 `httpOnly` Cookie（名 `track_session`），默认 **12 小时**。
- 校验用 `crypto.timingSafeEqual` 做常数时间比较；密码比较先 `sha256` 再比较以抗时序侧信道并统一长度。
- 账号不写死生产密码，通过环境变量覆盖。

### 环境变量（生产建议设置）

| 变量 | 说明 | 默认 |
|------|------|------|
| `AUTH_SESSION_SECRET` | 会话签名密钥，生产务必设高熵随机值 | 内置开发密钥（**不安全**） |
| `AUTH_CISCO_PASSWORD` | cisco 账号密码 | `cisco` |
| `AUTH_HOMISON_PASSWORD` | homison 账号密码 | `homison` |
| `AUTH_COOKIE_SECURE` | `true` 时 Cookie 仅经 HTTPS 下发（内网 http 部署保持默认） | `false` |

## 7. 实时同步（SSE）

- 服务端 `lib/events.ts` 维护内存中的客户端集合，业务写操作后调用 `broadcast("pair_updated", {...})`。
- 客户端 `hooks/usePairs.ts` 用 `EventSource` 订阅 `/api/events`，收到事件后重新拉取列表；`step_completed` 事件触发对应 Pair 的「最近更新」高亮（持续 10 秒）。
- **注意**：SSE 客户端集合是**单进程内存**状态，多实例水平扩展时广播不会跨进程（当前定位为单机内网部署，无此问题）。

## 8. 数据库迁移（`lib/db.ts`）

`initSchema` 在每次连接时自动建表并跑迁移，幂等设计：

- `migrateAddOwnerColumn` / `migrateAddRackFootprintColumns`：按需 `ALTER TABLE` 加列。
- `migrateStepLabels`：把历史 label 旧文案统一为新文案。
- `migrateRemoveCheckFaultSteps`：删除旧的 `check_fault_*` 步骤并把 SW2 步骤顺移到 10–14。
- `migrateShiftLegacyUtcTimestamps`：用 `PRAGMA user_version`（目标 1）一次性把早期 UTC 旧数据 +8 小时校正。
- `migrateAddLabelSw2`：用 `PRAGMA user_version`（目标 2）一次性为 SW2 在 Decommission 前补 `label_sw2`（步骤 9）。

> 改 schema/步骤时：用 `PRAGMA user_version` 守护「只执行一次」的迁移，列新增用 `PRAGMA table_info` 判断幂等。

## 9. API 速查

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | `/api/pairs?filter=all` | 公开 | 列出 Pair（filter: all/waiting_a/waiting_b/completed） |
| POST | `/api/pairs` | admin | 新建 `{switch1, switch2, rack?, footprint?, owner?}` |
| GET | `/api/pairs/:id` | 公开 | 单个 Pair |
| PATCH | `/api/pairs/:id` | admin/homison | 改 Info（footprint 任意登录可改；rack/owner 仅 admin） |
| DELETE | `/api/pairs/:id` | admin | 删除 Pair |
| POST | `/api/pairs/:id/steps/:order/complete` | 按步骤 team | 完成步骤 |
| GET | `/api/events` | 公开 | SSE 实时事件 |
| GET | `/api/export` | 公开 | 下载 CSV |
| POST/GET | `/api/auth/{login,logout,me}` | — | 登录 / 登出 / 当前会话 |

所有路由均 `export const dynamic = "force-dynamic"`（禁用静态缓存）。

## 10. 开发与运行

```bash
npm install
npm run dev      # next dev --hostname 0.0.0.0，访问 http://localhost:3000
npm run build && npm start   # 生产模式（同样绑定 0.0.0.0:3000）
npm run lint
```

- 服务默认绑定 `0.0.0.0:3000`，内网同事可经 `http://<本机IP>:3000` 访问。
- 数据持久化在 `data/track.db`（首次启动自动创建）。

### Docker

多阶段构建（`Dockerfile`）：`deps`(npm ci) → `builder`(npm run build) → `runner`(以非 root 用户 `node` 运行 standalone)。`/app/data` 声明为 VOLUME，暴露 3000 端口。

```bash
docker build -t track .
docker run -p 3000:3000 -v $(pwd)/data:/app/data \
  -e AUTH_SESSION_SECRET="$(openssl rand -base64 32)" track
```

## 11. 代码约定与注意事项

- 业务逻辑集中在 `lib/`，API 路由只做「鉴权 + 解析参数 + 调用 lib + 返回」。
- `lib/permissions.ts` 是**纯函数**，不依赖 `node:crypto`/`next/server`，因此可同时被服务端与客户端组件引用。
- 时间处理统一走 `lib/format.ts`，**勿引入 UTC/ISO 字符串混用**。
- 步骤定义只在 `lib/pipeline.ts`，新增/调整步骤要同步考虑 `db.ts` 迁移与计时/导出排除规则。
- 数据写操作用 `runTransaction()` 包裹以保证原子性，且记得在写后 `broadcast(...)` 推送 SSE。
- 注释用中文，保留解释「为什么」的关键注释（如时区、计时基准、迁移幂等）。
- 提交信息（git log）为中文、描述「做了什么 + 为什么」，沿用该风格。

## 12. 已知技术债 / 风险点

- 默认开发密钥与默认密码不安全，**生产必须用环境变量覆盖**。
- SSE 为单进程内存广播，不支持多实例水平扩展。
- `README.md` 的步骤表与权限细节略滞后于代码，以 `lib/` 实现为准。
- SQLite 单文件 + WAL，定位单机内网；高并发/分布式场景需更换存储。
