# 数据库设计与实际实现

模型以 `backend/app/models/entities.py` 为准，由 Alembic 管理。`0001` 创建 17 个规划实体及幂等回执表；`0002` 在 PostgreSQL 中启用 pgvector 与专用向量表，在 SQLite 中不增加向量表。应用启动不执行 `create_all`。

## 1. 表及业务关系

| 表 | 关键字段 | 约束与用途 |
|---|---|---|
| users | id、session_hash、expires_at、created_at、last_active_at、location_consent | 仅保存会话凭证的 HMAC 摘要；摘要唯一 |
| stories | id、name、status、version、data | 主题信息存 JSON；游客仅查询 published |
| characters | id、story_id、kind、name、data | kind 为 player/npc；初始线索及 NPC locationIds 在角色卡 data |
| cultural_locations | id、story_id、route_order、lat、lng、trigger_radius_m、dwell_seconds、coordinates_verified、data | 同主题顺序唯一，半径为正；GCJ-02 坐标 |
| cultural_knowledge | id、story_id、location_id、content_type、title、content、source、source_url、license、trust_level、review_status、reviewer、reviewed_at、version、is_demo、tags、metadata_json | 类型、审核状态有 CHECK；审核状态和点位有索引 |
| knowledge_chunks | id、knowledge_id、chunk_index、content、embedding、embedding_model、embedding_dimension、knowledge_version、vector_ref、metadata_json | 同条目切片序号唯一；删除知识级联删除切片；SQLite 用 embedding JSON |
| story_nodes | id、story_id、location_id、kind、hidden、data | 起点、点位、任务、选择、结局；演示结局文字在 data |
| story_edges | id、story_id、from_node_id、to_node_id、choice_key、priority、conditions | 同起终点及选择唯一；前置任务、结局条件在 conditions |
| tasks | id、story_id、location_id、node_id、type、title、knowledge_score、validation、rewards、data | 答案、必要线索和奖励在服务端；分值非负 |
| items | id、story_id、knowledge_id、kind、name、data | clue/item/codex；图鉴关联文化知识 |
| user_story_state | id、user_id、story_id、role_id、mode、state、current_node_id、current_location_id、chapter、state_version、state_data、ending_id、ending_snapshot、started_at、finished_at | user_id 唯一，每会话一份当前旅程；版本非负；角色、节点、结局有外键 |
| user_task_state | journey_id + task_id、status、attempts、answer、score | 复合主键；尝试次数和分值非负 |
| user_inventory | journey_id + item_id、source、acquired_at | 复合主键防重复线索 |
| user_collections | journey_id + item_id、level、source、acquired_at | 复合主键防重复图鉴 |
| dialogue_logs | id、journey_id、npc_id、user_input、response、evidence_ids、approved_actions、provider、model、prompt_version、feedback、created_at | 保存真实提供方、证据、批准动作及反馈；不记录 Key |
| safety_logs | id、journey_id、risk_type、reason、rule_version、result、created_at | 记录审核原因，不保存精确位置 |
| test_cases | id、category、input、expected、result、executed_at | 支持黄金测试分类及结果；文化质量仍需正式人工测试集 |
| action_receipts | journey_id + request_id、action、payload_hash、response、created_at | 幂等；更改同 request_id 的请求内容返回冲突 |

`state_data` 保存点位状态、flags 和关键事件。任务、背包、图鉴、对话由对应关系表读取。camelCase 快照是服务端派生结果，不接受客户端直接写入。

## 2. 事务、并发与清除

每次动作验证 Session 和旅程归属，检查回执及 `state_version`，再用带版本条件的 UPDATE 抢占更新。未命中一行返回 STATE_CONFLICT。剧情状态、奖励、日志、回执一次事务提交，异常全部回滚。奖励复合主键进一步防止重复领取。

相同 request_id 和原请求内容重试时返回已记录的业务结果，并重新读取最新旅程快照，避免旧请求覆盖新进度。并发创建由 user_id 唯一约束保护，返回 JOURNEY_EXISTS；重置以带版本条件的 DELETE 实现。

删除 Session 会级联删除该用户的旅程、任务、背包、图鉴、对话、安全日志和回执。备份及外部日志清理需要部署者另行配置。

2026-10-17 起，ActionReceipt.response 仅保存业务结果，最新快照在重放时重建，避免每个动作重复保存全部历史。兼容旧的完整快照回执，不需要 schema 迁移。历史副本可在 backend 目录执行 `python scripts/compact_action_receipts.py` 查看只读压缩计划；确认目标数据库并备份后添加 `--apply` 才实际压缩。脚本不删除事件、对话、奖励、原始动作结果或幂等指纹。本轮仅在临时测试库验证，未压缩既有业务库。

## 3. 文化资料与初始化

文化类型为 fact / disputed / legend / fiction；默认 pending，未知来源或授权为【待补充】。只有人工审核为 reviewed 的当前版本允许切片和正式 RAG。图鉴已审核内容取关联知识当前版本，避免将旧演示文本误标为已审核。

`data/demo/seed.json` 从原型导出：1 主题、5 近似点位、3 玩家、3 NPC、6 任务、3 结局、7 线索/道具、14 知识。包括 fiction 在内，全部知识初始化 pending，不创建切片。精确坐标和授权未核实。剧情谜题可以闭环；AI 没有审核证据时拒答文化事实，默认明确标记 Mock。

seed 只插入缺失主键，不覆盖人工审核、修改或玩家进度，可重复执行。

## 4. 运行与验证

在 backend 中运行：

```bash
pip install -e ".[dev]"
alembic upgrade head
python scripts/seed.py
alembic check
uvicorn app.main:app --reload
```

开发 SQLite 可独立运行。PostgreSQL、pgvector、Docker 的实际启动须有对应环境验收，不能以 SQLite 测试替代。向量模型、维度必须与索引一致，变更时重新索引；普通业务服务不依赖 PostgreSQL 方言。
