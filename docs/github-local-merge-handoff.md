# GitHub 与本地苏州玩法整合交接

整合日期：2026-10-27。GitHub 基线 `9c37115`，原本地基线 `94de95b`，共同起点 `f05b278`。

## 范围与运行入口

合并后的源码位于 `/run/media/yao/Data/aic`。原 GitHub 下载副本保留在 `github-comparison-20261027/AI-culture`，原本地已跟踪文件归档于 `github-comparison-20261027/backups-before-merge/local-94de95b.tar`；原未提交差异保存在同目录的 `local-uncommitted.patch`。原有 `DESIGN.md` 行尾变动、`.workbuddy/`、交付包目录和 `frontend/.npmrc` 保留。

预览脚本：

```bash
python3 /run/media/yao/Data/aic/github-comparison-20261027/manage.py start
python3 /run/media/yao/Data/aic/github-comparison-20261027/manage.py status
python3 /run/media/yao/Data/aic/github-comparison-20261027/manage.py stop
```

- 合并版：http://127.0.0.1:5173 ，后端 8000，对比数据库 `github-comparison-20261027/databases/merged.db`。
- 原 GitHub 版：http://127.0.0.1:5174 ，后端 8001，独立数据库 `github-comparison-20261027/databases/github.db`。
- 两边都是 Mock AI、无腾讯地图密钥的本机预览，分别使用不同 Cookie 名。原用户数据库与先前 `databases/local.db` 保留。

## 用户指定的取舍

| 范围 | 整合结果 |
| --- | --- |
| 城市目录、完整路线 | 使用 GitHub：苏州开放，北京、西安、成都仅预览；完整可玩路线仅苏州经典五站，另保留 GitHub 片段预览和筹备支线 |
| 苏州玩法 | 6 道必做主线 + 本地 15 道自选挑战 + GitHub 8 项独立探索活动 |
| 推荐问题 | 本地 65 条分主题问题与 GitHub 探索提示问题合用，保留精确提示题文、点位/NPC 限定和已问过滤 |
| 旅程 | 主线单独决定解锁与结局；回访与旧存档补题合并；结束后的旅程只读；现场模式继续核验新定位 |
| 图片、移动端、地图、网络稳定性 | 使用 GitHub 的组件、样式、请求重试、SSE 兼容和地图回退实现 |
| 文化资料与引用 | 使用 GitHub 的来源/许可/人工审核时间校验、引用版本和撤审刷新；两套选做玩法不向文化知识库自动发布资料 |

标准难度主线最高 140 分、自选挑战 120 分、独立探索 64 分，总分最高 324。简单/深入难度的 Task 分数由服务端规则换算，独立探索积分按原 GitHub 定义计算。

## 数据与接口

数据版本：`frontend-demo-v4-suzhou-merged`。`seed.json` 保留 GitHub 六道主线和文化正文，仅加入 15 道挑战及其点位关联。`activities.json` 使用 GitHub 的八项定义。

两套选做数据继续分开，避免混淆奖励、答案和存档：

- Task：`requiredTaskCount`、`completedRequiredTaskCount` 是主线；`optionalTaskCount`、`completedOptionalTaskCount` 是自选挑战。积分分别为 `requiredTaskScore/requiredTaskMaxScore` 和 `optionalTaskScore/optionalTaskMaxScore`。
- 独立探索：GitHub 的 `optionalTotalCount`、`optionalCompletedCount`、`optionalScore`、`optionalMaxScore` 和 `optionalBySpot` 保持原义。
- `knowledgeScore/maxScore` 是全部 Task 的积分；`totalScore/totalMaxScore` 在此基础上加独立探索积分，各类奖励只累计一次。
- 快照同时提供 `activityStates` 与完整 Task 状态；旧存档 GET 时补出新增挑战的可见状态，首次提交才创建缺失的持久状态。
- 单选/观察、多选、配对均由后端验证。公开任务只包含独立的配对左右选项，不包含 `answerKey`、`answerKeys`、`password`、`sortingAnswer`、`matchingAnswer` 或 `matchingPairs`。
- 请求继续使用 `state_version` 和 `request_id` 防止并发冲突与重复奖励；旧引用仍由 GitHub 的当前审核状态刷新机制处理。

## 验证与复现

```bash
cd /run/media/yao/Data/aic/backend
.venv/bin/ruff check app tests scripts
.venv/bin/python -m pytest -q

cd /run/media/yao/Data/aic/frontend
npm run lint
npm test
npm run build

python3 /run/media/yao/Data/aic/github-comparison-20261027/run-merged-e2e.py
```

浏览器回归脚本使用独立临时数据库、Mock 模型、后端 8891 和前端 5189；退出时停止自己的服务并删除临时库。日志、JSON 结果、失败截图和 trace 位于 `.cache/merged-verification/`，不使用预览库或用户库。可在命令末尾添加 Playwright 测试文件名以定向复现。

最终结果将在本轮验收结束后补充。测试范围涵盖两套选做玩法、三难度、主线结局、旧存档、回访、并发与幂等，以及 GitHub 的文化信任、图片/地图和移动端回归。真实 AI 质量、实地位置和腾讯远程地图服务仍需要各自的实际环境验证。
