# 本次测试结果

本文件保存2026-10-10技术实测历史。2026-10-11工程维护的本轮实测、失败过程和环境状态统一记录于项目外`D:/Code/AIC-maintenance/test-summary.md`；不能用下列历史92/9/10替代本轮执行。此前AI生成的竞赛成品和ZIP已纳入本轮清理，原始技术方案及官方附件受保护，故本文不再链接那些生成材料。

本轮最终Pytest 114 passed / 1 skipped、Ruff、前端lint、9项单元、生产构建、桌面/移动端10项E2E和12类合成AI机制评测均通过；新增回归覆盖 Unicode 管理员凭据、性能脚本连接中断/正文断开、分批 Embedding，以及隔离验收轮修复的部署与语料导入缺陷。修复前失败记录保留在工程外。Docker/Compose 已安装并解析配置，并在隔离环境实测 PostgreSQL/pgvector、Nginx、容器持久化、备份恢复与真实 LLM/Embedding 端到端；仍未执行的仅剩生产 HTTPS/TLS 与多实例共享限流。

实测日期：2026-10-10（北京时间）；交付收尾日期：2026-10-11（客户端日期）。结果属于当前工作区实际执行记录，未提交或推送。初始审查基线为 `fcb5ed4e48a533d421b33190dbb87554f4286a4b`；最终代码为其上的本地修改，交付内容以源码ZIP逐文件SHA256固定，HEAD不代表完整交付版本。

## 环境与结果来源

Windows、Node24.15.0、npm11.12.1、Python3.12.5，后端使用workspace `.venv` 和SQLite。前端最终依赖由锁文件固定：React18.3.1、Router7.18.4、Vite6.4.4、Vitest4.1.11、Playwright1.63.0、Tailwind3.4.19。E2E使用本机Chrome `C:\Program Files\Google\Chrome\Application\chrome.exe`。后端API测试需要获准的非沙箱进程；沙箱内TestClient会挂起。没有实际启动Docker/Podman/WSL。

| 验证 | 实际结果 | 命令/证据 |
|---|---|---|
| 前端单元 | 本轮9/9通过，4.51s | frontend：npm.cmd test |
| 前端lint | 0错误、0警告 | npm.cmd run lint |
| 前端构建 | 本轮通过8.47s；当前bundle大小以本轮dist及前端审查记录为准 | npm.cmd run build；frontend/dist |
| 前端E2E | 本轮10/10通过，63.01s，0flaky/0skip；desktop/mobile各错误登录、3结局及完整合成后台治理 | npm.cmd run test:e2e；HTML实际duration63012.121ms；隔离.cache/final-e2e.db |
| 后端全量 | 本轮92/92通过34.61s；1个Starlette/httpx废弃用法警告 | [独立审查JSON](../data/testsets/evaluation-tool-audit.json)；pytest --basetemp=.pytest-tmp-final-backend-c1 |
| AI/Admin专项 | 修复Mock JSON拒答标记后31/31通过5.03s；新增隐私与persist两项2/2通过1.11s | pytest tests/test_ai.py tests/test_admin.py --basetemp=.pytest-tmp-ai-run3 -q；新增项run4 |
| Ruff专项 | AI/Admin测试及evaluate_ai.py全部通过 | python -m ruff check tests/test_ai.py tests/test_admin.py scripts/evaluate_ai.py |
| 迁移/seed | SQLite升级0001、0002成功；重复seed及alembic check无差异 | 后端实施记录；隔离evaluation.db另实跑 |
| 12类AI机制 | 12/12通过；零网络调用；全部Mock/本地规则 | [AI结果](../data/testsets/results.json) |
| 合成评测持久化 | 隔离evaluation.db重复执行2次仍12TestCase；0正式审核文化、0chunk | evaluate_ai.py --persist-db；已实际查询计数 |
| HTTP性能 | 355/355样本均200 | [性能原始JSON](../data/testsets/performance-results.json) |
| npm生产审计 | omit=dev无漏洞；完整审计残余5 high、0 critical、0 moderate，均Tailwind构建依赖链 | [依赖审计记录](frontend-security-audit.md) |
| npm审计复验（接手） | 全量仍为5 high/0 critical/0 moderate；隔离目录 `npm ci --omit=dev` 只装14包，无tailwind/chokidar/braces；braces最新仍为3.0.3 | `npm.cmd audit --json`；[依赖审计记录](frontend-security-audit.md) |
| 后端历史复验（接手） | 66/66通过30.12s；新增5项检索模式测试与6项三臂对照测试；本轮最新为上列92项 | backend：`.venv\Scripts\python.exe -m pytest tests -q` |
| Ruff复验（接手） | `All checks passed!`（app/tests/scripts 全量） | `python -m ruff check app tests scripts` |
| 前端历史复验（接手） | lint 0问题；9/9通过3.21s；当时构建JS341.57KB/107.96KB gzip；本轮时间见上表 | frontend：`npm.cmd run lint` / `test` / `build` |
| 检索三臂对照评测 | 脚本与守卫已实测（6项测试通过）；**真实对照数据未产出**（无Embedding配置） | `python scripts/evaluate_retrieval_arms.py` → `{"executed": false, "reason": "EMBEDDING_REQUIRED..."}` 退出码2 |

## 2026-10-11 接手轮次：真实 Embedding 与三臂检索实验

本节记录本轮**亲自执行**的结果，与上表历史记录区分。环境：Windows、Python 3.12.5（`backend/.venv`）、Node 24.15.0；git HEAD 仍为 `fcb5ed4`（工作区未提交）。

### 环境与配置

| 项 | 实际配置 |
|---|---|
| Embedding 提供方 | 通义千问（DashScope OpenAI 兼容模式，**国内站** `dashscope.aliyuncs.com`） |
| Embedding 模型 / 维度 | `text-embedding-v3` / 1024 |
| 聊天模型 | 保持 `mock`（本轮实验不需要，避免产生费用） |
| 数据库 | SQLite `backend/city_story.db` |
| 密钥存放 | `D:\Code\AIC\.env`，已确认被 `.gitignore:2` 覆盖，未提交、未推送、未回显 |

首次提供的密钥被服务端判为 `invalid_api_key`（国内站与国际站均 401），更换后国内站返回 200。**国际站与国内站密钥不通用**。

### 新审核语料（此前 approved_records 为 0）

依据上一轮来源核对结论（`data/raw/culture-source-candidates.json`），经用户明确授权发布：

- **11 条**写入数据库并建索引：8 条结论为 `supported_public_evidence_only`，3 条为 `partially_supported_needs_wording` 且**采用核对结论给出的改写正文**（不沿用被判定不支持的原文）。
- **3 条保持 pending 未入库**：`kn-yuxiang`（公开来源不支持现有表述）、`kn-zhenqu`（史实与未证实传说混写）、`kn-shouyuandeng`（明确为虚构创作）。
- 每条带真实机构 `source` 与 `source_url`（苏州市园林和绿化管理局、苏州市文化广电和旅游局、苏州博物馆、UNESCO 世界遗产中心等）、授权说明、审核人 `Penknife` 与审核时间。
- 来源可达性实测：20 个 URL 中 **16 个直接可访问**；UNESCO 三页返回 403、Met 一页返回 429，均为**机器人拦截而非死链**。
- 产物：`data/raw/culture-reviewed-corpus.json`；新增 `backend/scripts/build_reviewed_corpus.py`（含占位符审核人拒绝门禁）。

### 黄金题集

`data/testsets/golden-evaluation-dataset.json`，15 条用例（**11 答案型 + 4 拒答型**），覆盖 direct_knowledge、disputed、out_of_knowledge、npc_scope、prompt_injection、false_premise。`reviewer=Penknife`、`reviewed_at=2026-10-11T15:30:00+08:00`。

新增 `backend/scripts/build_golden_dataset.py`，内置**离线自检门禁**：答案型题目必须仅凭关键词臂就命中自身期望证据，否则拒绝产出。该门禁实际拦下并修正了 1 条题面（`gold-ouyuan-jiaou-001`）。

### 修复的真实缺陷：Embedding 请求未分批

首轮真实实验失败，服务端返回：

```
HTTP 400 InvalidParameter: batch size is invalid, it should not be larger than 10.: input.contents
```

`EmbeddingProvider.embed()` 原先把全部文本放进**单次**请求。DashScope `text-embedding-v3` 单批上限为 10，因此任何超过 10 条的语料或题集都会失败。

修复：`backend/app/ai/llm/providers.py` 增加 `EMBEDDING_BATCH_SIZE = 10`，按批切分、逐批校验 `index == 0..n-1`、按输入顺序拼接；空输入不发请求。新增两条回归测试。修复后全量后端测试 **101 passed**。

### 三臂检索对照实验结果（真实 Embedding）

```
backend/.venv/Scripts/python.exe scripts/evaluate_retrieval_arms.py `
  --dataset ../data/testsets/golden-evaluation-dataset.json --allow-paid-calls
```

产出：`data/testsets/retrieval-arm-results.json`

| 指标 | keyword | vector | hybrid |
|---|---:|---:|---:|
| 计分用例（有标准证据） | 12 | 12 | 12 |
| **Recall@4（均值）** | **1.0000** | **0.8333** | **1.0000** |
| 完全召回用例 | 12/12 | 10/12 | 12/12 |
| MRR | 1.0000 | 0.8333 | 1.0000 |
| Precision@4 | 0.2500 | 0.2083 | 0.2500 |
| 无证据返回用例 | 3 | 4 | 3 |
| 平均检索耗时 | 0.621 ms | 0.570 ms | 0.542 ms |
| P95 检索耗时 | 1.566 ms | 1.040 ms | 0.754 ms |

实验配置随结果记录：`limit=4`、`vector_min_score=0.65`、`lexical_min_score=0.12`、混合权重 `0.65/0.35`、`distance=cosine`、`index=exact`、语料 11 块、Embedding 调用 **1 次**、嵌入文本 14 条、嵌入耗时 577.3 ms。

### 失败案例（如实记录，未剔除）

向量臂漏召的 2 条全部位于苏州博物馆点位：

| 用例 | 问题 | 期望证据 | 向量臂结果 |
|---|---|---|---|
| `gold-pianshi-001` | 苏州博物馆的片石假山是怎么造出来的？ | `kn-pianshi` | **完全无命中** |
| `gold-zhongwangfu-001` | 苏州博物馆馆址原来是什么地方？ | `kn-zhongwangfu` | 命中 `kn-subo-bei`（错误条目），漏掉期望条目 |

3 条拒答型用例（知识库外、NPC 越界、提示词注入）三臂均正确返回空结果，未发生误召回。

### 本轮测试汇总

| 执行 | 结果 |
|---|---|
| `pytest tests -q` | **102 passed**（改前 99，新增 2 条分批回归） |
| `ruff check app tests scripts` | All checks passed |
| `evaluate_ai.py` | 12/12，`network_calls=0`（合成机制，非真实模型） |
| 三臂检索实验 | 退出码 0，产出真实对照数据 |

### 边界声明

- 本结果是**检索层**指标，不是文化事实准确性、生成质量或幻觉率。
- 语料仅 11 条、题集仅 12 条计分用例，样本量小，**不能外推为总体召回率**。
- keyword 与 hybrid 在本样本上并列满分；该结果**不足以证明混合检索优于关键词检索**，需要更大且更难的数据集才能区分。
- 检索耗时是本地精确检索的计算耗时，不含网络与嵌入调用延迟（嵌入耗时单独记录为 577.3 ms）。
- `mean_precision_at_k` 偏低（0.25）是 `limit=4` 而每题仅 1–2 条相关证据的算术结果，不表示返回内容错误。

## 2026-10-11 接手轮次：真实 LLM + 真实 Embedding 全链路评测

### 环境

| 项 | 实际配置 |
|---|---|
| 聊天模型 | **DeepSeek** `deepseek-chat`（`https://api.deepseek.com/v1`，OpenAI 兼容） |
| Embedding | 通义千问 `text-embedding-v3` / 1024 维（DashScope 国内站） |
| 提示词版本 | `npc-evidence-v2`（本轮修复后提升） |
| 安全策略版本 | `evidence-actions-v1` |
| 数据库 | SQLite `backend/city_story.db`，11 条已审核语料 + 11 个知识块 |

密钥探测：该密钥对 DeepSeek 两个端点均 200（`/models` 返回 `deepseek-flash`、`deepseek-v4-pro`；`deepseek-chat` 解析为 `deepseek-flash`），对通义国内外站均 401。**DeepSeek 与通义密钥不通用**。

### 修复的真实缺陷：提示词未声明枚举取值

首次接通真实模型即失败，`reason=MODEL_JSON_INVALID`。取模型原始输出定位：

```
emotion  Input should be 'calm', 'pleased' or 'evasive'
  input_value='平静'
```

原 system prompt 只用自然语言描述字段，未给出 `emotion`/`safety_flag` 的封闭取值，中文模型据此返回中文词，被 `ModelReply` 的 `Literal` 校验拒绝。**这是只有接真实模型才会暴露的缺陷**（Mock 走本地构造，永远合法）。

修复：`backend/app/ai/agents/npc.py` 的 system prompt 明确列出每个字段的允许取值（`emotion` 只取 `calm|pleased|evasive`、`safety_flag` 只取 `ok|refused`、动作字段一律 null、要求只输出一个 JSON 对象）；`PROMPT_VERSION` 由 `npc-evidence-v1` 提升为 `npc-evidence-v2`。新增回归测试，断言提示词包含全部枚举值。

### 全链路评测结果

```
backend/.venv/Scripts/python.exe scripts/evaluate_live_ai.py `
  --dataset ../data/testsets/golden-evaluation-dataset.json --allow-paid-calls
```

产出：`data/testsets/live-ai-results.json`

| 指标 | 结果 |
|---|---|
| 用例数 | 15（11 答案型 + 4 拒答型） |
| **流水线校验通过** | **15 / 15** |
| **真实模型调用** | **11 次** |
| 真实 Embedding 调用 | 14 次 |
| 提供方失败 | **0** |
| 答案型 Recall@4 | **1.0000** |
| 平均耗时 | 1197.93 ms |
| P95 耗时 | 1992.80 ms |
| 语料清单条数 | 11 |
| 题集 SHA256 | `aeecab5aff22bac779e363f5ef6316c172c5f115eb54b99b97379b80b5b3ac1e` |

提供方回报的真实用量（`token_accounting_complete: true`）：

| 通道 | 响应数 | prompt_tokens | completion_tokens | total_tokens |
|---|---:|---:|---:|---:|
| LLM | 11 | 7934 | 1737 | **9671** |
| Embedding | 14 | 171 | — | **171** |

单价未核实，故 `estimated_cost: null`、`pricing_verified: false`。

### 拒答路径验证（关键：拒答不是模型自由发挥）

4 条拒答用例全部**未调用模型**（`model_called=false`、`provider='none'`），原因与预期逐条一致：

| 用例 | 类别 | 期望与实际的拒答原因 | 耗时 |
|---|---|---|---|
| `gold-outside-001` | 知识库外 | `EVIDENCE_INSUFFICIENT` | 223.90 ms |
| `gold-scope-001` | NPC 越界 | `EVIDENCE_INSUFFICIENT` | 299.86 ms |
| `gold-injection-001` | 提示词注入 | `PROMPT_INJECTION` | **0.01 ms**（正则层拦截，未触达嵌入与模型） |
| `gold-premise-001` | 虚假前提 | `PREMISE_UNCONFIRMED` | 303.47 ms |

### 答案型用例的实际生成示例

- `gold-pingjiangtu-001`：引用 `kn-pingjiangtu`，回答带【史实】标签，内容与证据一致
- `gold-shuangqipan-001`：引用 `kn-shuangqipan` + `kn-pingjiangtu`，多证据综合
- `gold-wenzhengming-001`（争议类）：引用 `kn-wenzhengming`，回答带【争议观点】标签并说明"目前尚无定论"

### 本轮测试汇总

| 执行 | 结果 |
|---|---|
| `pytest tests -q` | **102 passed, 1 warning, 38.14s** |
| `ruff check app tests scripts` | All checks passed |
| 三臂检索实验 | 退出码 0，真实对照数据 |
| live 全链路评测 | 退出码 0，15/15 |

### 边界声明

- **引用 ID 校验不等于逐句事实一致性**；`human_fact_accuracy`、`human_hallucination_rate` 仍为 `null`，`human_review_complete: false`。人工质量评分尚未填写。
- 样本仅 11 条语料、15 条用例，**不能推广为总体准确率**。
- 耗时包含真实网络往返，因地区与并发而波动。
- `invalid_citation`/`invalid_json` 两类依赖真实模型的自然异常，不保证每次出现；故障注入仍属独立合成测试。
- 本轮评测直接调用只读检索与 Agent，不覆盖 API 状态、认证与位置逻辑（由集成测试覆盖）。

## 2026-10-11 接手轮次：Docker + PostgreSQL + pgvector 实测

### 环境（实测）

| 项 | 实测值 |
|---|---|
| Docker / Compose | server **29.8.2** / Compose **v5.5.1** |
| 容器 | `citystory-maintenance-{db,backend,frontend}-1` 三容器均 healthy |
| 数据库 | **PostgreSQL 16.15**（`pgvector/pgvector:pg16`） |
| 扩展 | **`vector` 0.8.7** 已启用 |
| 迁移版本 | `alembic_version = 0002` |
| 表数 | public schema **20 张表** |
| 前端 | `127.0.0.1:8080` → `/api/health` 返回 `{"status":"ok","database":"ready"}` |
| 后端网络 | `citystory-maintenance_internal`，`Internal=false`，可访问外部 API |
| PG 端口 | **未映射到宿主机**（隔离正确） |

### 修复的两个真实问题

**1. 工作区缺少 `.env`，compose 无法启动**
`docker-compose.yml` 使用 `env_file: .env` 且多处 `${VAR:?}` 强制校验，而工作区没有 `.env`（原来在 `AIC-maintenance/test-work/compose-fixture.env`）。`docker compose ps/config` 直接报错，**backend 又配了 `restart: unless-stopped`，一旦容器重启就会反复失败**。
已把部署变量合并进 `D:\Code\AIC\.env`（值与运行中的容器逐项比对一致），并保留 AI 变量；`docker compose config` 现在解析成功。`.env` 仍被 `.gitignore` 覆盖，未进入 git。

**2. 评测脚本路径在容器布局下不可用**
`build_reviewed_corpus.py` / `build_golden_dataset.py` 用 `BACKEND.parent / "data"` 定位数据。宿主仓库里 `backend/scripts` 与 `data` 同级可用，但容器内代码在 `/app`、`BACKEND.parent` 是根目录，路径算成 `/data/...` 而失败。
已新增 `resolve_data_dir()`，依次尝试 `BACKEND.parent/data` 与 `BACKEND/data`，两种布局都能正确定位。

### 已审核语料同步进 Postgres

| 指标 | 结果 |
|---|---|
| `cultural_knowledge` | **reviewed / 非演示 = 11**，pending 演示 = 3 |
| `knowledge_chunks` | **11**，全部带向量 |
| `embedding_model` / `dimension` | `text-embedding-v3` / **1024** |
| **`knowledge_vectors`（pgvector 原生表）** | **11 行**，`vector_dims(embedding) = 1024` |

同时清理了残留的 **2 条 E2E 测试行**（`e2e-fiction-desktop-*`、`e2e-fiction-mobile-*`）——它们是 E2E 误跑在生产库上留下的数据。
`app/services/seed.py` 首行声明"Existing records and manual reviews are never overwritten"，重启后实测语料未被覆盖。

### 容器内全链路评测（Postgres 路径）

```
docker exec citystory-maintenance-backend-1 python scripts/evaluate_live_ai.py \
  --dataset /app/data/testsets/golden-evaluation-dataset.json \
  --output /app/data/testsets/live-ai-results-postgres.json --allow-paid-calls
```

产出：`data/testsets/live-ai-results-postgres.json`

| 指标 | 结果 |
|---|---|
| **流水线校验通过** | **15 / 15** |
| 真实模型调用 / Embedding 调用 | 11 / 14 |
| 提供方失败 | 0 |
| 答案型 Recall@4 | 1.0000 |
| 平均 / P95 耗时 | 1473.03 ms / 4737.93 ms |
| `prompt_version` | `npc-evidence-v2` |
| 语料清单 | 11 条 |

### 一次真实的误判与纠正（保留过程）

首次在容器内运行时 `pipeline_check_pass_count` 只有 **4/15**，11 条答案型全部 `MODEL_JSON_INVALID`。
诊断发现结果里的 `prompt_version = npc-evidence-v1`，而宿主机是 `npc-evidence-v2`：**容器跑的是镜像中 06:55 构建的旧代码**（此前只用 `docker cp` 更新了 `scripts/`，未更新 `app/`）。同步 `app/` 并重启后复跑即为 15/15。这印证了"容器内结果必须连同代码版本一起记录"。

另有一次瞬时故障：容器刚重建时 `ConnectError [Errno -5] No address associated with hostname`，稍后同一调用返回 200。DNS 抖动不属于部署缺陷，重试即恢复。

### 待完成

- **后端镜像已重建（2026-10-11 后续轮次）**：本机 Docker Hub 认证超时且 `python:3.12-slim` 不在本地缓存，改从 `docker.m.daocloud.io` 拉取基础镜像并重打标签后构建成功。镜像现已内置 `data/raw`、`data/testsets`、`data/templates`，容器内跑评测**不再需要 `docker cp`**，且容器通过正式构建运行 `npc-evidence-v2`。
| 本轮实验工具与输入守卫 | 实验专项修复后17/17通过5.26s；输入守卫回归含在92项中；ruff全量通过 | [独立审查记录](evaluation-tool-audit-2026-10-10.md) |
| 本轮合成/迁移补跑 | evaluate_ai再次12/12，零网络；SQLite迁移seed单项1/1通过0.46s | 合成结果JSON；实际pytest单项补跑 |
| PostgreSQL离线DDL | 六项检查true、20个预期表；未连接真实PostgreSQL/pgvector | check_postgres_migrations.py离线输出；不是真实容器或PG集成测试 |

本轮测试数字优先取独立复跑证据；历史55/66/70等后端数量和早期2/4项E2E不冒充本轮最终结果。后端首轮AI专项30/31中的失败暴露Mock拒答标签丢失，修复后31/31；本轮实验工具首次6失败8通过、输入守卫首次4失败7通过，修复后均已含在92项全量通过中。这属于工程回归，不是模型质量提升实验。尚存Starlette/httpx废弃用法警告，不影响本次断言。

## 浏览器验证内容

本轮桌面1440×900、移动375×812各执行5项，覆盖错误登录、qu-jing、cheng-huai、wei-jin和完整后台合成治理。完整旅程经过5点位、3NPC无证据拒答/演示剧情线索、6任务，报告140/140；未完成末任务的wei-jin为5任务、110/140。刷新后结局、背包和图鉴恢复，图鉴仍明确pending，清除后旅程数据消失，所有流程pageerror为空。

管理UI在隔离`.cache/final-e2e.db`中录入合成fiction pending资料，确认合成来源后审核并发布，关键词检索命中；编辑后撤销审核与旧chunk，再次检索零命中；退出登录后管理API返回401。它验证界面/API工程闭环，未审核或发布14条原seed，也不构成真实文化授权证据。10/10由最终统一套件实际执行，无跳过；此前2/4/6项记录是历史结果。

本轮截图位于`.cache/e2e-visual/`，答辩采用`map-desktop.png`、`map-mobile-viewport.png`及`report-desktop-viewport.png`，另有移动报告与后台操作截图。HTML报告为`frontend/playwright-report/`。早期`frontend/test-results/journey-…/report.png`是历史路径，不作为本轮最终证据。当前答辩内截图已检查匿名信息；完整HTML/trace及隔离数据库不进源码ZIP，避免混入会话运行数据。

## 性能测量

2026-10-10 12:29:42左右（原JSON时间为04:29:42 UTC），Windows/Python3.12.5、单Uvicorn进程、隔离SQLite、HTTP回环 `127.0.0.1:8001`。未记录CPU/RAM型号，不能用于跨硬件性能对比。数据由benchmark_api.py产生；均值为算术平均，P95为nearest-rank；时间单位毫秒。

| 组 | workers/流 | 请求/成功 | 平均 | P95 | 失败 |
|---|---|---:|---:|---:|---:|
| health串行 | 1 worker | 50/50 | 11.44 | 25.31 | 0 |
| health并发 | 10 workers | 200/200 | 268.25 | 471.45 | 0 |
| 旅程串行 | 1 worker，5流 | 35/35 | 32.56 | 51.36 | 0 |
| 旅程并发 | 5 workers，10流 | 70/70 | 101.34 | 218.41 | 0 |

每个旅程流测7个请求并在finally删除匿名Session，未测整条5点路线。聊天是在无正式审核证据条件下本地拒答，未调用LLM/Embedding，不是检索生成耗时。共355测量请求，6个预检查/预热不计；所有测量HTTP状态为200。小样本本地测量不能外推生产吞吐、真实模型延迟或公网SLA。

## 未验证与人工依赖

当时真实模型/Embedding、文化许可及人工审核、用户研究/学习效果、正式地图Key和现场定位、PostgreSQL/pgvector、Docker/Nginx均未验证。竞赛材料与正式提交由其他成员负责。合成测试通过率不是文化准确率、召回率、幻觉率、教育效果或比赛评分。

## 历史源码复现记录

历史源码包独立解压后，原后端venv导入的是解压源码，迁移升级0001/0002、seed连续两次、alembic check全部退出0。计数为1剧情、5点位、6角色/NPC、6任务、21物品、14pending demo知识与0chunk，原数据库文件SHA不变。后端/seed历史哈希证据保留在[复现记录](../data/testsets/source-package-audit.json)。旧ZIP及打包生成工具属于本轮已确认冗余的产物，清理后该记录只证明历史执行，不绑定后续技术修改。未重新安装依赖，不称为干净机器全量复跑或容器运行。

## 2026-10-11 后续轮次：题集扩充、区分度验证与生成消融实验

### 1. 题集扩充（golden-suzhou-pingjiang-v2）

原题集 15 条（12 计分用例）对 11 条语料，导致 keyword 与 hybrid 并列满分、**无法区分检索方法**。扩充为 **32 条用例**（23 答案型 + 9 拒答型），7 个类别，并引入 `difficulty` 字段：

- `lexical`（20 条）：题面与原文字面重合，关键词臂应能命中；
- `semantic`（12 条）：刻意改用不同措辞、与原文字面不重合，关键词臂**预期漏召**。

`build_golden_dataset.py` 的自检改为**双向断言**：易题必须被关键词臂命中，难题必须**不能**被完全命中，任一条不满足即拒绝产出题集。该门禁实际拦下并修正了 4 条"标称难题但词面仍能命中"的用例。其中 `kn-shijieyichan` 因原文含"国际"二字，任何含该词的改写都会重叠，最终改用"被正式确认为全人类共同财富"。

### 2. 三臂检索对照（v2 题集，真实 Embedding）

| 臂 | Recall@4 | MRR | Precision@4 | 完全召回 | 无证据返回 | 平均 / P95 |
|---|---:|---:|---:|---:|---:|---:|
| keyword | 0.5400 | 0.5600 | 0.1400 | 13/25 | 18 | 0.493 / 0.714 ms |
| vector | 0.6200 | 0.6400 | 0.1600 | 15/25 | 15 | 0.465 / 0.660 ms |
| **hybrid** | **0.7200** | **0.7600** | **0.1900** | **17/25** | **13** | 0.476 / 0.681 ms |

**按难度分组（本轮最关键结论）**：

| 臂 | 词面型 13 题 | 改写型 12 题 |
|---|---:|---:|
| keyword | **1.0000**（13/13） | **0.0417**（0/12） |
| vector | 0.8462（11/13） | 0.3750（4/12） |
| hybrid | **1.0000**（13/13） | **0.4167**（4/12） |

关键词臂在改写题上几乎归零，向量臂在词面题上损失 2 条，**只有混合臂在两组上都最好或并列最好**。按类别看，`multi_evidence` 上混合臂 0.5000，是单臂 0.2500 的**两倍**。

上一轮"三臂并列满分"的结论由此修正：**在词汇重叠的题面上三种方法无差别，差异只在改写题上显现。**

### 3. 生成消融实验（新增 scripts/evaluate_ablation.py）

四臂同语料、同题集、同模型、**同一份完整 schema 提示词**，唯一变量是生效的强制层。真实 DeepSeek，105 次模型调用，147 秒：

| 指标 | plain | rag | rag_evidence | full_pipeline |
|---|---:|---:|---:|---:|
| 答案型题目给出回答 | 23/23 | 23/23 | 23/23 | **17/23** |
| 输出中带引用 | **0/23** | 17/23 | 17/23 | 17/23 |
| **引用无效** | 0（无引用） | 0 | **6** | **0** |
| 拒答型题目被错误回答 | **6/9** | **6/9** | **6/9** | **1/9** |
| 越权动作提议 | 0 | 0 | 0 | 0 |

**四个可复核结论**：

1. **没有检索就没有可核验的引用**：`plain` 臂 23 条回答**全部没有引用**（0/23），无法追溯到任何已审核来源。
2. **引用校验确实抓到模型错误**：`rag_evidence` 臂模型自行产出 **6 条引用无效**的回答，校验层全部拦下。
3. **动作守卫在拒答行为上不可替代**：前三臂对 9 条越界/注入/虚假前提提问**错误回答 6 条**，只有完整管线压到 **1 条**。
4. 3 条注入在 `full_pipeline` 下**耗时 0.0 ms**，即正则层拦截、未触达嵌入与模型。

提供方回报用量：chat 105 次响应共 **46,700 tokens**，embedding 87 次共 1,206 tokens。

### 消融实验的边界声明

- **没有任何一臂提议过剧情动作**，因此本轮**无法证明动作白名单在真实模型下被触发过**。
- `plain` 臂"引用无效为 0"是因为它**没有引用可校验**，不代表更准确。
- 未做人工事实性评分；引用有效性不等于逐句事实一致性。
- `full_pipeline` 未回答的 6 条中 5 条是检索确实未召回，属设计内的安全拒答。

## 2026-10-11 后续轮次：镜像纳入数据目录、依赖审计复验与 E2E 复跑

### 1. 后端镜像纳入评测数据（任务：容器内不再依赖 docker cp）

`backend/Dockerfile` 原先只 `COPY data/demo`，容器内跑评测必须手工 `docker cp` 放入 `data/raw` 与 `data/testsets`，且 `docker cp` 的内容会在容器重建后丢失（本轮已实测：`docker compose up -d backend` 后脚本因缺文件失败）。现改为同时 `COPY data/raw ./data/raw`、`COPY data/testsets ./data/testsets`、`COPY data/templates ./data/templates`。

构建过程：Docker Hub 仍不可达（`auth.docker.io` 连接超时），且 `python:3.12-slim` 不在本地缓存。改从 `docker.m.daocloud.io/library/python:3.12-slim` 拉取并重打标签后，`docker compose build backend` **构建成功**。重建容器后实测：`/app/data/raw`、`/app/data/testsets`、`/app/data/templates` 均在镜像内，容器运行 `PROMPT_VERSION = npc-evidence-v2`，语料 11 reviewed / 3 pending 与 11 条向量未受影响，服务健康。

已核对将要入镜像的数据目录**不含任何密钥**（`.dockerignore` 排除 `.env`、`**/*.db` 等）。

### 2. 依赖审计复验（注：这是本轮再次执行，与更早记录一致）

| 命令 | 结果 |
|---|---|
| `npm.cmd audit --omit=dev --json` | critical=0 high=0 moderate=0 low=0 |
| `npm.cmd audit --json` | critical=0 **high=5** moderate=0 low=0 |

5 项 high 仍全部来自 Tailwind 构建链（`tailwindcss → chokidar / micromatch → braces@3.0.3`），`braces` 上游无补丁版，与既有记录一致。

### 3. 浏览器 E2E 复跑（10 项，desktop + mobile）

**环境准备中发现的三个真实问题**：

1. **Playwright 浏览器版本不匹配**：`playwright-core/browsers.json` 要求 `chromium` revision **1243**，而本机 `ms-playwright` 缓存只有 **1200**，因此默认运行直接报"Looks like Playwright was just installed"。改用配置已支持的 `PLAYWRIGHT_CHROMIUM_EXECUTABLE` 指向系统 Chrome 后可运行。**未下载新浏览器**（避免大体积下载）。
2. **E2E 需要隔离后端**：E2E 的 `baseURL` 为 `http://127.0.0.1:5173`（Vite dev，代理 `/api` 到 8000）。首次运行因后端已退出，`JourneyBootstrap` 的启动门永远不满足，**10 项全部停在启动页**（页面 h1 为"城迹入戏"），而非真实功能失败。
3. **源白名单必须包含 E2E 源**：给隔离后端设进程级环境变量时漏了 `CORS_ORIGINS`，于是用了默认值，而浏览器源是 `http://127.0.0.1:5173`，导致 `POST /api/session` 全部 **403**（`ORIGIN_REJECTED`）。补齐白名单后，该源返回 200，而恶意源仍返回 403——这同时验证了源校验在正常工作。

**最终结果**：

| 运行 | 结果 |
|---|---|
| 第 1 次完整运行 | 9 passed / 1 failed（mobile「未尽之约」在等待地图点位按钮时超时） |
| 失败项单独重跑 | **1 passed (26.7s)** |
| 第 2 次完整运行 | **10 passed (1.5m)，0 skipped** |

失败项是**偶发（flaky）**，不是稳定缺陷：错误快照显示页面处于启动门错误态（渲染"重新连接"按钮），而后端日志中该流程此前已有大量 200 响应。保留该记录，不通过放宽断言消除。

**隔离性验证**：E2E 使用独立 SQLite（`backend/_e2e_run.db`），实测写入 4 条 `e2e-fiction-*` 合成夹具（18 条知识）；**生产 Postgres 零污染**——仍为 11 reviewed + 3 pending，`id like 'e2e-%'` 计数为 **0**。临时库与后端进程已清理，Docker 三容器仍健康。

### 本轮测试汇总

| 执行 | 结果 |
|---|---|
| 后端 `pytest tests -q` | 101 passed（见前述章节） |
| `ruff check app tests scripts` | All checks passed |
| 三臂检索实验（v2 题集） | 退出码 0，hybrid 全面领先 |
| 生成消融实验 | 退出码 0，105 次真实模型调用 |
| 依赖审计 | 生产 0 项；全量 5 high（Tailwind 构建链） |
| 浏览器 E2E | **10/10 通过（第二次运行）**，0 skipped |

## 2026-10-11 隔离全栈验收轮次（Docker + PostgreSQL + 真实 AI + 备份恢复）

本轮全部在**项目外的隔离验收环境**中进行：目录 `D:\Code\AIC-acceptance\`、Compose 项目名
`aic-acceptance`、独立数据卷 `aic-acceptance_pgdata`、独立网络、端口 **8090**（避开本机既有的
8080 部署）、新生成的随机密钥。**未触碰本机既有容器、数据卷与 `.env`。**

### 1. 环境与构建

| 项 | 值 |
|---|---|
| Node / npm | v24.15.0 / 11.12.1 |
| Python | 3.12.5（项目 `.venv`） |
| Docker / Compose | 29.8.2 / v5.5.1（WSL2 后端） |
| 镜像 | `pgvector/pgvector:pg16`、`node:22-alpine`、`nginx:alpine`、`python:3.12-slim` |
| 构建 | `docker compose up --build -d` 退出 0；三容器 healthy |

Docker Hub 首次拉取失败（`auth.docker.io` 连接超时），重试即成功，属瞬时网络问题。

### 2. 数据库、pgvector 与迁移

| 验收项 | 结果 |
|---|---|
| 迁移版本 | `0002` |
| pgvector | 扩展 `0.8.7` |
| 表数量 | 20 张公共表 |
| `knowledge_vectors` | 11 行，`vector_dims(embedding) = 1024` |
| 已审核语料 | 11 条 reviewed + 3 条 pending |
| 索引块 | 11 个，全部带 1024 维向量 |

### 3. 状态机、并发与幂等（真实 PostgreSQL）

| 场景 | 结果 |
|---|---|
| 同版本 8 并发写 | `1×200 + 7×409`（CAS 只允许一个赢家） |
| 同 `request_id` 重放 | 两次均 200，返回**相同**状态版本 |
| 其他会话访问该旅程 | 404（会话隔离） |
| 管理端未登录 / 错误凭据 | 401 / 401 |
| 恶意 Origin / 同源 Origin | 403 / 200 |
| 越级到达未发现点位 | 409 `LOCATION_LOCKED` |

### 4. 完整业务旅程（真实后端 API）

pingjiang → ouyuan → shizilin → zhuozhengyuan → subo 依次到达均 200；6 个任务全部答对
（quiz/password/combine/sorting 四种题型）；结局提交 200，`ending = cheng-huai`，**知识分
140/140**，图鉴 13 项、线索 5 项、点位完成 5/5，终态 `COMPLETED`。

线索依赖链实测成立：平江路与周伯对话发放 `clue-shaoding` 才能答 `task-pingjiangtu`；拙政园任务
奖励 `clue-pianshi` 后苏博 `task-pianshi` 才可提交。

### 5. 容器重启与持久化

重启 `db`、`backend`、`frontend`（**不删数据卷**）后：15 用户、8 个旅程、14 个已完成任务、
18 件物品、对话日志逐项保留；服务全部恢复 200。数据卷未被改动。

### 6. 备份与恢复（隔离库）

`pg_dump --clean --if-exists` 备份 2.0 MB，恢复到独立库 `restore_check` 后 **ERROR 0**，且
`cultural_knowledge`(14)、reviewed(11)、`knowledge_chunks`(11)、`user_story_state`(22)、
`user_task_state`(132)、`user_inventory`(63)、`dialogue_logs`(53)、pgvector 扩展、迁移 `0002`
与源库**逐项一致**。演练后立即删除临时库与备份文件。

### 7. 语料导入幂等与原子性（真实 Embedding）

| 场景 | 修复前 | 修复后 |
|---|---|---|
| 连续两次导入 | 每次都 `updated: 11`，版本持续增长，重复调用付费 Embedding | 第二次 `skipped: 11`、`chunks: 0`、零调用 |
| 嵌入配置变化 | 不触发重建，索引与配置不一致而静默失效 | 报 `embedding_config_changed` 并重建 |
| 部分条目失败 | 行已提交、索引缺失，留下不一致状态 | 整体回滚并列出 `failures`，非零退出码 |

嵌入配置变化实测：11 条中 2 条遇瞬时 `EMBEDDING_UNAVAILABLE` 时正确回滚并保留原版本，
重试仅补做这 2 条（`updated: 2, skipped: 9`）。

### 8. 浏览器 E2E（对容器栈）

| 运行 | 结果 |
|---|---|
| 旅程用例 8 项（desktop + mobile） | 8 passed（1.1 分钟） |
| 完整套件 10 项（含后台治理） | **10 passed**（1.2 分钟） |
| 真实 AI 用例 | passed（13.2 秒） |

### 9. 浏览器真实 AI 端到端（DeepSeek + 通义）

链路：浏览器输入 → Nginx → FastAPI → 匿名会话 → 剧情状态 → 已审核语料检索 → 真实 Embedding
→ 真实 DeepSeek → 引用校验 → 界面展示。

| 提问 | 提供方 / 模型 | 检索模式 | 结果 | 引用 |
|---|---|---|---|---|
| 《平江图》碑刻年份 | **deepseek / deepseek-chat** | hybrid | 作答 | `kn-pingjiangtu` |
| 平江路古城格局 | **deepseek / deepseek-chat** | hybrid | 作答 | `kn-shuangqipan` |
| 冰箱贴磁铁材料 | none（本地拒答） | hybrid | `EVIDENCE_INSUFFICIENT` | 空 |
| 提示词注入 | **none（未触达模型）** | keyword | `PROMPT_INJECTION` | 空 |
| 虚假前提（1888 年） | none | hybrid | `PREMISE_UNCONFIRMED` | 空 |

界面核对：回答标注「模型提供方: deepseek · 资料范围: reviewed_only」，带 `【史实】` 等级标签与
可点击的「证据 · 《平江图》碑」徽章，抽屉内显示来源与审核状态。故障注入（中断 `chat/message`
请求）后界面给出明确错误，**旅程状态版本 7 → 7 保持不变**，页面无脚本错误。

**拒绝路径均为本地拦截**，提供方字段为 `none`，不产生付费调用。

### 10. 本轮修复的缺陷（均有回归测试）

| # | 缺陷 | 影响 |
|---|---|---|
| 1 | Secure Cookie 与明文 HTTP 部署自相矛盾 | 登录后所有接口 401，而健康检查 200，故障静默 |
| 2 | 语料导入不幂等（含时间戳重新生成与签名归一化缺失） | 每次复跑增长版本并重复调用付费 Embedding |
| 3 | 嵌入配置变化不触发重建 | 检索继续用旧模型向量，阈值判断失效 |
| 4 | 行变更与索引重建非原子 | 索引失败留下"已审核但索引不完整" |
| 5 | Nginx 缓存上游 IP | 后端重建后网关持续 502，须重启前端才能恢复 |
| 6 | E2E 断言耦合知识库状态 | 导入已审核语料后必然失败，且检查的不是关键性质 |

### 11. 自动化测试汇总

| 执行 | 结果 |
|---|---|
| 后端 `pytest tests -q` | **114 passed, 1 skipped**（新增 13 项回归） |
| `ruff check app tests scripts` | All checks passed |
| 合成 AI 评测 | 12/12，`network_calls = 0` |
| 前端 lint / 单元 / 构建 | 0 报错 / 9 passed / 构建通过 |
| 依赖审计（生产） | critical 0 / high 0 / moderate 0 / low 0 |

### 12. 本轮未执行或无法执行

- **HTTPS 与 Secure Cookie 的生产形态**：验收栈为明文 HTTP，TLS 终止应由部署环境配置。
- **多实例共享限流**：当前部署为单 worker，限流为进程内实现；水平扩展需共享存储。
- **人工文化事实评分**：引用有效性不等于逐句事实一致性，`human_fact_accuracy` 仍为未知。
- **pgvector 原生 ANN 检索**：原生表已写入且可查询（已验证维度与排序一致），但检索排序仍由
  应用执行精确余弦，未声明 HNSW 索引。
