# 评测工具与输入守卫独立审计（2026-10-10）

本记录是本次审查的新证据，不改写 `deepseek-improvement-log.md` 的历史记录。用户当前授权范围是无费用审查和验证工具；没有调用真实收费 LLM 或 Embedding，没有新增真实模型质量结果。

## 发现、复现和修复

| 问题 | 复现与实际修复 |
|---|---|
| 三臂数据集未强制人审 | 标记未审核的数据集原先可以读取；读入与程序化 evaluate 均要求 reviewed、非空审核人和有效日期，并拒绝占位问题 |
| 与 live 模板 schema 不兼容 | 12 案例中的 expected_refusal_reasons / expected_answer_concepts 被判额外字段；三臂 schema 现完整兼容 |
| 空结果 precision=None | 答案型案例未召回时被 precision 均值排除，夸大成绩；现在记 0，纳入均值 |
| top-K 混用切片与知识条目 | 先取 K 切片再去重知识 ID，重复切片挤掉其他条目；三臂与 live 现按得分排名后取 K 个不同 knowledge_id，保留实际 chunk ID |
| 提供方调用缺少显式授权 | 两脚本原先配置就绪即可能调用；现在默认 preflight/dry plan，evaluate 也默认拒绝调用，只有用户之后明确批准的那一轮才能传 --allow-paid-calls |
| 成本/用量不明确 | 计划说明请求次数上界和字符/UTF-8 字节数；无 tokenizer 和核实单价时 token 估算及成本为 null。真实运行只累计提供方响应实际 usage，缺失时仍未知 |
| 基础注入规则漏常见变体 | 限定新增忽略设定、system 冒充、不再受限制、管理员越级动作、提前索要结局词组；与任务奖励权限校验共同工作，不宣称完整注入分类器 |

Precision@K 明确定义为 top-K 中相关知识条目数 / 配置 K；另给 precision_of_returned，分母是实际返回数量。Recall@K 的标注单位为 knowledge_id。无相关证据标注的拒答案例不纳入召回/精度均值。规则拦截案例本地处理，不发送到 Embedding 或聊天模型。

## 实际测试

| 执行 | 本次结果 |
|---|---|
| 评测缺陷先写回归再修复 | 首次 6 failed / 8 passed；修复后 17 passed，5.26 秒 |
| 注入变体及正常问题边界 | 首次 4 failed / 7 passed；修复后已纳入全量通过 |
| 后端全量 pytest，隔离测试目录 | **92 passed，1 warning，34.61 秒** |
| ruff check app tests scripts | All checks passed |
| evaluate_retrieval_arms.py 默认运行 | executed=false、EMBEDDING_REQUIRED，脚本退出码 2 |
| evaluate_live_ai.py 默认运行 | executed=false、LIVE_LLM_REQUIRED，脚本退出码 2 |

测试只使用合成资料、MockTransport 或本地 HTTP 桩，不是文化事实实验或真实模型准确率。唯一 warning 是 Starlette 对当前 httpx TestClient 路径的弃用提示。92 是本轮实际执行数，不照抄历史日志的 70。

## 运行工具与剩余条件

```bash
# backend 中；默认不发起提供方调用
python scripts/evaluate_retrieval_arms.py --dataset ../data/testsets/my-reviewed-cases.json
python scripts/evaluate_live_ai.py --dataset ../data/testsets/my-reviewed-cases.json
```

默认模板仍是 template_requires_human_review。真实实验依赖来源及授权确认、人工审核并发布的知识库、独立标注数据集、真实提供方配置、当前计费确认及用户对该次收费调用的明确授权。当前缺失这些条件，真实实验为 **BLOCKED**，工具为 **IMPLEMENTED**，本地工程回归为 **DONE**。

引用 ID 校验不等于逐句事实一致性。结果保留人工评分空项，不填写不存在的事实准确率、幻觉率或文化质量结论。PostgreSQL 迁移已有离线 DDL 证据，实际 PostgreSQL / pgvector / Docker 启动仍不能以静态编译替代。
