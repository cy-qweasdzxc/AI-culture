# 前后端端到端验证

测试对真实 FastAPI API 执行完整六任务旅程，不使用请求拦截或客户端注入进度。模型和文化资料遵循后端配置，默认未审核资料的问答明确拒答，剧情规则仍可发放演示谜题线索。

在仓库根目录打开 PowerShell，先准备独立测试数据库并启动后端：

```powershell
New-Item -ItemType Directory -Force .cache
Set-Location backend
$env:DATABASE_URL='sqlite:///../.cache/e2e.db'
$env:APP_ENV='development'
$env:LLM_PROVIDER='mock'
$env:EMBEDDING_PROVIDER='none'
# 以下凭据仅供独立测试进程；不要复制生产账号或修改用户 .env。
$env:ADMIN_USERNAME='admin'
$env:ADMIN_PASSWORD='e2e-only-local-fixture'
$fixtureSecretBytes = New-Object byte[] 32
$fixtureRandom = [Security.Cryptography.RandomNumberGenerator]::Create()
$fixtureRandom.GetBytes($fixtureSecretBytes)
$env:ADMIN_JWT_SECRET = [BitConverter]::ToString($fixtureSecretBytes).Replace('-', '').ToLowerInvariant()
$fixtureRandom.Dispose()
.\.venv\Scripts\python.exe -m alembic upgrade head
.\.venv\Scripts\python.exe scripts/seed.py
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

另开终端执行：

```powershell
Set-Location frontend
npm.cmd ci
npm.cmd exec playwright install chromium
$env:E2E_ADMIN_USERNAME='admin'
$env:E2E_ADMIN_PASSWORD='e2e-only-local-fixture'
npm.cmd run test:e2e
```

Playwright 自动启动前端5173，或复用已运行的开发服务。启动前应核对端口归属，不停止不明进程。桌面项目为1440×900，移动项目为375×812。当前10项测试覆盖两视口各三种结局、后台错误登录及合成资料治理流程；未提供 `E2E_ADMIN_PASSWORD` 时治理两项明确跳过，不算完整验收。完成后输出HTML报告、各结局体验报告截图到被Git忽略的 `playwright-report/` 和 `test-results/`，并保留地图、报告、后台截图于根 `.cache/e2e-visual/`。

后台测试仅新增 `e2e-fiction-*` 的自有虚构文本，来源使用保留测试域 `example.invalid`。自动勾选确认仅用来验证合成夹具的审核控制，不是对文化资料作人工审核，也不审原始14条pending演示知识。测试最后编辑正文撤销该夹具审核及索引。这些记录不属于正式文化知识或真实RAG模型评测结果。

已安装Chrome时可省略浏览器下载：

```powershell
$env:PLAYWRIGHT_CHROMIUM_EXECUTABLE='C:\Program Files\Google\Chrome\Application\chrome.exe'
npm.cmd run test:e2e
```

`node scripts/e2e-smoke.mjs [baseURL] [outputDirectory]` 是相同测试的兼容入口。测试必须通过完整断言后才报告成功。`e2e-map-check.mjs` 只检查地图页面，不代表全流程测试；未配置地图Key时只验证示意路线，真实地图底图与位置服务仍需另行验证。
