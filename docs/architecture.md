# 总体技术架构（V0.1 骨架）

> 来源：技术方案第 7、8、9 节。

## 1. 技术栈

| 层级 | 技术 | 职责 |
|---|---|---|
| 前端 | React + Vite + TypeScript + Tailwind CSS | 页面、交互和响应式 |
| 状态管理 | Zustand | Session 标记、旅程缓存和界面状态 |
| 地图 | 腾讯地图 GL JS（合规底图，GCJ-02 坐标） | 路线、点位、定位和触发展示；无密钥时降级为 SVG 示意路线 |
| 后端 | Python FastAPI | API、业务规则和 AI 编排 |
| ORM | SQLAlchemy + Alembic | 模型和数据库迁移 |
| 数据库 | SQLite 开发 / PostgreSQL 部署 | 业务数据和**权威剧情状态** |
| RAG | Chroma 或 FAISS 开发 / pgvector 部署 | 向量检索 |
| LLM | DeepSeek 或通义千问 / Ollama 备用 / mock | 结构化角色响应和结局文案 |
| 部署 | Docker + docker-compose + Nginx | 环境统一和反向代理 |
| 代码 | GitHub + CI | 版本、Issue、测试和构建 |

## 2. 系统分层

| 系统层 | 主要模块 |
|---|---|
| 用户交互层 | 首页、角色、地图、对话、任务、线索、图鉴、结局、报告 |
| 业务服务层 | Session、旅程、剧情状态机、任务、位置、图鉴、报告 |
| AI 能力层 | RAG、NPC Agent、结构化输出、事实审核、角色审核和安全审核 |
| 数据资源层 | 文化知识、剧情节点、用户状态、对话日志和测试集 |
| 治理运维层 | 权限、隐私、日志、版本、监控、备份和部署 |

## 3. 仓库目录树

```
city-story-ai/
├── docs/                  # 本文档目录（8 份）
├── frontend/
│   └── src/
│       ├── router/  layouts/  pages/  components/
│       ├── stores/  services/ hooks/  types/
│       └── mocks/   tests/
├── backend/
│   ├── app/
│   │   ├── api/routes/   # REST 路由
│   │   ├── core/         # 配置、安全、常量
│   │   ├── models/  schemas/  repositories/  services/
│   │   ├── ai/llm/       # LLM 适配器（deepseek/qwen/ollama/mock）
│   │   ├── ai/rag/       # 检索与索引
│   │   ├── ai/agents/    # NPC Agent
│   │   ├── ai/safety/    # 输入/输出安全审核
│   │   └── tests/
│   └── scripts/
├── data/  (templates/ demo/ raw/ processed/ testsets/)
├── deploy/ (nginx/ postgres/ scripts/)
└── .github/workflows/
```

## 4. 核心架构约束（红线）

1. **服务端数据库是剧情状态的唯一权威来源**；前端和大模型均无权直接修改任务、道具、图鉴或结局，所有状态变化必须经过后端动作校验器和剧情状态机。
2. 文化知识只有 `review_status=reviewed` 时才允许进入生产 RAG 索引。
3. SQLite 与 PostgreSQL 均通过 SQLAlchemy 模型访问，业务代码不依赖数据库方言。
4. 状态更新使用事务和 `state_version` 乐观锁，避免重复奖励或并发覆盖。
