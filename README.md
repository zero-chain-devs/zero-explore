# Zero Explorer (Etherscan-style UX for ZeroChain)

一个独立于 `zero-chain` 的区块浏览器项目，目录位于：

- `/home/de/works/zero-explorer/frontend`（Vite + React）
- `/home/de/works/zero-explorer/backend`（Rust + Axum）

## 产品定位

- **Etherscan 风格**：界面布局、搜索入口、信息分区、浏览路径参考 Etherscan 使用习惯。
- **ZeroChain 语义**：数据和能力以 `zero-chain` 当前已实现的 RPC 为准，不要求 1:1 Ethereum 全兼容。

## 功能

- 首页网络总览（chain/network/latest/mining/hashrate/gas/coinbase）
- 区块列表与区块详情
- 地址详情（`zero_getAccount` + `zero_getUtxos`）
- Compute Tx 查询（`zero_getComputeTxResult`）
- Object 查询（`zero_getObject`）
- Output 查询（`zero_getOutput`）
- Domain 查询（`zero_getDomain`）
- Recent Activity 双栏（Latest Blocks + Recent Compute Tx）
- Hot Addresses 面板（按浏览器访问热度聚合）
- 自动刷新（首页 5 秒）
- Blocks 分页（page + limit）
- 详情页字段卡片 + Raw JSON 双视图
- 顶部网络状态灯（backend + node RPC 可达性）
- 相对时间显示（如 `5s ago`）
- 关键字段复制按钮（hash/address）
- 智能搜索跳转（唯一匹配直接进入详情页）
- `/tx/:id` 别名路由（当前映射到 compute tx 语义）
- 后端短缓存（默认 5 秒）覆盖 network stats / blocks / block ranges / domain
- 后端标准化搜索返回（`kind + primary_id + canonical_route`）
- 新增区块范围接口（`/api/blocks/range`）
- 后端后台活动同步（定时采集最新块 miner + coinbase 到 hot addresses）
- 缓存调试接口（`/api/debug/cache`）
- 统一搜索：
  - block height
  - address
  - compute tx id / object id / output id（32-byte hash）
  - domain id

> 说明：后端优先使用 ZeroChain 原生能力（`zero_*`），同时兼容可用的 `eth_*` 基础信息（如 `eth_blockNumber`/`eth_chainId`）。
>
> 地址格式建议：原生地址使用 `ZER0x` + 40 hex（checksum）；EVM 地址保持 `0x...`。

## 启动

### 1) 启动 zero-chain 节点

默认假设节点 JSON-RPC 在：`http://127.0.0.1:8545`

### 2) 启动后端

```bash
cd /home/de/works/zero-explorer/backend
cargo run
```

可选环境变量：

- `ZERO_RPC_URL`（默认 `http://127.0.0.1:8545`）
- `ZERO_EXPLORER_BACKEND_BIND`（默认 `127.0.0.1:18080`）
- `ZERO_EXPLORER_STATE_FILE`（默认 `./data/explorer-state.json`，用于持久化 recent compute + hot addresses）

后端会将以下信息持久化到 `ZERO_EXPLORER_STATE_FILE`：

- recent compute 列表（最近查询到的 compute tx）
- hot addresses（按访问/展示热度聚合）

### 3) 启动前端

```bash
cd /home/de/works/zero-explorer/frontend
npm install
npm run dev
```

默认访问：`http://127.0.0.1:5178`

## API（backend）

- `GET /health`
- `GET /api/network/health`
- `GET /api/network/stats`
- `GET /api/blocks?limit=20`
- `GET /api/blocks/range?from=100&to=150&limit=50`
- `GET /api/blocks/:number`
- `GET /api/accounts/:address`
- `GET /api/compute/recent?limit=10`
- `GET /api/activity/hot-addresses?limit=10`
- `GET /api/compute/:tx_id`
- `GET /api/objects/:object_id`
- `GET /api/outputs/:output_id`
- `GET /api/domains/:domain_id`
- `GET /api/search/:query`
- `GET /api/debug/cache`

### 标准化搜索响应

`/api/search/:query` 返回字段：

- `kind`: 结果类型（`block`/`address`/`compute_tx`/`object`/`output`/`domain`）
- `primary_id`: 主键（例如 tx hash / address / block number）
- `canonical_route`: 前端建议跳转路径
- `value`: 原始详情对象

### 前端错误分层

前端现在会读取后端错误结构并按 `code` 分类展示（`rpc`/`not_found`/`bad_request`/`unknown`），不再依赖字符串猜测。

## 下一步建议

1. 将 recent compute 从“查询观测持久化”升级为链上/事件流接口。
2. 在 `zero-chain` 节点侧继续增强可索引数据接口（历史块、交易明细、分页查询）。
3. 增加后端缓存（例如 3~5 秒短缓存）降低 RPC 压力。
4. 增加真实交易模型后，将 `/tx/:id` 从别名切换为独立交易详情页。
