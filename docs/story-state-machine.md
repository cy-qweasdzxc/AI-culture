# 剧情状态机与实际结局规则

实现：`backend/app/services/journey.py`、公共 API `backend/app/api/routes/public.py`、AI API `backend/app/api/routes/ai.py`。数据库是唯一权威来源，Zustand 镜像 API 快照。

## 1. 合法状态与推进

| 状态 | 实际含义和操作 |
|---|---|
| CREATED | 无当前旅程的客户端状态；后端创建后直接 EXPLORING |
| EXPLORING | 已选角色、发现首点位，可触发解锁点位 |
| AT_SPOT | 已通过虚拟或浏览器位置检查，当前任务可用 |
| DIALOGUE | 合法访问当前 NPC 后对话，可对话或提交任务 |
| TASK_ACTIVE | 提交当前任务，可修正答案或做其他任务 |
| CHAPTER_COMPLETE | 当前点位任务全部完成，下一点位发现 |
| ENDING_READY | 最后点位任务全部完成，可进入尾声 |
| COMPLETED | 结局保存，进度只读，可看报告、重置或删除会话 |

典型过程：EXPLORING → AT_SPOT → DIALOGUE / TASK_ACTIVE → CHAPTER_COMPLETE → 下一点位 AT_SPOT → ENDING_READY → COMPLETED。不要求机械经过所有状态。到达最后点位但尚未完成任务也可以进入未尽结局。

首次创建 stateVersion=1，仅平江路 discovered，任务全部 locked。到达点位后其任务 available。前置点位全部任务 completed 后发现下一点位；completed 点位可回访，但任务奖励不会重复发放。

## 2. 校验与事务

1. HttpOnly Session Cookie 验证身份及旅程归属。
2. 相同 request_id 的回执验证内容一致，返回业务结果和最新快照。
3. 拒绝 COMPLETED 后继续修改，检查 state_version。
4. 带版本条件的 UPDATE 抢占事务；并发最多一个成功。
5. 校验当前点位、状态、剧情边、前置任务、NPC 访问范围、线索与答案。
6. 任务状态、奖励、图鉴、事件、日志及回执同一事务提交，异常回滚。

关键错误码：SESSION_INVALID、JOURNEY_NOT_FOUND、JOURNEY_EXISTS、STATE_CONFLICT、LOCATION_LOCKED、LOCATION_REQUIRED、LOCATION_INACCURATE、LOCATION_TOO_FAR、NPC_INVALID、NPC_UNAVAILABLE、TASK_UNAVAILABLE、TASK_COMPLETED、TRANSITION_INVALID、ENDING_NOT_READY、JOURNEY_COMPLETED、IDEMPOTENCY_CONFLICT。

错误答案增加尝试次数、不给分。缺线索返回 ok=false 和 missingClues，不记答题尝试，但仍更新动作版本，因此客户端应始终接受返回快照。正确答案一次性发放分值和奖励。

## 3. 现有演示剧情

路线：平江路 → 耦园 → 狮子林 → 拙政园 → 苏博。6 任务总知识分 140。密码任务需要 clue-shaoding；组合任务需要 clue-pianshi 和 clue-baibi。

学者初始 clue-tuopian，闲客 clue-tea-ticket，学徒 clue-tong-key。阿蘅可在耦园、狮子林、拙政园访问；周伯仅平江路，小沈仅苏博。角色已影响初始道具及 AI 上下文；更多专属任务、人物关系、角色专属结局尚未实现。

剧情规则发放演示线索：平江路周伯对话提及“平江图”得 clue-shaoding；苏博小沈对话提及片石、白墙或以壁为纸得 clue-baibi。知识未审核时 AI 拒答文化事实，发放道具附演示说明。模型建议的剧情动作当前全部不开放执行，不允许由其完成任务、发奖或改变结局。

## 4. 结局判定

必须到达苏博，且有 spot-subo → finale 边。读取任务真实状态及 finale 选择边，按优先级确定唯一结局：

| 任务状态 | 选择 | 结局 |
|---|---|---|
| 全部 6 个任务完成 | hang | cheng-huai「澄怀观道」（完整探索型） |
| 全部 6 个任务完成 | keep | qu-jing「曲径归舟」（分支选择型） |
| 未全部完成，但已到苏博 | hang / keep | wei-jin「未尽之约」 |

保存 ending_id、finalChoice、完成时间及 ending_snapshot（实际分值、全部完成条件、选择、规则版本）。结局可复现，同旅程不能重选。固定文案继承原型，为演示艺术化虚构，不声称已经正式人工文化审核；当前尚未调用 LLM 润色结局。

## 5. 位置局限

virtual 仅检查剧情解锁。onsite 验证坐标及 accuracy_m，WGS-84 转为 GCJ-02 后计算球面距离，必须在半径内且精度不超过半径与 100 米的较小值；不保存提交的精确坐标。

响应标记 proof=browser_coordinates_untrusted。浏览器坐标可模拟，不是可信地理防作弊证明。seed 坐标为近似值、coordinates_verified=false。dwell_seconds 当前为 0，连续停留校验尚未实现。

## 6. 验证依据

`backend/tests/test_journey.py` 覆盖完整路线、三个结局、越级访问、Session 越权、非法角色/NPC、缺线索、错答案、严格请求字段、重复奖励、幂等重放与冲突、旧版本及真实并发、并发创建唯一旅程、完成后操作、清除数据和位置精度/距离。实际次数与结果记录于实施进度，不替代 PostgreSQL、真实定位或真实 LLM 验收。
