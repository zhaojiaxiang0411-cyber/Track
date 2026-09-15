# DC Refresh Pipelines 协作工具

成对交换机（如 201-202）替换维护窗口的 Web 协作跟踪工具。各 Team 通过颜色状态协作，自动记录每步完成时间，支持多 Pair 并行。

## 功能

- 每对交换机 14 步标准流水线，严格顺序执行
- 点错时 cisco 可「撤回上一步」，把误点的步骤退回未完成，交回对应 team 重做（一次退一步）
- 新建时可勾选 **Esxi Check**：共插入三次——每台交换机的 Label and Unplug Downlinks 与 Decommission 之间各一次，流水线末尾再收尾一次，流水线变为 17 步（创建后不可更改）
- cisco（蓝色）/ homison（橙色）/ esxi（紫色）分工可视化
- 一方完成后点击，另一方实时看到可执行步骤（SSE 推送）
- 点完自己的步骤后不确定对方看到了，可在该 pipeline 上「呼叫对方确认」：提示直接出现在**对应 pipeline 的卡片里**（若该卡片被筛选挡住，页面顶部会兜底提示一条，点击可跳过去），对方点「已收到」后你就能看到确认时刻；对方直接点了下一步则视为已看到，呼叫自动消失。按钮只在**轮到对方的步骤进行中**时可点（轮到自己时置灰）
- 记录每步 `started_at`、`completed_at`、`duration_sec`
- 筛选：全部 / 等 cisco / 等 homison / 等 esxi / 已完成
- CSV 导出全部时间记录

## 登录与权限

| 身份 | 默认账号 | 查看 | 点 homison 步骤 | 点 cisco 步骤 | 点 esxi 步骤 | 撤回步骤 | 导出 CSV | 删除 pipeline | 新建 pipeline |
|------|----------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| cisco（管理员） | `cisco` / `cisco` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| homison | `homison` / `homison` | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| 未登录（游客） | — | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |

- esxi 没有独立账号：Esxi Check 由 esxi 团队负责执行，但在系统里由 cisco（管理员）代为点击完成。

- 「呼叫对方确认」两个登录账号都能发起，对象恒为另一方（cisco 呼叫 homison，homison 呼叫 cisco）；回执只有被呼叫方能点，发起方不能自己点掉，否则这个确认就没有意义了。
- 呼叫只在**被呼叫方的步骤进行中**时才能发起：cisco 要等流水线走到 homison 的步骤，homison 要等走到 cisco 的步骤（Esxi Check 由 cisco 代点，算 cisco 的步骤）。等自己干活时催对方没有意义，按钮置灰并给出提示。
- 游客（未登录）为**只读**：可查看全部 pipeline、实时更新（SSE）并导出 CSV，但**不能做任何修改**（完成步骤 / 新建 / 删除 / 呼叫）。
- 写操作权限在**服务端 API 强制校验**，前端按钮的禁用/隐藏仅为体验优化，直接调用 API 同样会被拦截（401/403）。
- 会话用 HMAC 签名的 `httpOnly` Cookie 保存，默认有效期 12 小时。

### 可选环境变量（生产建议设置）

| 变量 | 说明 | 默认 |
|------|------|------|
| `AUTH_SESSION_SECRET` | 会话签名密钥，生产务必设为高熵随机值 | 内置开发密钥（不安全） |
| `AUTH_CISCO_PASSWORD` | 覆盖 cisco 账号密码 | `cisco` |
| `AUTH_HOMISON_PASSWORD` | 覆盖 homison 账号密码 | `homison` |
| `AUTH_COOKIE_SECURE` | 设为 `true` 时 Cookie 仅经 HTTPS 下发（http 内网部署保持默认） | `false` |

```bash
# 示例：生产环境覆盖密钥与密码
AUTH_SESSION_SECRET="$(openssl rand -base64 32)" \
AUTH_CISCO_PASSWORD='强密码1' \
AUTH_HOMISON_PASSWORD='强密码2' \
npm start
```

## 环境要求

- Node.js 22.5+（使用内置 `node:sqlite`，无需 Xcode 编译工具）
- npm 或 yarn

## 快速启动

```bash
cd Track
npm install
npm run dev
```

浏览器访问：`http://localhost:3000`

内网共享（其他同事访问本机 IP）：

```bash
npm run dev
# 或生产模式
npm run build && npm start
```

服务默认绑定 `0.0.0.0:3000`，同事可通过 `http://<你的内网IP>:3000` 访问。

## 流水线步骤

「#」列为不勾选 Esxi Check 时的序号，「#(Esxi)」为勾选后的序号。

| # | #(Esxi) | Action | Team | Phase |
|---|---|--------|------|-------|
| 1 | 1 | Pipeline Start | A（cisco） | 全局 |
| 2 | 2 | Snapshot | A（cisco） | 全局 |
| 3 | 3 | Label and Unplug Downlinks | B（homison） | SW1 |
| — | 4 | **Esxi Check**（可选） | C（esxi） | SW1 |
| 4 | 5 | Decommission | A（cisco） | SW1 |
| 5 | 6 | Rack and Plugin Uplinks | B（homison） | SW1 |
| 6 | 7 | Register | A（cisco） | SW1 |
| 7 | 8 | Plugin Downlinks | B（homison） | SW1 |
| 8 | 9 | Post Check | A（cisco） | SW1 |
| 9 | 10 | Label and Unplug Downlinks | B（homison） | SW2 |
| — | 11 | **Esxi Check**（可选） | C（esxi） | SW2 |
| 10 | 12 | Decommission | A（cisco） | SW2 |
| 11 | 13 | Rack and Plugin Uplinks | B（homison） | SW2 |
| 12 | 14 | Register | A（cisco） | SW2 |
| 13 | 15 | Plugin Downlinks | B（homison） | SW2 |
| 14 | 16 | Post Check | A（cisco） | SW2 |
| — | 17 | **Esxi Check**（可选，收尾） | C（esxi） | 全局 |

> 步骤定义以 `lib/pipeline.ts` 为单一事实来源。计时基准为 Snapshot 完成时刻，Pipeline Start 与 Snapshot 不计入总耗时与 CSV 导出。Esxi Check 计入总耗时并出现在 CSV 中。

## 数据存储

SQLite 数据库文件：`data/track.db`（首次启动自动创建）

## API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/pairs?filter=all` | 列出 Pair |
| POST | `/api/pairs` | 创建 Pair `{ "switch1": "201", "switch2": "202", "esxiCheck": false }` |
| POST | `/api/pairs/:id/steps/:order/complete` | 完成步骤 |
| DELETE | `/api/pairs/:id/steps/:order/complete` | 撤回步骤（仅 cisco，`:order` 须是最后一个已完成步骤） |
| DELETE | `/api/pairs/:id` | 删除 Pair |
| POST | `/api/pairs/:id/ping` | 呼叫对方确认（登录用户，对象恒为另一方；仅当前步骤由对方负责时可发起） |
| DELETE | `/api/pairs/:id/ping` | 收起呼叫（仅发起方） |
| POST | `/api/pairs/:id/ping/ack` | 回执「已收到」（仅被呼叫方） |
| GET | `/api/pings` | 当前有效的呼叫列表 |
| GET | `/api/events` | SSE 实时事件 |
| GET | `/api/export` | 下载 CSV |

> 呼叫状态只存服务端内存，不入库、不进 CSV：它是几分钟内就该消化掉的临时提示，权威状态始终是步骤进度本身。服务重启会丢掉待确认的呼叫，没人确认就再点一次即可。

## 生产部署建议

1. 在内网一台 Linux/macOS 机器上运行 `npm run build && npm start`
2. 可选：Nginx 反向代理到 `127.0.0.1:3000`
3. 定期备份 `data/track.db`
4. 维护窗口结束后导出 CSV 归档
