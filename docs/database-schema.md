# 数据库设计（V0.1 骨架）

> 来源：技术方案第 10 节。

## 1. 数据表一览

| 数据表 | 主要内容 |
|---|---|
| users | 匿名 Session、授权状态和最近活动时间 |
| stories | 文化主题、简介、状态和版本 |
| characters | 玩家角色与 NPC 角色卡、知识边界和提示词 |
| cultural_locations | 点位坐标、触发半径、停留时间和路线顺序 |
| cultural_knowledge | 文化内容、来源、授权、类型、可信等级和审核状态 |
| knowledge_chunks | 切分文本、元数据和向量索引引用 |
| story_nodes | 起点、点位、对话、任务、选择和结局节点 |
| story_edges | 节点连接、选择键、转移条件和优先级 |
| tasks | 任务类型、验证规则、奖励和知识分值 |
| items | 线索、道具、文档及关联知识 |
| user_story_state | 角色、模式、当前节点、章节、关键标记和状态版本 |
| user_task_state | 任务状态、尝试次数、回答和得分 |
| user_inventory | 获得的线索和道具 |
| user_collections | 图鉴解锁等级、来源和时间 |
| dialogue_logs | 输入、输出、证据、模型、提示词版本和批准动作 |
| safety_logs | 风险类型、拦截原因、规则版本和处理结果 |
| test_cases | RAG、角色、剧情和安全测试用例 |

## 2. 关键数据原则

1. 服务端数据库是剧情状态的唯一权威来源。
2. 关键业务状态采用关系字段，扩展信息可使用 JSON。
3. SQLite 和 PostgreSQL 均通过 SQLAlchemy 模型访问，避免业务代码依赖数据库方言。
4. 状态更新使用事务和 `state_version` 乐观锁，避免重复奖励或并发覆盖。
5. 文化知识只有 `review_status=reviewed` 时才允许进入生产 RAG 索引。

## 3. 文化内容四级（cultural_knowledge.type）

| 类型 | 定义 | 输出要求 |
|---|---|---|
| fact | 有可靠来源支持的史实 | 可陈述并展示来源 |
| disputed | 存在多种观点 | 必须说明存在争议 |
| legend | 地方传说或民间叙事 | 必须标注为传说 |
| fiction | 项目为剧情创作的内容 | 必须标注为艺术化虚构 |

## 4. 详细字段定义

【待补充】：随 `backend/app/models/` 实现逐步补充各表 DDL 与字段说明，并以 Alembic 迁移为准。
