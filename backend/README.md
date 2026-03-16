# zero-explore backend

ZeroChain 区块浏览器后端服务（Rust + Axum）。

## 职责

- 提供数据接口：`/api/*`
- 健康检查：`/health`
- 托管前端静态资源（SPA fallback 到 `index.html`）

## 运行（推荐）

优先使用仓库根目录的一键脚本启动（会先构建前端再启动后端）：

```bash
cd /root/workspaces/blockchain/zero-explore
./scripts/run_lan_explorer.sh
```

## 本地开发

```bash
cd /root/workspaces/blockchain/zero-explore/backend
cargo run
```

## 环境变量

（与仓库根目录 `README.md` 保持一致）

- `ZERO_RPC_URL`：节点 RPC 地址（默认 `http://127.0.0.1:19545`）
- `ZERO_EXPLORER_BACKEND_BIND`：后端监听地址（默认 `0.0.0.0:19080`）
- `ZERO_EXPLORER_FRONTEND_DIST`：静态资源目录（默认 `frontend/dist`）
- `ZERO_EXPLORER_STATE_FILE`：浏览器状态持久化文件路径

## Redlines（错误处理）

- 默认 **fail-fast**：RPC 请求失败 / JSON-RPC 返回 error / 必要字段缺失会直接返回 `rpc_error`（HTTP 502），不会“默默”降级为 `0` / `null` 继续返回“看似正常”的数据。

## 测试

```bash
cargo test
```

