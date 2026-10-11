# 开发交接说明

更新：2026-10-10；基线 fcb5ed4e48a533d421b33190dbb87554f4286a4b。从 [实施进度](docs/implementation-progress.md) 和 [测试报告](docs/test-results.md) 获取本次实际状态；原技术方案 DOCX 与三个官方 PDF 保留未修改。

## 环境和启动

Node ≥22，Python ≥3.12。当前机器 Node24.15.0/npm11.12.1/Python3.12.5。使用 README 的先迁移、再种子、再服务流程；开发前端通过 Vite 代理 /api 到8000。无后端时界面报连接错误，不会切换成静默离线规则游戏。

依赖：前端 npm ci 与 package-lock.json；后端 requirements.lock 作为当前实测版本约束，安装 `python -m pip install -c requirements.lock -e ".[dev]"`。uv 创建的虚拟环境可能没有 pip，可改为 `uv pip install --python .venv/Scripts/python.exe -c requirements.lock -e ".[dev]"`。Windows 运行 npm 可使用 npm.cmd，激活受策略限制时直接调用 .venv/Scripts/python.exe。

## 模块

- app/core：环境校验、数据库、错误和单进程限流。
- app/models 与 alembic：17 项需求实体及 ActionReceipt；0001关系表，0002 PostgreSQL 可选原生向量表。
- repositories/catalog 与 services：种子、Session、位置、服务端事务剧情规则。
- api/routes/public.py：游玩 API；ai.py：证据对话和纠错；admin.py：管理鉴权与治理。
- ai/llm、rag、agents、safety：独立生成/Embedding、审核检索、JSON Agent、输入与引用校验。
- frontend/src/engine/journeyStore.ts：服务器快照缓存和 API 动作；历史静态 data 保留为种子生成来源，不进入正式玩家答案包。
- backend/tests、frontend/src/tests、frontend/e2e 与 data/testsets：机制、API、浏览器及合成评测。
- backend/scripts：evaluate_ai.py（合成机制）、evaluate_live_ai.py（真实 LLM+Embedding 全链路）、evaluate_retrieval_arms.py（只测检索的三臂对照，需 Embedding 不需要聊天模型）、benchmark_api.py、check_postgres_migrations.py。
- docs/competition/culture-source-checklist.md：已核对的文化来源候选与待人工确认事项；保留为内容治理交接依据，不代行正式文化审核。

## 不可破坏的约束

数据库决定所有任务/奖励/图鉴/结局；动作提交 journey_id、state_version 和 request_id。CAS更新、奖励、日志、结果回执同一事务；失败整体回滚；重放返回已录制动作结果与最新快照。任务正确答案不能公开在玩家 API 或生产前端包。跨会话访问统一拒绝。

资料编辑或审核撤销会删除索引并递增版本；检索同时检查当前审核版本与非演示状态。新增文化知识必须保留具体来源 URL、授权说明和人工审核人。请勿把演示种子一键改为 reviewed。

生成模型只能提出建议；当前不启用任何模型奖励动作。两个虚构线索由种子配套的剧情业务规则发放，明确标为演示。报告通过持久化任务状态求和，不能从界面传入得分。

不记录原始定位；常见长 token/邮箱/手机号输入不发模型且日志掩码。此规则不是全面个人信息识别。限流是进程内，生产多实例应替换为共享限流；过期 Session 清理和日志保留策略需运营补齐。

## 后续工作顺序

1. 取得真实文化资料、URL与授权，逐条人工审核，通过后台发布索引并检索验证。
2. 分别配置真实 LLM 与 Embedding，保持维度/模型一致；记录模型、提示词版本、输入输出、成本与真实质量评测。
3. 在可运行 Docker 的环境验收 PostgreSQL、pgvector、Nginx、TLS、备份/恢复，不能引用本机 SQLite 结果代替。
4. 实地坐标、正式文化资料与真实用户评估需要团队提供证据；本轮只维护对应技术机制和真实测试记录。
5. 竞赛报告、PPT、作品文案和正式提交不属于本轮职责；原始协作材料保持原样。AI生成的重复材料与历史ZIP按快照、来源和引用核验后清理，不再生成新的完整审查包。

本次未commit/push、公开发布或正式提交。2026-10-11维护的双重快照、一次性技术恢复副本、文件清单、清理记录、测试汇总和GitHub对比统一在项目外`D:/Code/AIC-maintenance/`。下文92项等为此前历史结果，本轮实际结果以项目外test-summary.md为准。

真实实验脚本默认只预检，不产生费用。三臂Top-K单位为独立knowledge，空召回计入标准Precision@K（分母K）；实际返回精度另给。任何真实运行需已审核题集/知识、独立Embedding配置及该次明确费用授权后--allow-paid-calls。生成消融尚未实验。不要将历史DeepSeek改进日志70项当成最新结果；本轮全量92项实际通过，见docs/test-results.md与docs/final-audit.md。
