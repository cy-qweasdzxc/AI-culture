# 开发交接说明 · 城迹入戏（City Story AI）

> 面向接手开发者。读完本文档，你应当能在 30 分钟内跑起项目、理解架构红线，并开始下一个阶段的开发。
> 最后更新：2026-10-07（前端可点击原型完成时）

---

## 1. 项目背景与目标

《城迹入戏》是 **AI 地方文化剧本游平台（Web MVP）**，参赛作品（第八届全球校园人工智能算法精英大赛 · 算法主题赛"智能文化"）。

它不是聊天页，也不是导览站，而是把**地方文化知识 + 空间路线 + 角色叙事 + 任务解谜 + 学习评价**连成一条可验证的闭环：

```
选择主题 → 选择角色 → 路线探索 → 点位触发 → AI NPC 对话（RAG 证据引用）
        → 任务解谜 → 图鉴解锁 → 结局 → 学习报告
```

**关键赛程（2026）**：初赛作品提交截止 **10 月 15 日 20:00**（www.aicomp.cn，逾期不可修改）；复赛 10 月底前；总决赛 11 月底前（晋级后可继续完善作品）。

**评分维度**：创新性 25 / AI 技术应用 20 / 需求分析 15 / 项目实施 15 / 应用成效 15 / 总结展望 10。

**MVP 边界**：1 主题 1 路线、3-5 点位、3 玩家角色 + 3 NPC、5-8 任务、≥2 结局、虚拟游览 + 浏览器定位、RAG 证据引用、图鉴、体验报告、简版后台、Docker 部署。**不做**：多城市/多租户/会员、AR/语音/小程序、多人实时/支付、大模型微调。

## 2. 技术栈与主要依赖

| 层 | 技术 | 版本（当前锁定） |
|---|---|---|
| 前端框架 | React + TypeScript | react 18.3 · typescript 5.6 |
| 构建 | Vite | 5.4 |
| 样式 | Tailwind CSS | 3.4（OKLCH 设计令牌，见 `src/index.css`） |
| 状态 | Zustand（persist → localStorage） | 4.5 |
| 路由 | React Router | 6.26 |
| 地图 | **腾讯地图 GL JS**（合规底图，GCJ-02） | gljs v1.exp（CDN 动态加载） |
| 测试 | Vitest + Testing Library + Playwright | vitest 2.1 · @playwright/test 1.47 |
| 后端（下一阶段） | FastAPI + SQLAlchemy + Alembic | 见 `backend/pyproject.toml` |
| 数据库 | SQLite（开发）/ PostgreSQL + pgvector（生产） | — |
| AI（第 5 周） | RAG + DeepSeek / 通义千问 / Ollama / mock | — |
| 部署 | Docker + docker-compose + Nginx | — |

> **为什么不用技术方案原定的 Leaflet**：中国地图合规要求禁止使用 OSM 海外瓦片等无资质图源，已改为腾讯地图 GL JS（`docs/deployment.md` 1.1 节有合规说明）。

## 3. 整体架构与核心模块

### 3.1 阶段策略

```
阶段一（已完成）  前端可点击原型：Mock 数据 + 前端状态机引擎，无后端
阶段二（下一步）  FastAPI 后端：权威状态机、数据库、API 契约落地
阶段三           RAG + LLM 接入：真实 NPC Agent、文化知识审核入库
阶段四           测试加固、Docker 部署、参赛材料
```

阶段一的关键设计：**前端引擎与后端契约同构**，使阶段二可以"平移"而非重写。

### 3.2 核心模块（前端）

| 模块 | 文件 | 职责 |
|---|---|---|
| **旅程引擎** | `src/engine/journeyStore.ts` | 全局唯一状态入口。Session、状态机（CREATED→COMPLETED）、点位/任务/线索/图鉴/结局的全部校验与转移、NPC 对话编排、纠错日志。**组件无权直接改状态，一切经引擎动作**（对应后端动作校验器红线） |
| **演示数据** | `src/data/*.ts` | 苏州平江路主题全部内容：点位（theme）、证据库（knowledge）、角色（roles）、NPC（npcs）、任务（tasks）、线索（clues）、图鉴（codex）、结局（endings） |
| **NPC 规则引擎** | `src/data/chatScripts.ts` | 关键词匹配的规则表，响应结构与后端 AI 契约（`docs/api-contract.md` 11.1）对齐：dialogue / intent / evidence_ids / task_action；越界统一走 `REFUSAL_TEXT` 拒答兜底 |
| **地图** | `src/components/MapView.tsx` | 腾讯地图封装：动态加载 SDK、自定义状态标记（SVG data-uri）、路线 Polyline；`VITE_TMAP_KEY` 可选自有密钥 |
| **示意地图** | `src/components/SchematicMap.tsx` | 地图不可用时的完整功能降级（可点击 SVG 路线） |
| **坐标转换** | `src/utils/coordTransform.ts` | 浏览器定位 WGS-84 → GCJ-02 转换 + 球面距离（实地模式触发判定） |
| **页面** | `src/pages/*.tsx` | 15 个规定路由 + 404；布局分公共区/旅程区（`src/layouts/`） |

### 3.3 剧情状态机（务必先读 `docs/story-state-machine.md`）

`S(t+1) = T(S(t), A(t), C(t))`——S 权威状态、A 用户行为、C 条件（位置/任务/道具/关系）、T 引擎转移函数。请求校验顺序：Session 合法 → 节点匹配 → 幂等 → 位置/前置任务 → 线索/道具 → 状态边存在 → 事务更新 + 事件日志。

### 3.4 内容真实性体系

文化内容四级标注并在 UI 三通道呈现（图标+文字+色彩）：`fact` 可靠史实 / `disputed` 争议观点 / `legend` 民间传说 / `fiction` 艺术化虚构。NPC 回答必须挂 `evidence_ids`（前端可展开来源），证据不足必须拒答。演示数据在界面明示。

## 4. 目录结构

```
city-story-ai/
├── PRODUCT.md             # 设计上下文（impeccable：register/用户/品牌/红线）
├── DEVELOPMENT.md         # 本文档
├── docs/                  # 8 份设计文档（需求/架构/API/数据库/状态机/RAG/测试/部署）
├── frontend/
│   ├── src/
│   │   ├── engine/journeyStore.ts   # ★ 旅程引擎（状态机）
│   │   ├── data/                    # ★ 演示内容数据（9 个模块）
│   │   ├── pages/                   # 16 个页面
│   │   ├── components/              # MapView / SchematicMap / Drawer / TypeTag ...
│   │   ├── layouts/  router/  stores/  services/  hooks/  types/  utils/
│   │   └── tests/                   # Vitest（8 项用例）
│   ├── scripts/e2e-*.mjs            # Playwright 冒烟脚本
│   └── .env.example                 # VITE_TMAP_KEY 占位（禁填真实值提交）
├── backend/
│   ├── app/                         # FastAPI 骨架：main / core.config / api.routes.health
│   │   ├── models/ schemas/ repositories/ services/   # 空包，阶段二填充
│   │   └── ai/llm/ ai/rag/ ai/agents/ ai/safety/      # 空包，阶段三填充
│   └── pyproject.toml               # fastapi/sqlalchemy/alembic/pytest/ruff
├── data/                            # 文化资料模板与测试集（含录入红线 README）
├── deploy/                          # nginx.conf（/api 反代 + SPA 回退）
├── docker-compose.yml               # db(pgvector) + backend + frontend(nginx)
└── .github/                         # CI（双 job）+ Issue/PR 模板（含红线自查）
```

## 5. 本地环境搭建与运行

### 前置要求

- Node.js ≥ 22（本仓库在 Node 24.15 + npm 11 下验证通过）
- Python ≥ 3.11（后端阶段）
- npm 国内镜像：`--registry=https://registry.npmmirror.com`（可选但推荐）

### 前端（当前主战场）

```bash
cd frontend
npm install                # 安装依赖
npm run dev                # 开发服务器 http://localhost:5173
npm run test               # Vitest（8 项状态机红线用例）
npm run build              # tsc 类型检查 + 生产构建 → dist/
npm run lint               # ESLint（0 错误，1 个 fast-refresh 警告属已知）
```

体验路径：首页 → 开始体验 → 选角色 → 地图点「平江路」→ 到达此点 → 与周伯对话问《平江图》→ 任务页输入密码 `1229` → 顺路线通关 → 苏博尾声二选一 → 结局 + 报告。

### 地图密钥（可选）

底图默认免密钥可用；若需消除 SDK 非瓦片服务的鉴权报错，到[腾讯位置服务开放平台](https://lbs.qq.com)申请免费密钥，写入 `frontend/.env` 的 `VITE_TMAP_KEY`（复制自 `.env.example`），并配置 Referer 白名单。**真实密钥禁止提交。**

### E2E 冒烟（Playwright）

```bash
npm exec playwright install chromium   # 首次；国内可加 PLAYWRIGHT_DOWNLOAD_HOST=https://registry.npmmirror.com/-/binary/playwright
npm run dev                            # 先起服务
node scripts/e2e-smoke.mjs http://127.0.0.1:5173 <截图输出目录>
node scripts/e2e-map-check.mjs         # 地图专项（瓦片/标记/降级）
```

### 后端（骨架，阶段二启用）

```bash
cd backend
pip install -e ".[dev]"
uvicorn app.main:app --reload          # http://localhost:8000/api/docs（/api/health）
pytest                                 # 健康检查用例
```

### 全栈（生产形态，阶段四）

```bash
cp .env.example .env   # 设置 DB_PASSWORD 等，禁止提交真实值
docker compose up --build              # 前端 :8080，db/backend 仅内部网络
```

## 6. 当前开发进度（截至 2026-10-07）

**已完成（阶段一，可演示）**

- ✅ 仓库骨架：8 份 docs、GitHub 模板、CI、docker-compose、Nginx、后端 FastAPI 骨架、数据模板
- ✅ 前端 15 路由全部真实实现 + 404；公共区/旅程区布局、移动端底部五项导航（375px 可用）
- ✅ 苏州平江路演示主题：5 点位 / 3 角色 / 3 NPC / 6 任务（问答、密码、排序、线索组合）/ 3 结局 / 14 条四级图鉴 / 13 条证据
- ✅ 旅程引擎：状态机、幂等校验、前置线索校验、点位顺序解锁、尾声二选一分支结局、localStorage 持久化、重置
- ✅ NPC 规则引擎：证据引用抽屉、拒答兜底、角色差异回复、纠错反馈入审核队列
- ✅ 腾讯地图接入：状态标记、路线绘制、点位浮层、虚拟/实地双模式（实地含坐标转换与半径判定）、SVG 示意降级
- ✅ 管理后台（只读原型）：仪表盘、文化资料、角色、剧情节点、对话审核、指标
- ✅ 质量：Vitest 8/8、生产构建通过（gzip ≈107KB）、Lint 0 错误、Playwright 截图人工审查（桌面+移动）

**验证入口**：`npm run dev` 后按第 5 节体验路径走一遍完整闭环。

## 7. 待办事项与已知问题

### 下一阶段待办（按优先级）

1. **后端权威化（原计划第 3-4 周）**：FastAPI 落地 API 契约（`docs/api-contract.md`），把 `journeyStore` 的校验逻辑平移到后端动作校验器；SQLAlchemy 模型按 `docs/database-schema.md` 17 表实现；匿名 Session Cookie；前端 `services/api.ts` 替换引擎调用。
2. **RAG + LLM（原计划第 5 周）**：文化知识审核入库流程、`ai/llm` 适配器（先 mock）、NPC Agent、`/api/chat/message` 全链路；黄金测试集（`docs/testing.md` 12 类）。
3. **真实内容替换**：演示数据经人工审核后按 `data/templates/cultural_knowledge.template.yaml` 入库；点位坐标精确核实（当前为 GCJ-02 近似值，界面已标注【待核实】）。
4. **后台写操作与认证**：管理端 JWT、知识审核流转、检索测试。
5. **参赛材料**：技术报告（按附件 2 大纲）、3-5 分钟演示视频、答辩 PPT、佐证材料（**10 月 15 日 20:00 截止**）。

### 已知问题（非阻塞）

- 腾讯地图免密钥模式下，控制台有非瓦片服务的鉴权报错（功能无影响；配自有密钥可消除）。
- `router/index.tsx` 有 1 条 react-refresh 警告（组件与路由同文件导出），仅开发体验提示。
- 点位坐标为近似值，正式版需在后台点位管理中精确维护。
- 性能阈值（并发、P95）【待补充】，待后端接入后用 Locust/k6 测定。
- 本机开发注意：沙箱的 safe-delete 曾把 npm 安装中的文件重命名为 `*.DELETE.*` 导致依赖树损坏；若遇到诡异 MODULE_NOT_FOUND，删除 `node_modules` 重装。托管 Node 22 的 npm 在本机不稳定，已统一用系统 Node 24。

## 8. 代码规范与贡献指南

### 8.1 不可违反的红线（PR 模板内置自查）

1. **匿名**：代码、注释、文档、截图、视频中不得出现学校名称、LOGO、指导教师信息。
2. **密钥**：仓库只提交 `.env.example`；真实 API Key/密钥永不入库（`.env` 已被 gitignore）。
3. **状态红线**：前端组件和 LLM 无权直接修改任务/道具/图鉴/结局；一切状态变化经引擎（未来为后端状态机）。
4. **真实性**：无来源数据统一标【待补充】；文化内容必须带四级标注；不得伪造史实或应用成效；证据不足时 NPC 拒答。

### 8.2 代码风格

- TypeScript strict；路径别名 `@/` → `src/`；ESLint + Prettier（`npm run lint` / `npm run format`），提交前必须通过。
- 组件：函数组件 + Hooks；样式一律 Tailwind + `cn()` 拼接，设计令牌（OKLCH）见 `index.css` 与 `tailwind.config.js`，**不要硬编码色值**。
- 可访问性：状态不只依赖颜色（图标+文字+形状）；交互元素可键盘操作；触控区域 ≥44px；动效提供 `prefers-reduced-motion` 降级。
- 文案：无营销 buzzword；按钮用"动词+对象"；不堆砌破折号。

### 8.3 内容扩展指引（加点位/任务/NPC 时）

- 新点位：改 `data/theme.ts`（坐标用 GCJ-02）+ `data/tasks.ts` + `data/codex.ts` + `data/knowledge.ts`，图鉴条目必须带 `type` 与 `source`。
- 新 NPC 话术：改 `data/chatScripts.ts` 规则表，响应字段对齐 AI 契约；越界默认走 `REFUSAL_TEXT`，**不要**为讨好用户放开拒答。
- 新任务类型：扩展 `types.TaskType` → `data/tasks.ts` → `engine.verifyTask` 校验分支 → `TaskPage` 渲染分支 → 补测试。

### 8.4 提交与分支

- Commit 使用 Conventional Commits：`feat(scope): ...` / `fix:` / `chore:` / `docs:` / `test:`。
- 主分支 `main`；功能开发用 `feat/<topic>` 短分支，PR 过 CI（frontend: lint+test+build；backend: ruff+pytest）与红线自查清单后合入。
- 提交前本地三连：`npm run lint && npm run test && npm run build`。

---

有问题先查 `docs/` 八份设计文档与 `PRODUCT.md`；状态机与 API 契约是两份最重要的"宪法"。
