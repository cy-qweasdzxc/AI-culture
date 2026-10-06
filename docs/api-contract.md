# API 契约（V0.1 骨架）

> 来源：技术方案第 11 节。

## 1. 通用约定

- 统一 JSON，前缀 `/api`。
- 匿名用户：HttpOnly Session Cookie；管理端：受保护的认证机制（JWT）。
- 所有错误返回**稳定错误码**，不向客户端暴露 API Key、数据库地址和内部堆栈。
- AI 对话响应中，后端只向前端返回通过校验的 `approved_actions`。

## 2. 接口一览

| 方法 | 路径 | 用途 |
|---|---|---|
| POST | `/api/session` | 创建或恢复匿名 Session |
| GET | `/api/themes` | 返回已发布文化主题 |
| GET | `/api/roles` | 按 story_id 返回可选角色 |
| POST | `/api/journeys/start` | 校验主题、角色和模式并创建旅程 |
| GET | `/api/routes/{id}` | 返回路线、可见点位和当前进度 |
| POST | `/api/location/check` | 计算距离、精度和是否可触发 |
| POST | `/api/location/trigger` | 校验位置与前置条件并触发节点 |
| POST | `/api/chat/message` | 执行安全、RAG、Agent、审核和动作校验 |
| GET | `/api/tasks` | 返回当前可见任务 |
| POST | `/api/tasks/{id}/verify` | 服务端验证任务并发放合法奖励 |
| GET | `/api/clues` | 返回已获得线索和道具 |
| GET | `/api/codex` | 返回可见图鉴、来源和可信等级 |
| GET | `/api/report` | 根据真实状态计算体验报告 |
| GET | `/api/ending` | 执行规则判定并返回结局 |
| POST | `/api/admin/knowledge` | 创建待审核知识条目 |
| GET | `/api/admin/metrics` | 返回真实系统指标 |

## 3. AI 对话响应（模型原始 JSON 字段）

```
dialogue, intent, emotion, evidence_ids, task_action, task_id,
suggested_next_node, unlock_knowledge, safety_flag
```

**关键约束**：以上字段只是模型的"建议"，后端动作校验器逐项校验后才形成 `approved_actions` 返回前端并落库；非法动作不得修改数据库。

## 4. 错误码

【待补充】：按模块定义稳定错误码表（如 `SESSION_INVALID`、`STATE_CONFLICT`、`EVIDENCE_INSUFFICIENT`、`ACTION_REJECTED`、`LOCATION_TOO_FAR` 等）。
