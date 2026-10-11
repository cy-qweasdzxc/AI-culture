# 测试与验收

来源为技术方案第15节，按当前实现补充可运行命令。本次实际结果见 [测试记录](test-results.md)，不将历史说明中的“通过”计为本次验收。

## 1. 范围与边界

| 层次 | 实际工具与入口 | 覆盖 |
|---|---|---|
| 前端单元/组件 | Vitest、Testing Library；frontend/src/tests | 服务端响应缓存、错误处理、页面和组件 |
| 后端/API/数据库 | Pytest、TestClient；backend/tests | 实际Alembic迁移、seed、SQLite、Session、状态、奖励、结局、鉴权 |
| AI工程 | test_ai.py及evaluate_ai.py | 审核/NPC/阶段过滤、混合检索、引用、JSON、提供方HTTP契约、非法动作、隐私 |
| 管理治理 | test_admin.py | 未授权访问、配置安全、登录、来源确认、审核/发布、编辑撤索引、反馈归属 |
| 浏览器E2E | Playwright；frontend/e2e | 1440×900桌面、375×812移动；3结局、5点3NPC、6或5任务、拒答、恢复/清除及后台完整合成治理 |
| 本机性能 | backend/scripts/benchmark_api.py | HTTP回环串行/并发健康检查及7请求旅程操作流 |
| 依赖安全 | npm audit、Ruff及静态源文件扫描 | 已知依赖风险和常见秘密/身份模式；不能代替完整安全审计 |

正常API需拒绝客户端伪造分数、背包和任务状态；客户端本身仍可修改界面或内存，不能写成“客户端不可篡改”。普通浏览器定位可模拟，不属于可信地理证明。测试夹具与默认Mock只验证工程机制，不验证真实文化内容和LLM质量。

## 2. 可复现命令

前端（在frontend目录）：

```powershell
npm.cmd ci
npm.cmd run lint
npm.cmd test
npm.cmd run build
npm.cmd run test:e2e
```

E2E前先按运行说明迁移、seed并启动真实后端。Playwright配置自动启动Vite，默认请求 `http://127.0.0.1:5173`。如使用已有Chrome，在当前进程设置 `PLAYWRIGHT_CHROMIUM_EXECUTABLE` 为其绝对路径；未设置时使用Playwright安装的Chromium。测试可清除自己的匿名Session，应使用隔离测试数据库，不与真实用户共用。

后端（在backend目录，已安装 `.venv` 开发依赖）：

```powershell
.\.venv\Scripts\python.exe -m ruff check app tests scripts
.\.venv\Scripts\python.exe -m pytest tests --basetemp=.pytest-tmp-local -q
.\.venv\Scripts\python.exe scripts/evaluate_ai.py
```

`database` fixture创建临时SQLite，执行真实Alembic迁移并seed；不通过 `create_all` 替代迁移。`--basetemp` 应使用专属于本轮的临时目录，避免并行测试共用。此Windows沙箱下TestClient线程会挂起，本次API测试在获准的非沙箱进程完成；一般开发环境不需要特殊沙箱设置。

## 3. 合成AI评测与管理展示

[ai-cases.json](../data/testsets/ai-cases.json) 包含12类：知识库内、多证据、知识库外、争议、传说、虚构、NPC范围、剧情阶段、注入、虚假前提、无效引用、JSON异常。所有资料都是合成夹具，`reviewed` 仅模拟审核状态，不对应真实文化审核。结果写入 [results.json](../data/testsets/results.json)，明确Mock、本地拒答、零网络调用和真实质量未验证。

默认脚本不打开数据库。需要在管理“测试记录”页显示合成结果时，可以将它们写入**事先迁移好的隔离数据库**：

```powershell
$env:DATABASE_URL='sqlite:///../.cache/evaluation.db'
.\.venv\Scripts\python.exe -m alembic upgrade head
.\.venv\Scripts\python.exe scripts/seed.py
.\.venv\Scripts\python.exe scripts/evaluate_ai.py --persist-db --database-url 'sqlite:///../.cache/evaluation.db'
```

先创建根目录 `.cache`。脚本只upsert `synthetic:` 前缀的TestCase，保留类别、输入、期望、真实断言结果与executed_at；重复执行不重复增加。它不会把文化条目改为已审核。若服务需展示这些记录，应明确指向该隔离数据库，并配置私密管理密码/签名密钥，不使用公开默认值。

真实文化黄金集、标准证据、人工评分标准、样本量和真实LLM实验仍为【待补充】。AI工程测试使用 `httpx.MockTransport` 验证DeepSeek/通义/Ollama协议；返回提供方字段不意味着真实外部API已成功调用。

## 4. 性能复现

在隔离SQLite上迁移、seed并启动单进程Uvicorn后执行：

```powershell
.\.venv\Scripts\python.exe scripts/benchmark_api.py --base-url http://127.0.0.1:8001
```

脚本只允许HTTP回环目标，先执行健康检查及5次预热，再测50串行/200并发健康请求，以及5串行/10并发旅程操作流。每流7请求为Session、start、arrival、chat本地拒答、verify、report、DELETE Session。清理请求包含在测量中；共355样本，另6个预检查/预热不计。P50/P95采用排序后的nearest-rank，平均值为样本算术平均，成功定义为2xx。

连接中止、响应断开及其他受支持的传输异常记录为status=0，不让整个实验崩溃；收到200头部后正文中断同样计为失败。中断的操作流保留已执行样本，并尝试清除自有Session，任一失败样本使CLI退出非零。不得删除失败轮次再将复测表述为从未失败。本轮结果与初次Windows连接中断记录保存在工程外维护目录，历史JSON保持原样。

输出 [performance-results.json](../data/testsets/performance-results.json)。该实验不覆盖完整5点路线性能、真实检索/Embedding/模型生成、公网延迟或生产吞吐。性能验收目标与CPU/RAM完整硬件记录仍为【待补充】。

## 5. 最低验收与未验证事项

- 完整旅程可通过真实API推进，数据库恢复/重置，报告来自持久化任务和图鉴状态。
- 覆盖越级、非法角色/NPC、缺线索、错误答案、重复奖励、状态冲突、并发和不同结局。
- 模型引用/JSON/动作不合法时不得越权；无正式审核资料时拒答；Mock和演示线索有标签。
- 管理配置未设置私密密码/签名密钥时停用，不接受公开默认key伪签Token。
- 定位授权、清除、秘密/邮件/手机号日志掩码与对话纠错归属需要测试。
- 真实LLM/Embedding与正式文化质量、真实用户效果、现场定位、地图服务Key、Docker/PostgreSQL/pgvector/Nginx全栈仍【未验证】。
- 当前无上传接口，不把未实现的上传扫描列为已经通过；依赖审计残余风险见 [前端依赖审计](frontend-security-audit.md)。
