# 部署与运行 · 实现版

## 本机实测边界

2026-10-11在 Windows、Python3.12.5、Node24.15 上验证 SQLite 迁移/幂等种子、FastAPI、Vite、桌面和375px浏览器流程，并实测后端进程重启后的任务、奖励及完整状态恢复。

本轮已按普通用户模式安装 Docker Desktop 4.94.0，安装包通过官方 SHA256 和有效数字签名校验；实际 Docker CLI 29.8.2、Compose 5.5.1。使用工程外私有测试配置及仅替换 backend env_file 的 overlay，`docker compose config --quiet` 实际通过，未创建或覆盖工程内 `.env`。WSL尚未安装，Engine不可用；系统功能启用和重启须按用户授权边界另行确认，因此镜像构建、PostgreSQL/pgvector/Nginx容器和容器恢复仍未验收。完整执行记录在工程外 `D:/Code/AIC-maintenance/test-summary.md`。

## 本地

按根README先安装、alembic upgrade head、python scripts/seed.py，再启动8000后端和5173前端。uv/pip约束来自 backend/requirements.lock；npm ci 使用lock。SQLite文件位于环境指定目录，已忽略不提交。

开发默认Mock及无Embedding；管理员登录需要本地ADMIN_PASSWORD。生成/向量配置见RAG文档。无腾讯地图Key使用SVG路线。后端连接失败有显式错误，不读旧localStorage作为权威进度。

## Compose拓扑与配置

Nginx前端 → 内部backend:8000 → 内部Postgres pgvector:pg16；仅前端绑定127.0.0.1:8080。容器健康链为pg_isready → /api/health → Nginx反代/api/health。backend以非root用户运行，启动先迁移、再seed、再Uvicorn。只支持当前单backend实例启动流程，扩容前须把迁移/seed分离为一次性任务。

复制根.env.example为.env并设置：DB_PASSWORD（建议随机十六进制以避开URL特殊字符）、两个不同且≥32字符随机SESSION_SECRET/ADMIN_JWT_SECRET、≥12字符ADMIN_PASSWORD、正确CORS_ORIGINS。生产配置拒绝开发占位secret。可使用 `python -c "import secrets; print(secrets.token_hex(32))"`分别生成值，保存到本地私密配置，禁止提交或截屏分享。

```bash
docker compose config --quiet
docker compose up --build -d
docker compose ps
docker compose logs --tail=100 backend
curl --fail http://localhost:8080/api/health
```

Postgres0002迁移要求CREATE EXTENSION vector权限；提供的pgvector镜像包含扩展，但仍需实际验收。应用原生向量表存模型、维度和精确向量；目前查询排序是应用中的精确余弦，没有ANN性能验证。

.env包含私密内容；执行 docker compose config 时避免输出展开后的完整配置；使用--quiet。构建.dockerignore排除真实.env、数据库、虚拟环境和缓存。前端npm ci、后端锁约束安装，不复制本机依赖。

## HTTPS、代理和Cookie

生产会话/管理Cookie均Secure。回环演示可用支持localhost Secure Cookie的浏览器；正式域名必须在前置代理终止HTTPS，并转发到绑定回环的8080。设置正确CORS_ORIGINS与Host，Nginx用$http_host保留端口；别把生产APP_ENV改为development绕开安全校验。

当前Nginx配置是TLS上游后的HTTP代理配置，不含证书申请/续期。公网部署应由实际域名/证书管理环境配置，不声称已获得证书或已发布站点。OpenAPI是否开放公网、共享限流、管理员网络限制由部署者按用途配置。

## 备份与恢复

已在隔离验收库实测（2026-10-11）：`pg_dump --clean --if-exists` 生成备份，恢复到独立库
`restore_check` 后无 ERROR，且 `cultural_knowledge`（14）、`reviewed`（11）、`knowledge_chunks`（11）、
`user_story_state`（22）、`user_task_state`（132）、`user_inventory`（63）、`dialogue_logs`（53）、
pgvector 扩展与迁移版本 `0002` 与源库逐项一致；恢复库中原生向量维度同为 1024。恢复完成后立即
删除临时库与备份文件。

```bash
# 备份（容器内执行，避免把密码写进命令行历史）
docker compose exec -T db pg_dump -U citystory -d citystory --clean --if-exists > backup.sql
# 恢复演练：先建独立库，确认目标无误后再导入，切勿覆盖生产库
docker compose exec -T db psql -U citystory -d postgres -c "CREATE DATABASE restore_check;"
docker compose exec -T db psql -U citystory -d restore_check -f /tmp/restore.sql
docker compose exec -T db psql -U citystory -d postgres -c "DROP DATABASE restore_check;"
```

`--clean --if-exists` 使恢复可重复执行，但**恢复目标是一个空库或已确认可覆盖的库**这一前提不变。

```bash
docker compose exec -T db pg_dump -U citystory citystory > backup.sql
# 在已停止写入的恢复窗口，确认目标数据库后执行：
docker compose exec -T db psql -U citystory citystory < backup.sql
```

备份包含旅程/对话，须按隐私要求限制访问、加密保存与保留周期；恢复应在隔离库演练。SQLite开发库应停止写入后复制；不要把文件备份提交。迁移回滚0002删除向量表但保留共享扩展；生产迁移前备份并审查变更，不能盲目downgrade。

## 验收清单

- config语法、镜像build、健康状态和SPA深链刷新；
- 首次迁移及重复seed、backend重启恢复会话；
- /admin未登录401、真Cookie登录、源站限制、人工审核/撤销和索引；
- PostgreSQL FK/CAS并发、pgvector维度/当前版本过滤；
- HTTPS及Secure Cookie、匿名数据清除、备份恢复；
- 真实LLM/Embedding独立配置与成本/延迟/质量记录。

2026-10-11 隔离全栈验收结果（项目名 `aic-acceptance`，独立数据卷、端口 8090，新随机密钥）：

| 验收项 | 结果 |
|---|---|
| config 语法、镜像构建、健康状态、SPA 深链 | 通过（`config --quiet` 退出 0；三容器 healthy；`/admin` 等深链返回 SPA 入口） |
| 首次迁移、重复 seed、backend 重启后会话恢复 | 通过（迁移 `0002`；重启后既有旅程与任务态逐项保留） |
| 迁移版本、pgvector 扩展与维度 | 通过（`alembic_version=0002`；`vector 0.8.7`；`knowledge_vectors` 11 行、维度 1024） |
| `/admin` 未登录 401、真 Cookie 登录、源站限制 | 通过（未登录 401、错误凭据 401、恶意 Origin 403、同源 200） |
| PostgreSQL CAS 并发与幂等回执 | 通过（8 并发同版本 → `1×200 + 7×409`；同 `request_id` 重放返回相同版本） |
| 完整业务旅程 | 通过（5 点位依次到达，6 任务全部答对，结局 `cheng-huai`，知识分 140/140） |
| 浏览器 E2E | 通过（对容器栈 10/10） |
| 备份与恢复（隔离库） | 通过（逐项计数一致，恢复 ERROR 0） |
| 真实 LLM 与 Embedding | 通过（浏览器端真实调用，回答挂出 `reviewed_only` 引用） |
| HTTPS 与 Secure Cookie | **未执行**：明文 HTTP 下需 `SESSION_COOKIE_SECURE=false`，TLS 终止应在部署环境配置 |
| 匿名数据清除 | 通过（`/api/journeys/reset` 与设置页清除在 E2E 中覆盖） |

已知运维注意：后端容器重建会拿到新 IP，Nginx 必须用变量 + Docker 内置 DNS 解析上游，否则网关持续 502 直到前端重启（已修复并实测）。
