// 兼容原有入口，实际执行有断言的桌面与移动完整旅程测试。
// 前置：后端已迁移、初始化，并监听8000。
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const cli = fileURLToPath(new URL('../node_modules/@playwright/test/cli.js', import.meta.url))
const args = [cli, 'test', 'e2e/journey.spec.ts']
if (process.argv[3]) args.push('--output', process.argv[3])
const result = spawnSync(process.execPath, args, {
  cwd: fileURLToPath(new URL('../', import.meta.url)),
  stdio: 'inherit',
  env: { ...process.env, E2E_BASE_URL: process.argv[2] ?? 'http://127.0.0.1:5173' },
})
if (result.error) console.error(result.error.message)
process.exit(result.status ?? 1)
