# 城迹入戏 · City Story AI

地方文化剧本游 Web MVP：选择角色 → 探索五个演示点位 → NPC 对话 → 六个任务 → 图鉴 → 三种规则结局 → 学习报告。保留现有 React 界面，剧情权威状态现在存放于服务端数据库。

当前交付是**可运行、可测试的工程 MVP**。14 条演示知识全部保持 pending，正式检索没有已审核资料；NPC 文化回答因此会拒答。虚构剧情线索由独立的业务规则发放，可以完成演示游玩。四类内容标签只表示分类，不代表已审核。默认 Mock，未声称真实模型或文化效果验收完成。

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

访问 http://127.0.0.1:5173；API 文档 http://127.0.0.1:8000/api/docs；健康检查 /api/health 会检查已迁移数据库。重新运行 seed 不会覆写人工编辑或审核状态。前端仅缓存 API 响应，不依赖 localStorage 判定业务；清除浏览器 Cookie 会失去原匿名旅程关联。

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
- **真实 AI 已实测**：DeepSeek `deepseek-chat` 与通义 `text-embedding-v3`（1024 维）接入容器，11 条已审核语料发布为 11 个带向量的块；浏览器提问真实走 检索 → 引用校验 → 模型 → 界面展示，回答挂出 `reviewed_only` 范围内的引用。
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

本轮修复Unicode管理员登录与性能工具的连接失败记录，后端99项回归通过。Docker Desktop已普通用户安装，Compose配置解析通过；WSL/Engine尚不可用，实际容器与PostgreSQL验收仍待系统环境授权。前端9项单元、10项浏览器流程和生产构建通过；真实模型实验仍未执行。

## 真实性与许可

演示文化来源、授权和人工审核、真实模型实验、调研试点及佐证仍待提供。参赛材料禁止学校、LOGO、指导教师信息；不能以工程测试冒充文化应用成效。本次未提交、推送或发布仓库。[MIT](LICENSE) 仅适用于项目代码，不自动授予第三方文化资料权利。
