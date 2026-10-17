# 城迹入戏 · City Story AI

地方文化剧本游 Web MVP：选择角色 → 探索五个演示点位 → NPC 对话 → 六个任务 → 图鉴 → 三种规则结局 → 学习报告。保留现有 React 界面，剧情权威状态现在存放于服务端数据库。

当前交付是**可运行、可测试的工程 MVP**。演示 seed 自带 24 条知识，启动时会自动标记为 `reviewed` 并建立可检索切片；`trust_level=auto_published` 明确表示这不是人工事实核验。所有 NPC 对话都只使用当前数据库的已发布切片，证据不足仍会拒答。虚构剧情线索由独立的业务规则发放，可以完成演示游玩。四类内容标签只表示分类，不代表事实准确性。默认配置为 Mock；配置真实模型后可直接调用。

## 本地启动

需要 Node ≥22、Python ≥3.12。首次从仓库根目录复制 `.env.example` 为 `.env`，私密值不提交。

后端（从 backend 目录执行）：

```bash
python -m venv .venv
# Windows: .venv\Scripts\Activate.ps1
# Linux/macOS: source .venv/bin/activate
python -m pip install -c requirements.lock -e ".[dev]"
alembic upgrade head
python scripts/seed.py
uvicorn app.main:app --host 127.0.0.1 --port 8000
```

前端（另一个终端，从 frontend 目录执行）：

```bash
npm ci
npm run dev -- --host 127.0.0.1
```

访问 http://127.0.0.1:5173；API 文档 http://127.0.0.1:8000/api/docs；健康检查 /api/health 会检查已迁移数据库。重新运行 seed 会按自动发布策略修复知识状态和缺失索引，不覆写正文；前端仅缓存 API 响应，不依赖 localStorage 判定业务；清除浏览器 Cookie 会失去原匿名旅程关联。

## 管理与 AI 配置

在本地 `.env` 设置 ADMIN_PASSWORD 与私密的 ADMIN_JWT_SECRET 后可访问 /admin。管理接口使用 HttpOnly Cookie/JWT、登录限流和写操作审计；未配置密码时禁用登录。可录入/编辑资料、人工核对来源和授权、审核并发布索引、维护 NPC 与任务文案、处理纠错和查看真实数据库计数。

生成模型与 Embedding 分别配置，详见 [RAG 文档](docs/rag-agent.md)。未提供真实 API 密钥，默认 Mock；缺远程聊天密钥会显式标记 Mock。未审核、被拒绝、冲突、越点位和未披露章节资料不会成为回答证据。模型建议不能发放奖励。

地图采用腾讯地图 GL JS；在 frontend/.env 中配置 VITE_TMAP_KEY 及 Referer 白名单。没有 key 时直接显示可点击 SVG 路线，不请求占位地图服务。演示坐标近似；实地模式校验距离、精度和坐标系，但浏览器位置可模拟。

## 验证

```bash
# backend/
ruff check app tests scripts
pytest
python scripts/evaluate_ai.py
# frontend/
npm run lint
npm run test
npm run build
npx playwright install chromium
npm run test:e2e  # 后端需先启动在8000，使用独立演示数据库
```

本次真实结果与局限见 [测试报告](docs/test-results.md)。合成 AI 评测只验证工程机制，不是文化准确率或真实模型效果。

2026-10-11 全栈验收（隔离项目 `aic-acceptance`，独立数据卷与端口，未触碰本机既有部署）：

- **容器全栈已实测**：PostgreSQL 16.15 + pgvector 0.8.7、迁移 `0002`、Nginx 反代、健康链全部通过；容器重启后既有旅程、任务态、物品与对话日志逐项保留。
- **真实 AI 已实测**：DeepSeek `deepseek-chat` 与通义 `text-embedding-v3`（1024 维）接入容器，当时 11 条已审核语料发布为 11 个带向量的块（语料其后扩充至 22 条）；浏览器提问真实走 检索 → 引用校验 → 模型 → 界面展示，回答挂出 `reviewed_only` 范围内的引用。
- **拒绝路径零调用**：提示词注入与知识库外提问在本地被拦截，提供方字段为 `none`，不产生付费调用。
- **备份恢复已隔离验证**：`pg_dump` 恢复到独立库后，计数与向量维度逐项一致。
- 部署注意：编排以明文 HTTP 暴露前端，故显式设置 `SESSION_COOKIE_SECURE=false`；**加上 TLS 终止后必须删除该行**，否则浏览器不回传 Secure Cookie，表现为登录后接口全部 401 而健康检查正常。

## 技术与文档

React18、Vite、TypeScript、Tailwind、Zustand；FastAPI、SQLAlchemy2、Alembic；SQLite 开发；PostgreSQL + pgvector 部署配置；精确余弦/关键词混合检索；DeepSeek/Qwen/Ollama/Mock 适配。当前不依赖 Chroma。

- [实施进度和基线审查](docs/implementation-progress.md) · [开发交接](DEVELOPMENT.md)
- [需求](docs/requirements.md) · [架构](docs/architecture.md) · [API](docs/api-contract.md)
- [数据库](docs/database-schema.md) · [状态机](docs/story-state-machine.md) · [RAG](docs/rag-agent.md)
- [测试方法](docs/testing.md) · [部署](docs/deployment.md)
- [技术完成度审计](docs/final-audit.md) · [文化来源候选与审核边界](docs/competition/culture-source-checklist.md)

2026-10-11维护范围仅包括工程、环境与技术验证。原始技术方案和官方附件保持原样；此前AI生成的参赛草稿、PPT/PDF和审查ZIP按来源与引用核验后清理，不再作为开发入口。本轮文件快照、恢复副本、清理记录、实际测试及GitHub对比统一保存在项目外`D:/Code/AIC-maintenance/`，没有远端写入。

工程验收现状：后端 `pytest` **114 passed, 1 skipped**、`ruff` 全通过；前端 lint 0 报错、9 项单元测试、生产构建通过；桌面与移动端 10 项浏览器流程、针对容器栈的真实 AI 端到端（DeepSeek + 通义）均通过；依赖审计（生产）0 漏洞。仍未实测或需外部条件的项目：生产 HTTPS/TLS 与 Secure Cookie 形态、多实例共享限流、黄金题集的真实模型质量评测与人工文化事实评分、生成消融实验、pgvector 原生 ANN 索引。

## 真实性与许可

文化资料的书面授权与人工独立复核、黄金题集的真实模型质量评测、调研试点及佐证仍待团队提供。参赛材料禁止学校、LOGO、指导教师信息；不能以工程测试冒充文化应用成效。本次未提交、推送或发布仓库。[MIT](LICENSE) 仅适用于项目代码，不自动授予第三方文化资料权利。
