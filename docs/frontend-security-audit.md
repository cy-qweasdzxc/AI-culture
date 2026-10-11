# 前端依赖安全审计

2026-10-11工程维护复验：完整npm审计仍为5 high、生产依赖0项；官方registry查询braces最新版仍为3.0.3。未强制迁移Tailwind4，锁文件与既有依赖环境保留。

2026-10-11全栈验收轮次复跑：`npm audit --omit=dev` 为 critical 0 / high 0 / moderate 0 / low 0，全量审计仍为 5 high（Tailwind 构建链，`braces` 上游无补丁版）。

**原始审计 JSON 未长期留存**：早前保存于工程外 `D:/Code/AIC-maintenance/logs/`（该目录现为损坏的空目录项）与本工程 `.cache/` 下的副本已按冗余清理。审计结论随时可重放验证，无需依赖历史文件：

```bash
cd frontend
npm.cmd audit --omit=dev --json   # 生产依赖
npm.cmd audit --json              # 全量（含构建链）
```

以下 2026-10-10 记录作为历史保留。

执行日期：2026-10-10（Asia/Shanghai）。本记录来自实际 npm 官方注册表审计，不代表全面渗透测试。

## 执行方法

在 `frontend/` 目录执行：

```powershell
npm.cmd audit --json --registry=https://registry.npmjs.org
npm.cmd audit --omit=dev --json --registry=https://registry.npmjs.org
npm.cmd ls vite vitest react-router-dom @playwright/test postcss-selector-parser tailwindcss
```

完整审计命令在发现问题时返回非零状态，属于预期结果。原始本机JSON保存在 `.cache/frontend-audit.json`、`.cache/frontend-audit-final.json`、`.cache/frontend-audit-runtime.json`，这些是被Git忽略的运行产物。

## 实际修复与结果

初次全量审计15项：2 critical、6 high、7 moderate。修复后全量审计5项：0 critical、5 high、0 moderate。生产依赖审计为0项。

| 依赖 | 实际最终版本 | 修复方式 |
|---|---|---|
| React / React DOM | 18.3.1 | 保留既有界面框架 |
| React Router DOM | 7.18.4 | 6.x无覆盖此次漏洞的修补版，升级7.x并验证既有路由API |
| Vite | 6.4.4 | 升级安全修补版本，保留React插件4.x |
| Vitest | 4.1.11 | 修复文件读取风险；升级后原tinypool依赖移除 |
| postcss-selector-parser | 7.1.6 | npm overrides覆盖Tailwind3依赖的旧解析器，并重新构建与测试 |
| Tailwind CSS | 3.4.19 | 保留现有CSS与设计令牌；尚有下述构建依赖风险 |
| Playwright | 1.63.0 | 锁定包用于桌面与移动端真实API验证 |

Vite Windows文件访问风险的官方修补版本包含6.4.3；本仓库使用6.4.4。[Vite官方安全公告](https://github.com/vitejs/vite/security/advisories/GHSA-fx2h-pf6j-xcff)。Vitest文件读取风险按公告修补到4.1.11。[Vitest官方安全公告](https://github.com/vitest-dev/vitest/security/advisories/GHSA-82fw-gwwq-j7x9)。React Router的非可信路径重定向风险已升级到修补后的7.x版本。[React Router官方安全公告](https://github.com/remix-run/react-router/security/advisories/GHSA-wrjc-x8rr-h8h6)。

## 剩余风险与约束

5项high均来自同一开发构建依赖链：Tailwind3 → chokidar / fast-glob / micromatch → braces3.0.3。npm登记的根问题为深层嵌套glob模式导致栈耗尽；当前官方注册表的最新braces仍是3.0.3，无安全补丁可直接覆盖。npm建议Tailwind4大版本迁移，本轮保留现有样式框架并明确记录风险。[braces漏洞公告](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)。

### 2026-10-10 接手复验（实测）

重新执行 `npm.cmd audit --json --registry=https://registry.npmjs.org` 与 `--omit=dev` 变体，结果与首次记录一致：

| 项 | 首次记录 | 本次复验 |
|---|---|---|
| 全量审计（415 个依赖） | 5 high、0 critical、0 moderate | **5 high、0 critical、0 moderate、0 low** |
| 生产依赖审计 | 0 项 | **0 项** |

本次实测确认的依赖链与版本：

```
tailwindcss@3.4.19
├── chokidar@3.6.0        → braces@3.0.3
└── micromatch@4.0.8      → braces@3.0.3 (deduped)
```

`npm audit` 给出的唯一修复是 `tailwindcss@4.3.3`，且 `isSemVerMajor = true`；查询 npm 注册表确认 **braces 最新版本仍为 3.0.3**（2.3.1、2.3.2、3.0.0–3.0.3，无补丁版）。因此「无兼容补丁、只能靠 Tailwind4 大版本迁移」的结论仍然成立。

### 隔离措施已实测验证，但需精确表述

本次在一个隔离目录用 `npm ci --omit=dev` 实际安装生产依赖：只装入 14 个包、`node_modules` 顶层 15 项，**tailwindcss / chokidar / braces / micromatch / fast-glob / postcss / postcss-selector-parser 全部不存在**，该目录内生产审计为 0 项。运行时暴露面同样已核实：`vite.config.ts` 的 `server.host` 为 `127.0.0.1`；`deploy/nginx/nginx.conf` 只从 `root /usr/share/nginx/html` 提供已构建静态文件并反向代理 `/api/`；`frontend/Dockerfile` 为多阶段构建，最终镜像只 `COPY --from=build /app/dist`。

**精确表述**：该脆弱依赖存在于**本地开发**与 **Docker 构建阶段**（构建阶段执行 `npm ci`，包含 devDependencies），**不存在于生产安装集、浏览器运行包与最终镜像**。构建阶段处理的是本仓库自有的固定源文件、CSS 与 Tailwind 配置，不接受用户上传内容，因此实际暴露面受此约束；仍不得向构建或开发服务注入外部上传的 CSS、glob、Tailwind 配置或不可信源码。

生产依赖审计0项只说明此次npm已知漏洞数据库未返回生产依赖问题，不意味着没有未知风险。升级Tailwind4或等待上游兼容补丁仍是后续事项；按本项目任务约束，不得在大版本迁移的兼容性未验证、界面未复验前贸然升级。

## 验证边界

安全升级后重新执行TypeScript/生产构建、前端9项单元、lint，以及桌面和375px移动端完整业务旅程与管理端未登录/错误凭据测试。具体执行结果与耗时见 `docs/test-results.md`；没有把未配置的真实LLM、腾讯底图或生产PostgreSQL容器称为已验证。

## 2026-10-10 最终审查复验（18:02–18:05，北京时间）

以当前工作区及既有 `package-lock.json` 为准，无依赖升级。重新查询 npm 官方审计端点：完整依赖仍为5 high、0 critical、0 moderate、0 low；生产依赖 `--omit=dev` 为0。原始结果保留于 `frontend/.cache/final-audit-full.json` 和 `frontend/.cache/final-audit-production.json`。完整审计退出码1来自上述已知开发构建链，生产审计退出码0。

实际重新执行 `npm.cmd run lint`、`npm.cmd test`、`npm.cmd run build`：lint通过，Vitest 9/9通过（4.51秒），构建83模块成功（8.47秒），JS341.57KB/107.96KB gzip、CSS28.21KB/6.04KB gzip。沙箱首轮因Windows `realpath` 的EPERM导致测试未收集、构建失败；获准使用非沙箱进程后完成复验，未将环境失败归因于业务代码，也未删除测试。

追加的浏览器验收使用隔离 `.cache/final-e2e.db`、Mock和无Embedding配置。后台新增/审核/发布/撤审只操作明确标记的合成fiction夹具及保留测试域 `example.invalid`，不把自动确认当作正式文化审核。三种结局及后台治理的实际数量与耗时在本次 `docs/test-results.md` 最终审查记录中更新；它们不是模型质量或文化准确率结论。
