# 城迹入戏 · City Story AI

2026-10-27 整合版：沿用 GitHub 的四城目录与苏州经典完整路线，合入本地 15 道自选挑战、65 条推荐问题，与原 8 项独立探索共同运行；主线、挑战、探索分别统计进度和积分。整合取舍、存档约定与复现命令见 [合并交接说明](docs/github-local-merge-handoff.md)。

地方文化剧本游 Web MVP：选择角色 → 探索五个演示点位 → NPC 对话 → 六个任务 → 图鉴 → 三种规则结局 → 学习报告。保留现有 React 界面，剧情权威状态现在存放于服务端数据库。

对话支持「多人同场」：导演 Agent 根据玩家点名、话题和当前进度安排发言，旁白 Agent 衔接场景，已相识角色在共享对话中依次接话。导演决定、旁白与角色消息通过 SSE 实时送达，整轮保存后可刷新恢复；文化证据、任务与结局仍受服务端规则校验。单人对话入口继续保留。架构、流事件与降级说明见[多角色同场对话](docs/multi-agent-scene.md)。

当前交付是**可运行、可测试的工程 MVP**。演示 seed 自带 24 条待审核资料，默认以 `pending / unverified / is_demo=true` 初始化，不自动授予人工审核或正式检索资格。正式文化检索同时校验人工审核记录、当前内容版本与索引；`auto_published` 不属于 `human_reviewed`，不能进入正式事实检索。证据不足时 NPC 会拒答。虚构剧情线索由独立的业务规则发放，可以完成演示游玩。四类内容标签只表示分类，不代表事实准确性。默认配置为 Mock；配置真实模型后可直接调用。

## 当前工程与验收范围（2026-10-27）

苏州五站保留六项主线与三个结局，另有八项可选探索、24 套难度变体，以及 NPC、多 Agent、SSE、积分、图鉴和刷新恢复。探索奖励与任务状态统一由服务端校验；两个文化题草案仍待独立人工审核。

最终源码 ZIP / Mock Demo ZIP 已在各自全新解压环境安装运行：Pytest 352 项、零警告，Vitest 93 项，源码桌面及移动 Chromium E2E 50 项，Docker Android Chromium / iPhone WebKit 模拟 36 项，WebKit 页面就绪回归连续 3 项；Ruff、ESLint、TypeScript、生产构建、PostgreSQL / pgvector、迁移与重启恢复通过。以上为本地及独立容器验收，GitHub CI 状态以对应 Actions 运行记录为准。

本轮未调用付费模型。真实 LLM / Embedding、腾讯地图服务、游客入口实地核验仍需外部条件；夸克、微信等真机浏览器与生产 HTTPS 尚未验收。首次安装需联网下载依赖或镜像，Mock 运行不要求付费密钥；历史 ERR_NO_BUFFER_SPACE 本轮未复现，继续观察。

## 本地启动

需要 Python ≥3.12；Windows 推荐使用 `.node-version` 指定的 Node 24.22.1。项目会拒绝已确认存在崩溃问题的 Node 24.15.x；Docker 使用独立的 Node 22 构建环境。首次从仓库根目录复制 `.env.example` 为 `.env`，私密值不提交。

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

访问 http://127.0.0.1:5173；API 文档 http://127.0.0.1:8000/api/docs；健康检查 /api/health 会检查已迁移数据库。重新运行 seed 只初始化缺失记录，保留人工修改、审核、拒绝和撤审决定，不自动发布正式文化索引；前端仅缓存 API 响应，不依赖 localStorage 判定业务；清除浏览器 Cookie 会失去原匿名旅程关联。

Windows 已安装依赖后，可以使用隔离的 Mock 启动器；它会生成本地私密配置，保留已有 Demo 数据，后端仅监听回环地址。局域网设备通过前端同源 `/api` 访问：

```powershell
.\deploy\start-demo.ps1 -Lan
.\deploy\stop-demo.ps1
# 独立 PostgreSQL / pgvector Demo（不发布数据库端口）
.\deploy\start-demo-docker.ps1 -Project citystory-candidate -Port 18088
.\deploy\stop-demo-docker.ps1 -Project citystory-candidate
```

## 管理与 AI 配置

在本地 `.env` 设置 ADMIN_PASSWORD 与私密的 ADMIN_JWT_SECRET 后可访问 /admin。管理接口使用 HttpOnly Cookie/JWT、登录限流和写操作审计；未配置密码时禁用登录。可录入/编辑资料、人工核对来源和授权、审核并发布索引、维护 NPC 与任务文案、处理纠错和查看真实数据库计数。

生成模型与 Embedding 分别配置，详见 [RAG 文档](docs/rag-agent.md)。未提供真实 API 密钥，默认 Mock；缺远程聊天密钥会显式标记 Mock。未审核、被拒绝、冲突、越点位和未披露章节资料不会成为回答证据。模型建议不能发放奖励。

地图采用腾讯地图 GL JS；在 frontend/.env 中配置 VITE_TMAP_KEY 及 Referer 白名单。没有 key 时直接显示可点击的路线示意图，不请求占位地图服务。演示坐标近似；实地模式校验距离、精度和坐标系，但浏览器位置可模拟。

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
- 部署注意：编排以明文 HTTP 暴露前端，故显式设置 `SESSION_COOKIE_SECURE=false`；**加上 TLS 终止后应删除该覆盖项以恢复 Secure Cookie**，避免会话令牌经明文 HTTP 传输。

## 技术与文档

React18、Vite、TypeScript、Tailwind、Zustand；FastAPI、SQLAlchemy2、Alembic；SQLite 开发；PostgreSQL + pgvector 部署配置；精确余弦/关键词混合检索；DeepSeek/Qwen/Ollama/Mock 适配。当前不依赖 Chroma。

- [实施进度和基线审查](docs/implementation-progress.md) · [开发交接](DEVELOPMENT.md)
- [需求](docs/requirements.md) · [架构](docs/architecture.md) · [API](docs/api-contract.md)
- [数据库](docs/database-schema.md) · [状态机](docs/story-state-machine.md) · [RAG](docs/rag-agent.md)
- [测试方法](docs/testing.md) · [部署](docs/deployment.md)
- [技术完成度审计](docs/final-audit.md) · [文化来源候选与审核边界](docs/competition/culture-source-checklist.md)

2026-10-11维护范围仅包括工程、环境与技术验证。原始技术方案和官方附件保持原样；此前AI生成的参赛草稿、PPT/PDF和审查ZIP按来源与引用核验后清理，不再作为开发入口。该轮文件快照、恢复副本、清理记录、实际测试及 GitHub 对比保存在当时的项目外维护目录，该轮没有远端写入。

2026-10-11 历史工程验收结果（不代表当前未提交工作区的验收结果）：后端 `pytest` **114 passed, 1 skipped**、`ruff` 全通过；前端 lint 0 报错、9 项单元测试、生产构建通过；桌面与移动端 10 项浏览器流程、针对容器栈的真实 AI 端到端（DeepSeek + 通义）均通过；依赖审计（生产）0 漏洞。仍未实测或需外部条件的项目：生产 HTTPS/TLS 与 Secure Cookie 形态、多实例共享限流、黄金题集的真实模型质量评测与人工文化事实评分、生成消融实验、pgvector 原生 ANN 索引。

## 真实性与许可

文化资料的书面授权与人工独立复核、黄金题集的真实模型质量评测、调研试点及佐证仍待团队提供。参赛材料禁止学校、LOGO、指导教师信息；不能以工程测试冒充文化应用成效。源码提交及 PR 状态以 GitHub 记录为准。[MIT](LICENSE) 仅适用于项目代码，不自动授予第三方文化资料权利。

## 苏州全域资料与可选背景音乐

首页或文化主题中的城市目录可展开「苏州全域景点资料」，浏览 ZIP 补充的 50 个近似点位、搜索与区域/类型筛选，以及 10 条待审核来源候选。它使用只读 `/api/cities/suzhou/attractions` 及点位详情接口，不修改已发布路线、旅程、文化审核或 RAG 索引。无地图 Key 或 SDK 失败时保留坐标分布示意与列表；未核验点位不提供任务触发或导航。

页脚古琴音乐默认关闭，用户主动点击后才请求音频。录音为 Charlie Huang（Charles R Tsua）的《阳关三叠》，原始 Ogg 按 CC BY-SA 3.0 保留，来源、许可和哈希见 `frontend/public/assets/audio/credits.json` 与 `LICENSE.txt`；音频许可独立于代码许可。播放失败或浏览器不支持时不影响游览。

ZIP 中的旧覆盖脚本、缓存、构建产物及未核验许可的外链图片未导入；现有主线、15 道自选挑战、8 项探索、正式文化资料及其审核状态保持原有规则。
