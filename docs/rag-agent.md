# RAG 与 NPC Agent · 实现与验证边界

## 资料治理与索引

管理端新增资料默认 pending。清洗采用 Unicode NFKC、空白归一化和 SHA256 正文去重；切分450字符，重叠60字符，记录标题、点位、内容类型、来源/URL/授权、标签、最早章节、审核人、版本和指纹。

人工审核必须确认来源 URL 与授权，不能接受“待补充/不明/未授权”等说明。reviewed 且非演示资料才可 publish。编辑和审核变更递增内容版本、撤销旧 chunks；检索连接资料表检查最新审核版本，防止旧向量继续生效。种子保持14条pending、0条正式检索证据；工程师没有代替审核人通过这些资料。

SQLite 使用 KnowledgeChunk JSON 向量；PostgreSQL 0002启用 pgvector 并建立 knowledge_vectors 原生向量表。维度、模型名称随每块记录，数据库检查 vector_dims。当前应用做精确余弦排序，无 HNSW、Chroma 或性能索引主张。

## 召回与过滤

1. 读取所属旅程与当前点位，校验NPC在当前点位。
2. 输入注入规则、常见长token/邮箱/手机号保护；风险输入不调用生成或Embedding。
3. SQL仅取reviewed、非demo、当前版本资料，检索进一步过滤当前点位、最早章节、冲突和来源/授权。
4. 中文连续片段的双字词与英数字词做关键词召回；关键词得分为查询词覆盖比例。
5. 有独立Embedding配置时嵌入问题，验证模型及维度，余弦得分≥0.65或关键词≥0.12才成为候选。
6. 混合分数0.65×关键词+0.35×余弦；无向量时仅关键词。正文指纹去重、稳定排序，最多4块。
7. Embedding暂不可用时降级关键词，并在响应记录原因。阈值是保守工程参数，未校准为文化准确率。
8. 无证据、错误年代前提、冲突、无效引用、JSON错误、危险输出均使用固定拒答。

当前NPC只使用所在点位证据；角色卡知识边界作为提示词上下文，尚无单独人物/时期语义分类器。后续扩展主题时应把更细边界加入数据库过滤。

## 生成与动作

角色、玩家、当前剧情、最近3轮对话与证据JSON作为数据；系统提示词声明这些数据不能覆写规则。ModelReply严格校验 dialogue、intent、emotion、evidence_ids、task_action、task_id、clue_id、suggested_next_node、unlock_knowledge、safety_flag，禁止多余字段。输出引用须非空且全部在当前召回集中；内容显示史实/争议/传说/虚构标签。

所有模型建议动作均被拒绝并记 SafetyLog。两个演示线索由独立作者规则发放：平江图提示 → clue-shaoding；苏博片石/白墙提示 → clue-baibi。这只是虚构解谜道具，回复明确标记不代表文化资料已审核。任务答案、物品归属、奖励和结局仍由事务剧情服务决定。

证据ID校验不能证明每句话完全被资料支持，关键词注入检测也不是对所有攻击的保证。本次合成测试只验证指定机制；真实模型的幻觉、角色表达和文化质量需要真实样本、人工复核及对抗测试。

## 分开配置生成与 Embedding

`.env.example`列出全部变量。生成选择 LLM_PROVIDER=deepseek/qwen/ollama/mock，并显式设置 LLM_BASE_URL、LLM_MODEL 和对应密钥。远程聊天缺密钥降为 provider=mock、mock=true，并记录 API_KEY_MISSING；正常Mock为审核证据的抽取式表达，不是LLM生成。

Embedding选择 EMBEDDING_PROVIDER=none/openai-compatible/qwen/ollama，单独指定 API_KEY、BASE_URL、MODEL、DIMENSION（默认1024）。none只建立关键词chunks；配置Embedding却不可用时发布失败、事务回滚，不把伪向量冒充索引。同一模型/维度更改后须重新发布所有已审索引。

DeepSeek/Qwen使用 /chat/completions + response_format=json_object；Ollama用 /api/chat format=json。Embedding兼容提供方用 /embeddings，Ollama用 /api/embed。请求有30秒超时，不记录厂商响应体或私钥。HTTP适配器trust_env=false，需代理时应在部署中明确设置网络，而非继承不受控环境代理。

参考官方协议：[DeepSeek对话](https://api-docs.deepseek.com/api/create-chat-completion/)、[JSON模式](https://api-docs.deepseek.com/guides/json_mode/)、[Qwen Embedding](https://www.alibabacloud.com/help/en/model-studio/embedding)、[Ollama chat](https://docs.ollama.com/api/chat)、[Ollama embed](https://docs.ollama.com/api/embed)、[pgvector](https://github.com/pgvector/pgvector)。本次验证HTTP契约使用本地MockTransport，未调用这些服务。

## 证据与测试

聊天返回provider/model/mock/reason、data_scope=reviewed_only、evidence_ids、完整证据与approved_actions；对话、提示词版本、纠错持久化。常见敏感串在日志与纠错中掩码；原始位置不保存。

12类合成评测及执行结果见 data/testsets/ai-cases.json、results.json 与测试报告。可运行 `python scripts/evaluate_ai.py`；`--persist-db` 可将合成评测结果写入TestCase供后台查看。没有真实资料质量、真实LLM/Embedding效果或文化准确率数值。

## 真实实验的无费用预检

现有evaluate_retrieval_arms.py与evaluate_live_ai.py已复用并修复；默认CLI只做preflight/dry plan，程序evaluate默认也拒绝远程调用。黄金集须reviewed并登记真实审核人/日期，知识须已审核发布且不是演示。需要调用时，先核实提供方计价、查看计划请求上界，再取得该次用户明确授权后传--allow-paid-calls。本轮用户选择无费用审查，没有真实调用；未知token估算和成本保留null，实际usage仅取提供方返回值。

三臂固定同一语料、作用域、K、模型及维度，每问题只计算一次query Embedding。指标按knowledge_id计数，按分数去重后取K个独立知识，保留实际chunk ID供追溯。Precision@K分母为配置K，答案型空召回为0且计入均值；precision_of_returned另按实际返回量计算。没有相关证据的拒答案例不混进Recall/Precision均值。混合与向量统计分开记录共享Embedding耗时、检索耗时和实际失败。普通LLM/RAG/证据/剧情约束四组生成消融尚未实验；事实准确性与角色一致性必须人工评分。详细失败→修复记录见[evaluation-tool审查](evaluation-tool-audit-2026-10-10.md)。
