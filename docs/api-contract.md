# API 契约 · 0.2 实现版

基准 /api；JSON；OpenAPI /api/openapi.json，交互文档 /api/docs。所有请求模型禁止未知字段。客户端请求包含Cookie，不能把sessionId当作凭证。

## 会话与数据范围

POST /session 创建或恢复匿名会话，返回 {sessionId,snapshot}；Cookie保存高熵随机token，服务端存HMAC hash；30天有效，生产Secure、HttpOnly、SameSite=Lax。返回的sessionId是用户标识，不是Cookie token。DELETE /session 删除当前会话、旅程及级联记录。没有有效Cookie的受保护调用返回401 SESSION_INVALID。

每个用户只有一个旅程；所有journey_id校验所属会话。查询可省略journey_id表示当前旅程。角色/主题公开，未发现点位、未完成任务答案、未取得线索和未解锁图鉴不会通过玩家接口完整公开。

## 玩家接口

|方法|路径|请求/结果|
|---|---|---|
|GET|/health|{status:ok,database:ready}；未迁移/不可用503|
|GET|/themes|{items:主题元信息}|
|GET|/roles?story_id=...|{items:玩家角色}|
|POST/DELETE|/session|创建/恢复与清除|
|GET|/journeys/current|{snapshot}，无旅程为null|
|POST|/journeys/start|{story_id,role_id,mode} → {snapshot}|
|POST|/journeys/reset|动作公共字段 → {snapshot:null}；版本CAS删除|
|POST|/journeys/mode|公共字段+mode:virtual/onsite|
|GET|/routes/{story_id}|当前旅程可见spots/npcs/snapshot|
|POST|/location/check|journey_id,spot_id,lat?,lng?,accuracy_m?,coordinate_system → 距离、可触发、近似坐标状态|
|POST|/location/trigger|公共动作字段+上述位置字段 → {ok,location,snapshot}|
|GET|/tasks|当前点位及已完成任务；不返回答案|
|POST|/tasks/{task_id}/verify|公共动作字段+answer → {ok,feedback,missingClues?,snapshot}|
|GET|/clues|{items:已取得线索}|
|GET|/codex|{items:已解锁图鉴,total}；显式reviewStatus/isDemo/sourceUrl/license|
|POST|/journeys/finale|公共字段+choice_key:hang/keep → {ending,snapshot}|
|GET|/ending|{ending,ruleSnapshot}，未结局为null|
|GET|/report|持久化得分、进度、耗时、结局、事件、分点位及薄弱项|

公共动作字段：journey_id、state_version（≥0）、request_id（可选1–80字符）。前端每个动作生成UUID；服务端动作回执按journey/request唯一。首次执行必须匹配当前state_version，事务CAS加1；失败回滚。重复同request_id同payload返回录制结果、最新snapshot、replayed=true；同ID不同payload返回409 IDEMPOTENCY_CONFLICT。

任务失败答案返回200 ok=false并记录合法尝试，奖励只在正确答案首次完成发放。锁定任务、错点位、缺前置、结束后的新动作等为409。缺requiredClues时ok=false且missingClues，不加尝试数。服务端直接忽略不了伪造score/inventory，因为额外字段会被422拒绝。

## AI 与纠错

POST /chat/message：公共动作字段 + npc_id + message（1–1000字符，兼容text）。先校验当前NPC及剧情范围，再检索审核证据并生成结构化回复；最大30次/用户/分钟。

返回dialogue、intent、emotion、evidence_ids、provider、model、mock、reason、approved_actions、evidence、data_scope=reviewed_only、message_id、retrieval_mode、retrieval_reason、snapshot。证据包含id、spotId、type、title、content、source、source_url、review_status。provider=none表示未调用模型的本地拒答；mock=true表示Mock生成。没有审核证据不会用pending资料伪装回答。

多轮追问另返回 `context_spot_id` 与 `query_context={mode, knowledge_ids}`，mode 为 `standalone/history/clarification/unavailable`，不返回补全查询的原文副本。`intent=clarification`、`provider=none`、空引用表示本地请求确认对象，reason 为 `CONTEXT_AMBIGUOUS` 或 `CONTEXT_REQUIRED`；它不是文化事实回答，也不发放模型奖励。候选知识已失效时返回 `CONTEXT_UNAVAILABLE`，不使用历史回答替代当前审核证据。原有客户端可忽略新增字段。

POST /chat/feedback：journey_id、npc_id、message_id、reason（4–1000字符），只接受所属旅程的真实对话，返回{recorded:true}。不修改剧情版本。

## 管理接口

全部 /api/admin 路径除login外要求有效管理员JWT：两小时HttpOnly、Secure（production）、SameSite=Strict、路径/api/admin的Cookie，或Bearer同一JWT。禁止存token至localStorage。空ADMIN_PASSWORD禁用登录；登录10次/来源IP/分钟。

|方法|路径|功能|
|---|---|---|
|POST|/login|username/password支持Unicode，按UTF-8字节恒时比较；成功返回username/expiresIn并设Cookie，错误凭据401|
|GET / POST|/me /logout|读取身份/清除Cookie|
|GET/POST|/knowledge|列出/创建pending文化资料|
|PUT|/knowledge/{id}|全字段+version；CAS，修改撤销审核及索引|
|POST|/knowledge/{id}/review|version,status:reviewed/rejected/pending,reviewer,confirm_sources|
|POST|/knowledge/{id}/publish|仅非演示reviewed资料，建立当前版本chunks/可选向量|
|POST|/retrieval/test|query,story_id,location_id,chapter,mode:keyword/vector/hybrid,limit:1–20；按模式返回命中、双分项得分、实际模式与本次配置|
|GET/PATCH|/characters /characters/{id}|列出角色/修改NPC name,greeting,knowledge_scope,personality|
|GET/PATCH|/story /tasks/{id}|读取结构/仅修改任务title与briefing|
|GET/POST|/dialogues /dialogues/{id}/resolve|最近100条对话、纠错/处理resolution|
|GET|/tests|数据库TestCase执行结果|
|GET|/metrics|真实数据库计数，performance=null|

知识正文请求字段：id（小写字母/数字/连字符3–90字符）、story_id、location_id、title、content、content_type、source、source_url、license、tags、min_chapter。来源审核检查URL、授权和人工确认；无法自动证明出处真实性，仍须审核人逐条核对。

NPC位置、奖励/答案和结局规则不提供任意管理修改接口，依靠版本化种子与代码审查；不能把当前后台描述为完整通用剧情编辑器。

## 检索对照实验

`POST /api/admin/retrieval/test` 的 `mode` 选择实验臂，三臂共用同一套审核过滤（未审核、非本点位、超出章节、`conflicted`、缺 `source` 或 `license` 一律跳过），**切换模式不能扩大候选范围**：

| mode | 打分 | 前置条件 |
|---|---|---|
| `keyword` | 仅中文二元词重叠比例，阈值 `lexical ≥ 0.12` | 无 |
| `vector` | 仅余弦相似度，阈值 `vector ≥ 0.65` | 需要可用的 Embedding，否则 503 `EMBEDDING_UNAVAILABLE` |
| `hybrid` | `0.65 × lexical + 0.35 × vector`，任一分项达阈值即保留 | 有向量时用混合分；无向量时降级为关键词分 |

响应含 `mode`（实际执行）、`requestedMode`（请求值）、`limit`、`elapsedMs`、`corpusCount`、`embeddingModel`、`embeddingError` 与 `retrievalConfig`（本次生效的阈值与权重）。**降级必须显式**：请求 `hybrid` 而无法取得查询向量时返回 `mode: keyword` 并填写 `embeddingError`，不会把关键词结果报告成向量结果。`vector` 模式无法取得向量时直接 503。

`retrievalConfig` 中的阈值与权重是**工程初始参数，不是实验调优结果**；任何一次对照实验都应连同该字段一起记录，以便复现。

## 错误与隐私

```json
{"error":{"code":"STATE_CONFLICT","message":"旅程已更新，请刷新状态后重试。","details":{"stateVersion":4}}}
```

主要错误：SESSION_INVALID/ADMIN_UNAUTHORIZED（401）、ORIGIN_REJECTED（403）、JOURNEY_NOT_FOUND/TASK_NOT_FOUND（404）、STATE_CONFLICT/JOURNEY_EXISTS/JOURNEY_COMPLETED/LOCATION_LOCKED/LOCATION_TOO_FAR/LOCATION_INACCURATE/TASK_UNAVAILABLE/TASK_COMPLETED/NPC_UNAVAILABLE/ENDING_NOT_READY/CONTENT_CONFLICT/SOURCE_REVIEW_REQUIRED/KNOWLEDGE_UNREVIEWED（409）、VALIDATION_ERROR（422）、RATE_LIMITED（429）、DATABASE_NOT_READY/DATABASE_UNAVAILABLE/ADMIN_NOT_CONFIGURED/EMBEDDING_UNAVAILABLE（503）。

验证错误仅返回字段位置与类型，不返回密码或原请求。服务异常不暴露堆栈、数据库URL、厂商响应体和密钥。原始坐标不持久化；常见敏感输入不送模型并掩码对话/纠错日志。API响应no-store，写操作校验Origin。限流进程内，当前未提供跨实例共享限流。
