/** Reject the reproducible Windows TCP native crash in Node 24.0-24.15. */
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export function runtimeProblem(version, platform) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(version)
  if (!match || +match[1] < 22) return 'Node.js 22 or newer is required.'
  if (platform === 'win32' && +match[1] === 24 && +match[2] < 16)
    return 'Node 24.0-24.15 can crash natively on Windows during HTTP connections (nodejs/node#63620). Use the version in .node-version, Node 24.16+, or supported Node 22 LTS.'
  return null
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const problem = runtimeProblem(process.version, process.platform)
  if (problem) {
    process.stderr.write(`${problem}\n`)
    process.exitCode = 1
  }
}
