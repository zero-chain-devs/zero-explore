# zero-explore frontend

ZeroChain 区块浏览器前端（React + Vite）。

> 生产部署时，前端会先构建到 `dist/`，再由 `../backend` 统一托管（`/` + 前端路由 + `/api/*`）。

## 安装

本项目存在 `package-lock.json`，请使用 `npm`：

```bash
cd /root/workspaces/blockchain/zero-explore/frontend
npm install
```

## 开发

```bash
npm run dev
```

- 默认端口：`5178`
- dev server 会把 `/api` 与 `/health` 代理到 `VITE_BACKEND_URL`（默认 `http://127.0.0.1:18080`，见 `vite.config.ts`）。

## 构建

```bash
npm run build
```

输出目录：`dist/`

## 环境变量

- `VITE_BACKEND_URL`：仅用于 **dev server** 的代理目标（`vite.config.ts` 读取 `process.env`）。
- `VITE_API_BASE`：API base（`import.meta.env`，用于把请求拼到 backend 之前）。
- `VITE_API_TIMEOUT_MS`：请求超时（默认 `8000`）。
- `VITE_API_RETRIES`：重试次数（默认 `2`）。

## Playwright 巡检（Mock API）

```bash
npm run qa:pages
```

默认输出目录：

```bash
output/playwright/frontend-smoke/
```

