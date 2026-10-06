# 城迹入戏 · City Story AI

> AI 地方文化剧本游平台（Web MVP）—— 将地方文化知识、空间路线、角色叙事、任务解谜和学习评价连接起来的沉浸式文化剧本游体验。

本项目为第八届全球校园人工智能算法精英大赛 · 算法主题赛（智能文化）参赛作品。

## 用户体验闭环

```
选择主题 → 选择角色 → 进入路线 → 到达点位 → 与 AI NPC 对话
        → 完成任务 → 解锁图鉴 → 形成结局 → 生成学习报告
```

- **文化知识库约束事实**：所有文化内容经人工审核后入库，AI 回答必须附证据引用，证据不足时明确拒答，不编造史实。
- **剧情状态机控制逻辑**：服务端数据库是剧情状态唯一权威，前端与 LLM 均无权直接修改任务、道具、图鉴或结局。
- **NPC Agent 角色化表达**：RAG 检索 + 角色卡 + 剧情上下文，生成有身份、有边界的 NPC 对话。
- **位置触发连接虚实**：Leaflet 地图 + 浏览器定位 + 虚拟游览双模式。
- **图鉴与报告承载学习评价**：文化条目区分史实 / 争议 / 传说 / 虚构，体验报告完全由真实旅程状态计算。

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React + Vite + TypeScript + Tailwind CSS + Zustand |
| 地图 | 腾讯地图 GL JS（合规底图；无密钥时自动降级为示意路线） |
| 后端 | Python FastAPI + SQLAlchemy + Alembic |
| 数据库 | SQLite（开发）/ PostgreSQL（部署） |
| RAG | Chroma（开发）/ pgvector（部署） |
| LLM | DeepSeek / 通义千问（Ollama 备用，mock 用于本地开发） |
| 部署 | Docker + docker-compose + Nginx |

## 仓库结构

```
city-story-ai/
├── docs/            # 需求、架构、API 契约、数据库、状态机、RAG、测试、部署文档
├── frontend/        # React 前端（页面、组件、状态、Mock）
├── backend/         # FastAPI 后端（API、业务规则、AI 编排）
├── data/            # 文化资料模板、演示数据、原始/处理数据、测试集
├── deploy/          # Nginx、PostgreSQL、部署脚本
└── .github/         # CI、Issue 与 PR 模板
```

## 快速开始

前置：Node.js ≥ 22，Python ≥ 3.11，Docker（可选）。

```bash
# 前端
cd frontend
npm install
npm run dev          # http://localhost:5173

# 后端（建议使用虚拟环境）
cd backend
pip install -e ".[dev]"
uvicorn app.main:app --reload   # http://localhost:8000/api/docs

# 全栈（生产形态）
cp .env.example .env   # 按需修改，禁止提交真实密钥
docker compose up --build
```

地图说明：前端默认使用腾讯地图 GL JS。在 [腾讯位置服务开放平台](https://lbs.qq.com) 申请免费密钥后填入 `frontend/.env` 的 `VITE_TMAP_KEY`（见 `frontend/.env.example`），并为密钥配置 Referer 白名单；未配置密钥时地图区域自动降级为可点击的示意路线，全部功能不受影响。

## 文档索引

- **[开发交接说明（DEVELOPMENT.md）](DEVELOPMENT.md)** —— 新成员从这里开始：环境搭建、架构红线、进度与待办、贡献指南
- [需求规格](docs/requirements.md) · [总体架构](docs/architecture.md) · [API 契约](docs/api-contract.md)
- [数据库设计](docs/database-schema.md) · [剧情状态机](docs/story-state-machine.md) · [RAG 与 NPC Agent](docs/rag-agent.md)
- [测试与验收](docs/testing.md) · [部署要求](docs/deployment.md)

## 匿名与真实性声明

- 本仓库及全部参赛材料中**不出现学校名称、学校 LOGO 与指导教师信息**。
- 仓库中不包含任何真实 API Key / 密钥，仅提供 `.env.example` 示例。
- 未提供真实来源的文化数据、用户数据与测试结果统一标注为【待补充】，不以占位内容冒充真实文化资料或应用成效。

## License

[MIT](LICENSE)
