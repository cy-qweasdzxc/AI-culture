import assert from 'node:assert/strict'
import test from 'node:test'
import { runtimeProblem } from './check-node.mjs'

test('rejects affected Windows runtimes before a server or browser test starts', () => {
  for (const version of ['v24.0.0', '24.15.0', 'v24.15.9'])
    assert.match(runtimeProblem(version, 'win32'), /nodejs\/node#63620/)
})
test('accepts patched Node 24 and supported Node 22 LTS', () => {
  for (const version of ['v22.22.0', 'v24.16.0', 'v24.22.1'])
    assert.equal(runtimeProblem(version, 'win32'), null)
})
test('does not invent the Windows restriction on other systems', () => {
  assert.equal(runtimeProblem('v24.15.0', 'linux'), null)
  assert.equal(runtimeProblem('v24.15.0', 'darwin'), null)
})
test('rejects missing, invalid and older runtimes', () => {
  for (const version of ['', 'invalid', 'v20.19.0'])
    assert.match(runtimeProblem(version, 'win32'), /22 or newer/)
})
