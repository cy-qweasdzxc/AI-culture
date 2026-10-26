# 苏州示范问题与玩法扩充交接

交接日期：2026-10-26。仓库：`/run/media/yao/Data/aic`，基于提交 `002a66f` 开始实现。功能设计与验收摘要见 [suzhou-gameplay-expansion.md](suzhou-gameplay-expansion.md)。

## 已完成的体验

苏州经典路线仍为平江路 → 耦园 → 狮子林 → 拙政园 → 苏州博物馆。保留原有 6 道主线任务，增加每站 3 道自选挑战，共 21 道任务。普通难度主线 140 分，挑战每道 8 分，全部完成最高 260 分；简单、深入难度由服务端换算。

五站各 13 条推荐问题，共 65 条，覆盖街巷生活、园林营造、历史人物、古今建筑、史实辨析、线索推理六类。每站只展示适用主题，保留原主线入口题、自由提问、换一批、已问过滤与 NPC/点位过滤。阿蘅在三个园林点位分别使用对应题池。

新增挑战包含观察单选、多选判断和线索配对。游客可以跳过挑战继续主线，完整主线结局只按主线任务判断。地图和点位页支持回访，先更新服务端当前位置再继续答题与对话；已完成的后续点位不会因回访退回“已发现”。旅程结束后，未完成任务变为只读，完成题仍可查看解释。

## 主要文件与数据契约

以下路径相对仓库根目录。

| 位置 | 职责 |
| --- | --- |
| `data/demo/seed.json` | 苏州任务、点位关联和标准答案；当前 `seedVersion` 为 `frontend-demo-v3-suzhou-challenges` |
| `frontend/src/data/suzhouQuestionBank.ts` | 65 条推荐问题与主题定义 |
| `frontend/src/data/chatChoices.ts` | 点位、NPC、主题、已问过滤及首轮主线题推荐 |
| `frontend/src/pages/ChatPage.tsx`、`IntroPage.tsx` | 主题筛选与玩法说明 |
| `frontend/src/pages/TaskPage.tsx`、`frontend/src/types/index.ts` | 新题型控件、提交结构与只读状态 |
| `frontend/src/pages/SpotPage.tsx`、`MapPage.tsx`、`ReportPage.tsx` | 主线/挑战分组、真实回访与分类进度 |
| `backend/app/services/experience.py` | 难度变体、匹配题公开左右列表 |
| `backend/app/services/journey.py` | 答案校验、奖励、旧存档补题、主线推进和结局 |
| `backend/app/api/routes/public.py` | 已解锁题目列表、动态点位任务关联、答案字段过滤 |
| `backend/app/services/seed.py` | 新任务与剧情边的增量初始化 |

任务约定：

- `optional: true` 表示自选挑战；省略时按主线处理。
- `observation` 使用现有 `options: [{key, text}]`，提交单个选项字符串。
- `multi_select` 使用 `options`，提交 `string[]`，标准答案保存在服务端 `validation.answerKeys`；缺选、多选、重复或非法类型均不能通过。
- `matching` 对外提供独立的 `matchingLeft`、`matchingRight` 列表，元素均为 `{id, text}`；提交 `{左侧id: 右侧id}`。右侧使用固定独立 UUID 并打乱展示，标准映射保存在服务端 `validation.matchingAnswer`。
- 公共任务接口不返回 `answerKey`、`answerKeys`、`password`、`sortingAnswer`、`matchingAnswer`、`matchingPairs`。任务完成后才返回解释。
- 报告原有 `totalTaskCount`、`completedTaskCount`、`maxScore` 包含主线与挑战；另有 `requiredTaskCount`、`optionalTaskCount`、`completedRequiredTaskCount`、`completedOptionalTaskCount`。
- 旧旅程缺少新题状态时，快照按点位进度合成；首次提交再持久化。奖励仍通过原有 `request_id` 幂等与 `state_version` 并发校验结算。

## 启动与升级

本机预览在上一轮已完成：先用 SQLite backup 创建备份，再执行项目已有迁移及 seed，保留原用户、旅程与答题记录，重启 8000 端口后端。随后用临时匿名会话确认首站为 2 道主线 + 3 道挑战、报告为 6/15/260、答案字段未泄露，并删除临时会话。

备份位置：`/run/media/yao/Data/aic/.cache/city_story-before-suzhou-20261026-122031.db`。它仅用于本机恢复，不随 Git 提交。预览前端使用 5173，后端使用 8000；这些是交接时的运行记录，重启前需重新核对端口占用。

新环境在配置好自己的 `.env`、安装项目依赖后，从 `backend` 目录运行：

```bash
cd /run/media/yao/Data/aic/backend
.venv/bin/python -m alembic upgrade head
.venv/bin/python scripts/seed.py
.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

另开终端启动前端：

```bash
cd /run/media/yao/Data/aic/frontend
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

升级已有数据库前先备份。seed 采用 `insert_missing`，可重复执行、不会覆盖已有人工编辑、审核状态或用户存档；因此修改 JSON 中已有任务的题文、解释、配对 UUID，不会自动更新数据库中的同 ID 记录。曾导入中间版本题库的开发环境需要明确的数据更新方案，或另建隔离测试库，不能删除用户库来处理。旧的静态前端 `data/tasks.ts` 不作为运行时题库，实际任务来自后端。

## 验证结果与复现

上一轮最终实现已验证：

| 检查 | 结果与范围 |
| --- | --- |
| `npm run build`、`npm run lint` | 通过 |
| `npm test` | 14 个文件、67 项通过 |
| 后端定向回归 | 52 项通过，含旅程、难度、目录、推荐 |
| Playwright 两个测试文件 | 桌面 1440×900、手机 375×812，共 10 项通过 |

前后端单元检查：

```bash
cd /run/media/yao/Data/aic/frontend
npm run build
npm run lint
npm test

cd /run/media/yao/Data/aic/backend
.venv/bin/python -m pytest -q tests/test_journey.py tests/test_experience.py tests/test_catalog.py tests/test_recommendation.py
```

浏览器验收使用独立 SQLite 库、Mock 模型、前端 5189 与后端 8891，避免占用已有预览。复现时先确认这两个端口可用；为 `DATABASE_URL` 选择一个尚不存在的临时文件，以下为示例：

```bash
cd /run/media/yao/Data/aic/backend
export DATABASE_URL="sqlite:////tmp/aic-suzhou-handoff-e2e.db"
export APP_ENV=development
export LLM_PROVIDER=mock
export EMBEDDING_PROVIDER=none
export SESSION_COOKIE_SECURE=false
.venv/bin/python -m alembic upgrade head
.venv/bin/python scripts/seed.py
.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8891
```

另开终端生成仅供此次运行的本地 Playwright 配置：

```bash
cd /run/media/yao/Data/aic/frontend
cat > .suzhou-e2e.local.config.ts <<'EOF'
import config from './playwright.config'
import { defineConfig } from '@playwright/test'
export default defineConfig({
  ...config,
  use: { ...config.use, baseURL: 'http://127.0.0.1:5189' },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5189 --strictPort',
    url: 'http://127.0.0.1:5189',
    reuseExistingServer: true,
    timeout: 30000,
  },
})
EOF
env -u ALL_PROXY -u all_proxy -u HTTP_PROXY -u http_proxy -u HTTPS_PROXY -u https_proxy \
  API_PROXY_TARGET=http://127.0.0.1:8891 \
  PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/google/chrome/chrome \
  npm run test:e2e -- --config .suzhou-e2e.local.config.ts journey.spec.ts suzhou-challenges.spec.ts --workers=2
rm .suzhou-e2e.local.config.ts
```

Chrome 路径为本机已安装版本，其他机器按实际浏览器路径设置，或安装 Playwright Chromium 后省略该变量。测试结束后停止自己启动的隔离后端。截图和报告位于被 Git 忽略的 `frontend/test-results/`、`frontend/playwright-report/`；上轮地图和报告截图还写入 `.cache/e2e-visual/`。

测试覆盖主线三种结局、跳过全部挑战通关、观察/多选/配对提交、回访不退进度、主题筛选、刷新恢复及报告分组。后端另覆盖畸形答案、难度变体、旧存档补题和幂等奖励。受限沙箱下 TestClient 进入 lifespan 曾阻塞，放开本地执行限制后 52 项通过；不要将这一现象直接判断为 Python 或业务逻辑故障。后端仍有 Starlette/httpx 的依赖弃用警告。

## 接手边界与后续工作

本次只扩充苏州五站的演示内容和软件交互，没有新增可实地验证的景区入口，也未验证真实模型回答质量、真实定位或学习成效。推荐问题不是文化证据，回答仍需遵循原有 RAG 证据约束；已有资料的“演示/待审核”性质没有因题库扩充而变成人工核验。

后续若扩充新站点或文化领域，应同时补充有来源的知识、NPC 知识范围、任务与剧情边，再验证检索和答案；单独增加推荐问题不能保证系统有足够证据作答。若要支持已结束旅程继续挑战，需要单独设计完成态转换与报告冻结规则，目前结束后只读。

本次提交只包含上述功能源码、测试和两份苏州文档。工作区原有的 `DESIGN.md` 行尾变动、`.workbuddy/`、`frontend/.npmrc`、`AI-culture-current-version-delivery/` 保持原样，不纳入提交。交付目录副本没有自动同步；运行入口与后续开发以仓库根目录下 `frontend/`、`backend/`、`data/` 为准。数据库、备份、日志、依赖目录和 `.env` 不提交。
