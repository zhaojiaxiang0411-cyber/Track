# AGENTS.md — 项目说明（供 AI 代理 / 开发者快速上手）

> 本文件由通读代码后整理，描述项目目标、架构、约定与关键实现细节。修改代码前请先阅读对应章节。

## 1. 项目概述

**DC Refresh Pipelines 协作工具**：用于成对交换机（如 `201` / `202`）替换维护窗口的 Web 协作跟踪工具。

- 多个 Team 通过颜色状态协作，按固定顺序逐步完成一条流水线（14 步；勾选 Esxi Check 后 17 步）。
- 自动记录每步的开始 / 完成时间与耗时，支持多个 Pair（成对交换机）并行跟踪。
- 通过 SSE 实时推送，任意一方完成步骤后，其他人浏览器即时看到更新。
- 支持登录与基于角色的权限控制，以及全量时间记录的 CSV 导出。

### Team 与角色映射（重要，容易混淆）

代码内部用 `Team = "A" | "B"`，对外显示名称固定映射（见 `lib/format.ts`）：

| 内部 Team | 显示名称 | 颜色 | 负责步骤类型 |
|-----------|----------|------|--------------|
| `A` | **cisco** | 蓝色 | Pipeline Start / Snapshot / Decommission / Register / Post Check |
| `B` | **homison** | 橙色 | Label and Unplug Downlinks / Rack & Plugin Uplinks / Plugin Downlinks |
| `C` | **esxi** | 紫色 | Esxi Check ×3（可选步骤，无独立账号，由 `cisco` 代为点击） |

> `C` 用紫色而非绿色：绿色（emerald）已被「已完成」状态占用。配色集中在 `lib/teamStyles.ts`。

| 角色 `Role` | 账号 | 权限 |
|-------------|------|------|
| `admin` | `cisco` | 全部：完成任意步骤（含 Team C）、撤回步骤、新建/删除 pipeline、改全部 Info、导出 |
| `homison` | `homison` | 完成 Team B 步骤、仅改 Info(footprint)、导出 |
| `guest` | 未登录 | 只读：查看、实时更新、导出 CSV |

> Team C 没有对应角色：`canCompleteStep` 中 `homison` 的判断是 `team === "B"`，天然排除 C，
> 因此 Esxi Check 只有 `admin` 能点。**勿把该判断改成 `team !== "A"`**。

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
    pairs/[id]/steps/[order]/complete/route.ts  # POST 完成步骤 / DELETE 撤回步骤(admin)
    events/route.ts                   # SSE 实时事件流
    export/route.ts                   # CSV 导出
components/                  # 客户端 UI 组件（见下）
hooks/
  useAuth.ts                 # 登录态管理
  usePairs.ts                # 拉取 pairs + SSE 订阅 + 最近更新高亮 + owner/team 筛选
lib/
  types.ts                   # 全部 TypeScript 类型
  pipeline.ts                # 流水线步骤模板（单一事实来源）+ buildPipelineSteps
  owner.ts                   # owner 筛选的归一化与匹配（纯函数，服务端/客户端共用）
  teamStyles.ts              # Team 配色（Tailwind 类名字面量，服务端/客户端共用）
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
- `OwnerFilter.tsx`：Owner 下拉筛选（「只看我的」），候选由全量 pair 去重生成
- `PipelineOverview.tsx`：全部 Pair 的流水线总览，可跳转；admin 可拖拽行首手柄调整顺序，也可点「按 Owner 排序」一键重排
- `PipelineProgressDots.tsx`：进度点
- `PairCard.tsx`：单个 Pair 卡片（步骤、Info 编辑、删除）
- `StepButton.tsx`：单个步骤按钮（按权限/顺序启用）
- `LiveDuration.tsx`：进行中步骤的实时耗时显示

## 4. 核心数据模型

数据库表（见 `lib/db.ts`）：

- **`pairs`**：`id, switch1, switch2, rack, footprint, owner, status('active'|'completed'), esxi_check(0/1), sort_order, created_at`
 - `sort_order`：Pipeline Overview 里人工拖拽出来的展示顺序，**值小者在前**。`listPairs` 按 `ORDER BY sort_order ASC, id DESC` 取数，Overview 与下方卡片列表共用同一顺序。新建 pair 取 `MIN(sort_order) - 1` 排到最前，保持「新建在最上」的既有习惯。
- **`step_instances`**：`id, pair_id(FK,级联删除), step_order, action_key, team('A'|'B'|'C'), label, started_at, completed_at, duration_sec`，唯一约束 `(pair_id, step_order)`

关键类型见 `lib/types.ts`：`Pair`（含 `esxi_check`）/ `StepInstance` / `PairWithSteps`（含 `current_step_order`、`waiting_team`、`total_duration_sec`）/ `Role` / `SessionUser`。

### 流水线步骤（定义于 `lib/pipeline.ts` — 单一事实来源）

基础布局 14 步；`pairs.esxi_check = 1` 时由 `buildPipelineSteps({ esxiCheck: true })` 插入三个 Esxi Check，共 17 步：

| # (14 步) | # (17 步) | Action(label) | Team | Phase |
|---|---|---------------|------|-------|
| 1 | 1 | Pipeline Start | A | 全局 |
| 2 | 2 | Snapshot | A | 全局 |
| 3 | 3 | Label and Unplug Downlinks | B | SW1 |
| — | 4 | **Esxi Check**（可选） | C | SW1 |
| 4 | 5 | Decommission | A | SW1 |
| 5 | 6 | Rack and Plugin Uplinks | B | SW1 |
| 6 | 7 | Register | A | SW1 |
| 7 | 8 | Plugin Downlinks | B | SW1 |
| 8 | 9 | Post Check | A | SW1 |
| 9–14 | 10–16 | 同上流程对称重复（含 SW2 的 Esxi Check = 11） | B/C/A | SW2 |
| — | 17 | **Esxi Check**（可选，收尾） | C | 全局 |

> 注：`README.md` 步骤表已同步；如两者出现分歧，**以 `lib/pipeline.ts` 为准**。
> 贴标签与拔下联原为两步（`label_*` / `unplug_downlink_*`），现合并为一步，`action_key` 沿用 `label_sw1` / `label_sw2`。

### 步骤身份一律用 `action_key`，不要用 `step_order`（重要）

流水线长度按 pair 变化，同一个 `step_order` 在 14 步与 17 步布局中指向不同步骤。因此：

- `resolveStepLabel` / `resolveStepPhase` / `resolveStepSwitch` / `isExcludedFromTiming` 全部接收 `action_key`。
- 计时基准与 CSV 排除项用 `TIMING_BASE_ACTION_KEY`（`snapshot_sw1`）与 `PIPELINE_START_ACTION_KEY`（`mw_start`），**不要写 `step_order === 2`**。
- 「最后一步」「越界」判断取该 pair 自身的最大 `step_order`（见 `completeStep`），已删除全局 `TOTAL_STEPS`。
- 新增可选步骤：在 `pipeline.ts` 的 `OPTIONAL_STEP_DEFS` 里声明锚点（`anchorAfter`），order 由 `buildPipelineSteps` 自动连续编号。锚定末步（如 `post_check_sw2`）即可把步骤追加到流水线最后。
- **总览进度点的对齐基准是 `FULL_PIPELINE_STEPS`**（含全部可选步骤的完整布局）。`PipelineProgressDots` 开启 `alignToFullLayout` 后按该布局逐列渲染，pair 缺失的可选步骤渲染等宽空位，使 14 步与 17 步 pair 的同一步骤竖向对齐。因此可选步骤必须声明在 `OPTIONAL_STEP_DEFS` 里（基准需为所有 pair 布局的超集），否则该步骤会落在基准之外、被追加到行尾。中间空位不可裁剪（会让后续列左移），只有行尾空位可裁。
- 三次 Esxi Check 的 `action_key` 分别是 `esxi_check_sw1` / `esxi_check_sw2` / `esxi_check_final`，label 同为 `Esxi Check`，靠 phase（SW1 / SW2 / 全局）区分。

## 5. 关键业务规则（改代码务必遵守）

1. **严格顺序执行**：只能完成 `current_step_order`（第一个未完成步骤），否则 `completeStep` 抛错。
2. **计时基准**：总耗时从 **Snapshot（`snapshot_sw1`）完成时刻** 起算，**不计入** Pipeline Start（`mw_start`）与 Snapshot 本身的耗时。CSV 导出同样排除这两步。判断统一走 `isExcludedFromTiming(action_key)`。
3. **时区**：统一以**本地时间**（东八区）字符串 `YYYY-MM-DD HH:mm:ss` 写库与显示。
   - **必须用 `nowLocalString()`，禁止用 `new Date().toISOString()`**（那是 UTC，会偏 8 小时）。
   - 解析用 `parseLocalTimeMs()`（`lib/format.ts`）。
4. **完成步骤的连锁**：完成某步时写入 `completed_at` / `duration_sec`，并把下一步的 `started_at` 置为该完成时刻；最后一步完成则把 pair `status` 置 `completed`。
4.5 **撤回步骤（`revertStepCompletion`）是 `completeStep` 的严格逆操作**，用于现场点错时把 pipeline 退回一步，仅 admin 可用（`canRevertStep`）。
   - **一次只退一步**：只能撤回当前**最后一个已完成**步骤（已完成步骤是连续前缀，故即 `step_order` 最大者）。想多退就多点几次。
   - **必须显式传入 `stepOrder` 并校验它就是最后一个已完成步骤**，不符则拒绝并提示刷新。SSE 有延迟，发起撤回的人看到的「最后一步」可能已过时（别人刚点完下一步），不校验会误撤别人的步骤——与 `reorderPairs` 的过时保护同一思路。
   - 连锁：清空该步 `completed_at` / `duration_sec` → 清空下一步的 `started_at`（它当初由本步完成时刻写入）→ pair 若为 `completed` 退回 `active`。
   - **该步的 `started_at` 原样保留**（不重置为撤回时刻）：该步从上一步完成时刻就已开始，重做后的耗时应含误操作与纠正的全部墙上时间，与现场报表口径一致。
   - 不落审计表，只 `broadcast("pair_updated", { action: "step_reverted" })`；改成落库需 schema 迁移。
5. **权限三处一致**：判断逻辑集中在 `lib/permissions.ts`（`canCompleteStep` / `canRevertStep` / `canManagePairs` / `canEditInfo`），前端按钮与服务端 API 都调用它。**前端禁用仅为体验，真正的强制在服务端 API**（返回 401/403）。
   - 注意 PATCH 改 Info：`footprint` 任意登录用户可改；`rack` / `owner` 仅 admin 可改。
   - Team C（esxi）步骤只有 admin 能完成，见上文角色表下的告警。
   - **撤回权限勿复用 `canCompleteStep`**：那个函数对 homison 的 Team B 步骤返回 true，复用等于把撤回权给了 homison。撤回是纠错动作，只归 admin。
6. **`esxi_check` 创建后不可改**：`updatePairInfo` 不接受该字段。改变它需要增删步骤行并重排 `step_order`，当前不支持；如需支持要另做一套「动态插入步骤」的事务逻辑。
6.5 **展示顺序（`sort_order`）是全局共享状态**：`reorderPairs(orderedIds)` 要求 `orderedIds` **恰好是当前全部 pair 的一个排列**，否则整体拒绝并提示刷新——拖拽期间若别人新建/删除了 pair，客户端列表已过时，写入会造成遗漏或错位。仅 admin 可调（走 `canManagePairs`），写后 `broadcast` 让所有人同步。前端 `PipelineOverview` 做乐观渲染，请求失败即回落到服务端顺序。
 - 「按 Owner 排序」按钮同样落在这条路径上（前端算排列 → 复用 `/api/pairs/reorder`），**排序规则只在前端**：owner 升序（`localeCompare` 带 `numeric` + `sensitivity: "base"`，大小写不敏感、`eng9` 在 `eng10` 前），owner 为空的沉底，同 owner 内 `id` 倒序。因是持久化写入，点一次会覆盖此前所有人拖出的顺序，故加了 `window.confirm` 二次确认（拖拽是逐行小步调整、无需确认，一键排序是整表覆盖，两者口径不同）。
 - 排序基准取 props 里的 `pairs`（服务端权威列表）而非 `ordered`（可能含乐观顺序），保证提交的一定是当前全部 pair 的排列。
6.6 **Owner 筛选（「只看我的」）是纯前端的个人视图偏好**，与全局共享的 `sort_order` 相反：不入库、不广播，存在各自浏览器的 `localStorage`（键 `track.owner-filter`），互不影响。
 - 客户端本就一次性拉全量（`/api/pairs?filter=all`）再本地过滤，故无需新增 API 或查询参数。匹配逻辑在 `lib/owner.ts`：owner 是自由文本，**按 trim + 小写归一后比较**（`Eng9` 与 `eng9` 视为同一人，与「按 Owner 排序」的 `sensitivity: "base"` 同口径）；`UNASSIGNED_OWNER` 哨兵表示「owner 为空」，不能用空串（会与「全部 Owner」混淆）。
 - **只过滤下方卡片列表，不过滤 Pipeline Overview**：总览是全局看板，缩掉它就看不到别人的进度了。`counts` 跟随 owner 子集，否则筛选条数字与列表对不上。
 - 因总览仍显示全部，**点击被筛掉的行必须放开筛选**（`handleJumpToPair` 里同时 `setFilter("all")` 与清空 owner 筛选），否则点击毫无反应。选择被清空而非临时放开，是为了让下拉显示与实际生效的筛选始终一致。
 - `localStorage` 只能在挂载后（`useEffect`）读取，写在 `useState` 初始值里会导致 SSR/CSR hydration 不一致；隐私模式下访问可能抛错，需 `try/catch` 兜住。
 - 选中的 owner 可能被改名或删完，此时**保留它作为下拉选项并给空态提示**，不要静默回落成「全部」——否则界面显示「全部」而列表是空的，会让人以为 pipeline 丢了。
7. **CSV 导出安全**：`buildExportCsv` 用 `csvCell` 生成单元格——
   - **中和公式注入**：对以 `= + - @` 或控制字符（Tab/CR）开头的值加前缀单引号，防止 Excel/Sheets 把用户可控字段（如 switch 名称）当公式执行。
   - **RFC 4180 转义**：含逗号/引号/换行(`\r` 或 `\n`)的值用双引号包裹并将内部引号翻倍。
   - **行分隔用 `\r\n`（CRLF）**，避免仅 `\n` 在部分工具解析异常。
   - 新增/修改导出字段时务必走 `csvCell`，勿直接拼接原始值。
8. **CSV 汇总统计表**：`buildExportCsv` 在明细行之后空一行，追加 `buildSummarySection` 生成的汇总表（对齐现场交付报表的形式）。
   - 结构：标题行（`Change on <日期> (<footprint>) - started at … - completed at … HKT`）+ 分组表头行（`Homison & ESXi` / `Cisco`）+ 列名行 + 每台交换机一行（一个 pair 两行，SW1 在前）。
   - 列名与编号（`1. Labing & Unplug downlink` 等）是**报表口径**，与 `pipeline.ts` 的步骤 `label` 不同名，映射表 `SUMMARY_HOMISON_COLUMNS` / `SUMMARY_CISCO_COLUMNS` 定义在 `lib/pairs.ts`，按 `${keyPrefix}_sw${1|2}` 拼出 `action_key`。改步骤 `action_key` 时要同步这里。
   - 耗时单位为分钟、保留 1 位小数；`Overall` 由**秒**累加后再换算，避免两个小计各自四舍五入后相加产生偏差。
   - **「不适用」与「未完成」要区分**：步骤在该 pair 中不存在（未勾选 Esxi Check）→ 留空且不影响小计；步骤存在但 `duration_sec` 为 null → 留空且该组小计、`Overall` 一并留空，行尾 `Note` 标 `未完成`。
   - `8. ESXi final check for a pair`（`esxi_check_final`）是 pair 级步骤，只写在该 pair 第一行，第二行留空（对应报表里的合并单元格；CSV 无合并单元格，只能这样近似）。
   - `Total Port#` / `ESXi Port#` 数据库无对应字段，**固定留空供人工填写**；若要真填需给 `pairs` 加列并做迁移。

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
- 客户端 `hooks/usePairs.ts` 用 `EventSource` 订阅 `/api/events`，收到事件后重新拉取列表；`step_completed` 与 `step_reverted` 事件触发对应 Pair 的「最近更新」高亮（持续 10 秒）。
- **注意**：SSE 客户端集合是**单进程内存**状态，多实例水平扩展时广播不会跨进程（当前定位为单机内网部署，无此问题）。

## 8. 数据库迁移（`lib/db.ts`）

`initSchema` 在每次连接时自动建表并跑迁移，幂等设计。**所有迁移整体包进一个事务（`BEGIN` → 依次执行 → `COMMIT`；任一步抛错则 `ROLLBACK`）**，避免留下「半迁移」脏数据（如 `step_order` 被改成负值却未落回正值，导致步骤顺序错乱）。

- `migrateAddOwnerColumn` / `migrateAddRackFootprintColumns`：按需 `ALTER TABLE` 加列。
- `migrateStepLabels`：把历史 label 旧文案统一为新文案。
- `migrateRemoveCheckFaultSteps`：删除旧的 `check_fault_*` 步骤并把 SW2 步骤顺移。**已加存在性守护**：仅当确有 `check_fault_*` 旧步骤时才执行；否则直接返回，避免每次启动无条件重排、与后续新布局冲突。
- `migrateShiftLegacyUtcTimestamps`：用 `PRAGMA user_version`（目标 1）一次性把早期 UTC 旧数据 +8 小时校正。
- `migrateAddLabelSw2`：用 `PRAGMA user_version`（目标 2）一次性为 SW2 在 Decommission 前补 `label_sw2`（步骤 9）。
- `migrateAddUnplugDownlinks`：用 `PRAGMA user_version`（目标 3）一次性在 Label 与 Decommission 之间为 SW1/SW2 各补 `unplug_downlink_*`（步骤 4、11），并顺移后续步骤到 5–16；对已完成同 phase Decommission 的历史 pair 直接标记该步骤为已完成。
- `migrateMergeLabelAndUnplug`：用 `PRAGMA user_version`（目标 5）一次性把 `unplug_downlink_*` 合并进同 phase 的 `label_*`（16 步 → 14 步）。合并步 `started_at` 取原 Label 开始时刻、`completed_at` 取原 Unplug 完成时刻并重算耗时；**原 Unplug 未完成则合并步整体视为未完成**，交回 B 组重做。随后删除 Unplug 行、统一文案为 `Label and Unplug Downlinks`，并按 `LEGACY_LAYOUT_V5` 快照重排全部 `step_order`（临时值用 `-1001` 起，避免与历史遗留负值撞 `UNIQUE(pair_id, step_order)`）。该重排取代了原 `migrateNormalizeStepOrder`（目标 4），后者已删除。
- `migrateAddEsxiCheckColumn`：按 `PRAGMA table_info` 幂等为 `pairs` 加 `esxi_check INTEGER NOT NULL DEFAULT 0`（历史 pair 一律 0，保持 14 步布局）。
- `migrateAddSortOrderColumn`：按 `PRAGMA table_info` 幂等为 `pairs` 加 `sort_order INTEGER NOT NULL DEFAULT 0`。**仅在本次刚加列时**回填一次，按加列前的展示口径 `id DESC` 编号（相关子查询「比自己 id 大的行数」= 0 基序号，不依赖窗口函数），保证升级前后顺序不变；此后该列由 `reorderPairs` / `createPair` 维护。
- `migrateAllowTeamC`：用 `PRAGMA user_version`（目标 6）一次性把 `step_instances.team` 的 CHECK 放宽到 `('A','B','C')`。SQLite 无法 `ALTER` 改 CHECK，只能**重建表**：建新表 → `INSERT SELECT` 全量复制 → `DROP` 旧表 → `RENAME` → 重建 `idx_step_instances_pair_id`。另有守护：若建表时已含 `'C'`（新库），跳过重建只推进版本号。

> 改 schema/步骤时：用 `PRAGMA user_version` 守护「只执行一次」的迁移，列新增用 `PRAGMA table_info` 判断幂等；重排 `step_order` 时用「先取负、再落值」两段避免撞唯一约束。
>
> **历史迁移不得引用 `pipeline.ts` 的现行布局**：布局会随需求演进，历史迁移必须钉死在当时的快照上（如 `LEGACY_LAYOUT_V5`），否则今后改流水线会反过来篡改旧迁移的语义。

## 9. API 速查

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | `/api/pairs?filter=all` | 公开 | 列出 Pair（filter: all/waiting_a/waiting_b/waiting_c/completed） |
| POST | `/api/pairs` | admin | 新建 `{switch1, switch2, rack?, footprint?, owner?, esxiCheck?}`（`esxiCheck` 仅严格 `true` 视为开启） |
| GET | `/api/pairs/:id` | 公开 | 单个 Pair |
| PATCH | `/api/pairs/:id` | admin/homison | 改 Info（footprint 任意登录可改；rack/owner 仅 admin） |
| POST | `/api/pairs/reorder` | admin | 调整展示顺序 `{orderedIds: number[]}`（须是当前全部 pair 的一个排列） |
| DELETE | `/api/pairs/:id` | admin | 删除 Pair |
| POST | `/api/pairs/:id/steps/:order/complete` | 按步骤 team | 完成步骤 |
| DELETE | `/api/pairs/:id/steps/:order/complete` | admin | 撤回步骤（`:order` 须是当前最后一个已完成步骤） |
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
- 若文档（`README.md` / 本文件）与代码出现分歧，一律以 `lib/` 实现为准。
- SQLite 单文件 + WAL，定位单机内网；高并发/分布式场景需更换存储。
