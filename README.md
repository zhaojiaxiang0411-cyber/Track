# ACI Leaf Refresh Pipeline 协作工具

成对交换机（如 201-202）替换维护窗口的 Web 协作跟踪工具。两个 Team 通过颜色状态协作，自动记录每步完成时间，支持多 Pair 并行。

## 功能

- 每对交换机 15 步标准流水线，严格顺序执行
- cisco（蓝色）/ homison（橙色）分工可视化
- 一方完成后点击，另一方实时看到可执行步骤（SSE 推送）
- 记录每步 `started_at`、`completed_at`、`duration_sec`
- 筛选：全部 / 等 cisco / 等 homison / 已完成
- CSV 导出全部时间记录

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

| # | Action | Team |
|---|--------|------|
| 1 | MW Start | A |
| 2 | Snapshot (SW1) | A |
| 3 | Label (SW1) | B |
| 4 | Decommission (SW1) | A |
| 5 | Rack and Plugin Uplinks (SW1) | B |
| 6 | 发现后 Commission (SW1) | A |
| 7 | Plugin Downlinks (SW1) | B |
| 8 | Post Check (SW1) | A |
| 9–13 | 同上流程 (SW2) | A/B |

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
