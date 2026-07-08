# DC Refresh Pipelines 协作工具

成对交换机（如 201-202）替换维护窗口的 Web 协作跟踪工具。两个 Team 通过颜色状态协作，自动记录每步完成时间，支持多 Pair 并行。

## 功能

- 每对交换机 16 步标准流水线，严格顺序执行
- cisco（蓝色）/ homison（橙色）分工可视化
- 一方完成后点击，另一方实时看到可执行步骤（SSE 推送）
- 记录每步 `started_at`、`completed_at`、`duration_sec`
- 筛选：全部 / 等 cisco / 等 homison / 已完成
- CSV 导出全部时间记录

## 登录与权限

| 身份 | 默认账号 | 查看 | 点 homison 步骤 | 点 cisco 步骤 | 导出 CSV | 删除 pipeline | 新建 pipeline |
|------|----------|:---:|:---:|:---:|:---:|:---:|:---:|
| cisco（管理员） | `cisco` / `cisco` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| homison | `homison` / `homison` | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ |
| 未登录（游客） | — | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ |

- 游客（未登录）为**只读**：可查看全部 pipeline、实时更新（SSE）并导出 CSV，但**不能做任何修改**（完成步骤 / 新建 / 删除）。
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

| # | Action | Team | Phase |
|---|--------|------|-------|
| 1 | Pipeline Start | A（cisco） | 全局 |
| 2 | Snapshot | A（cisco） | 全局 |
| 3 | Label | B（homison） | SW1 |
| 4 | Unplug Downlinks | B（homison） | SW1 |
| 5 | Decommission | A（cisco） | SW1 |
| 6 | Rack and Plugin Uplinks | B（homison） | SW1 |
| 7 | Register | A（cisco） | SW1 |
| 8 | Plugin Downlinks | B（homison） | SW1 |
| 9 | Post Check | A（cisco） | SW1 |
| 10 | Label | B（homison） | SW2 |
| 11 | Unplug Downlinks | B（homison） | SW2 |
| 12 | Decommission | A（cisco） | SW2 |
| 13 | Rack and Plugin Uplinks | B（homison） | SW2 |
| 14 | Register | A（cisco） | SW2 |
| 15 | Plugin Downlinks | B（homison） | SW2 |
| 16 | Post Check | A（cisco） | SW2 |

> 步骤定义以 `lib/pipeline.ts` 为单一事实来源。计时基准为 Snapshot（步骤 2）完成时刻，步骤 1、2 不计入总耗时与 CSV 导出。

## 数据存储

SQLite 数据库文件：`data/track.db`（首次启动自动创建）

## API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/pairs?filter=all` | 列出 Pair |
| POST | `/api/pairs` | 创建 Pair `{ "switch1": "201", "switch2": "202" }` |
| POST | `/api/pairs/:id/steps/:order/complete` | 完成步骤 |
| DELETE | `/api/pairs/:id` | 删除 Pair |
| GET | `/api/events` | SSE 实时事件 |
| GET | `/api/export` | 下载 CSV |

## 生产部署建议

1. 在内网一台 Linux/macOS 机器上运行 `npm run build && npm start`
2. 可选：Nginx 反向代理到 `127.0.0.1:3000`
3. 定期备份 `data/track.db`
4. 维护窗口结束后导出 CSV 归档
