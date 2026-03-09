# zero-explore

ZeroChain 区块浏览器（前后端一体部署）。

## 目录

- `frontend`: React + Vite 页面
- `backend`: Rust + Axum API 与静态文件托管
- `scripts/run_lan_explorer.sh`: 局域网一键启动脚本

## 重构说明（稳定版）

本次已从“前端 dev server + 后端 API”拆分运行，重构为：

- 前端先构建为静态资源（`frontend/dist`）
- 后端同时提供：
  - `/api/*` 数据接口
  - `/health` 健康检查
  - `/` 及前端路由静态托管（SPA fallback 到 `index.html`）

这样局域网访问只依赖一个后端进程，避免前端 dev 进程掉线导致页面“崩掉”。

## 快速启动（推荐）

先确认 ZeroChain 节点 RPC 可用（默认 `http://127.0.0.1:19545`）。

```bash
cd /root/workspaces/blockchain/zero-explore
./scripts/run_lan_explorer.sh
```

默认监听：`0.0.0.0:19080`

访问地址：

- 本机：`http://127.0.0.1:19080/`
- 局域网设备：`http://<你的局域网IP>:19080/`

## 可选环境变量

- `ZERO_RPC_URL`：节点 RPC 地址（默认 `http://127.0.0.1:19545`）
- `ZERO_EXPLORER_BACKEND_BIND`：后端监听地址（默认 `0.0.0.0:19080`）
- `ZERO_EXPLORER_FRONTEND_DIST`：静态资源目录（默认 `frontend/dist`）
- `ZERO_EXPLORER_STATE_FILE`：浏览器状态持久化文件路径

## 前端 Playwright 巡检（Mock API）

在 `frontend` 目录下可以执行一键 QA：

```bash
cd /root/workspaces/blockchain/zero-explore/frontend
npm run qa:pages
```

这条命令会自动完成：
- `npm run build`
- 启动本地 `vite preview`
- 使用 Playwright 对以下内容做 mock API 巡检：
  - `SearchResultPage` / `AccountPage` / `BlocksPage` / `BlockDetailPage` 的 stale-response 竞态
  - `compute` / `tx` / `object` / `output` / `domain` / `txs` / `miners` / `miner-detail` 的详情页渲染

默认输出目录：

```bash
output/playwright/frontend-smoke/
```

可通过环境变量自定义：

```bash
QA_OUTPUT_DIR=../output/playwright/custom-smoke npm run qa:pages
```

## API 概览

- `GET /health`
- `GET /api/network/health`
- `GET /api/network/stats`
- `GET /api/overview`
- `GET /api/blocks`
- `GET /api/blocks/range`
- `GET /api/blocks/:number`
- `GET /api/accounts/:address`
- `GET /api/accounts/:address/blocks`
- `GET /api/accounts/:address/txs`
- `GET /api/miners`
- `GET /api/miners/:address`
- `GET /api/txs/recent`
- `GET /api/activity/hot-addresses`
- `GET /api/compute/recent`
- `GET /api/compute/:tx_id`
- `GET /api/tx/:tx_id`
- `GET /api/objects/:object_id`
- `GET /api/outputs/:output_id`
- `GET /api/domains/:domain_id`
- `GET /api/search/:query`

## 新增能力（对齐 Etherscan 常用视图）

- 历史区块查询：后端已切换到链上 `zero_getBlockByNumber / zero_getBlocksRange`，不再只看 latest block。
- 统计总览：`/api/overview` 聚合链高、24h 出块、平均出块间隔、活跃矿工与最近计算交易总量。
- 矿工视图：`/api/miners` 与 `/api/miners/:address` 支持矿工榜单和单矿工出块明细。
- 地址出块视图：`/api/accounts/:address/blocks` 可直接查看地址在窗口内的出块记录。
- 地址交易视图：`/api/accounts/:address/txs` 支持地址转账历史分页查询。
- 最近交易视图：`/api/txs/recent` 优先使用链上 `zero_listTransactions`（含 transfer + compute），旧节点自动回退。
