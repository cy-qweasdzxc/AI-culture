# 部署要求（V0.1 骨架）

> 来源：技术方案第 18 节。

## 1. 环境变量

| 变量 | 用途 | 提交 GitHub |
|---|---|---|
| APP_ENV | development / production | 仅示例 |
| DATABASE_URL | SQLite 或 PostgreSQL 连接 | 禁止真实值 |
| SESSION_SECRET | Session 签名 | 禁止 |
| ADMIN_JWT_SECRET | 管理端认证 | 禁止 |
| LLM_PROVIDER | deepseek / qwen / ollama / mock | 可提交示例 |
| LLM_API_KEY | 模型 API 密钥 | 禁止 |
| LLM_BASE_URL | 模型接口地址 | 仅示例 |
| CHROMA_PATH | 本地向量库目录 | 仅示例 |
| CORS_ORIGINS | 允许访问的前端域名 | 仅示例 |
| VITE_TMAP_KEY | 腾讯地图密钥（前端，需自行申请并配 Referer 白名单） | 禁止 |

仓库只提交 `.env.example`；真实值写入本地 `.env`（已被 .gitignore 排除）。

## 1.1 地图合规

前端底图仅使用合规地图服务（腾讯地图 GL JS），禁止使用 OpenStreetMap 海外瓦片、Google Maps 等无资质图源。坐标系为 GCJ-02；浏览器 geolocation 返回的 WGS-84 坐标需经 `utils/coordTransform.ts` 转换后再用于距离判断。未配置密钥时自动降级为 SVG 示意路线。

## 2. 部署拓扑

- Nginx 反向代理：静态前端由 Nginx 提供，`/api` 转发至 FastAPI；SPA 路由回退到 `index.html`。
- PostgreSQL（含 pgvector）和向量服务仅在内部网络开放，不对外暴露端口。
- 生产部署前需备份数据库，并固定模型、提示词和知识库版本。

## 3. 本地启动

```bash
cp .env.example .env
docker compose up --build   # 前端 http://localhost:8080
```

开发模式不使用 Docker：前端 `npm run dev`（Vite 代理 /api → :8000），后端 `uvicorn app.main:app --reload`。
