// Reproduce the backend seed from the existing, explicitly unreviewed frontend demo.
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
function literal(file, name, bracket) {
  const text = fs.readFileSync(path.join(root, 'frontend/src/data', `${file}.ts`), 'utf8')
  const anchor = new RegExp(`export const ${name}(?:\\s*:[^=]+)?\\s*=\\s*`)
  const match = anchor.exec(text)
  if (!match) throw new Error(`Missing export ${name}`)
  const tail = text.slice(match.index + match[0].length)
  const end = tail.indexOf(`\n${bracket}`)
  if (end < 0) throw new Error(`Missing literal terminator ${name}`)
  return vm.runInNewContext(`(${tail.slice(0, end + 2)})`, {}, { timeout: 1000 })
}
const seed = {
  seedVersion: 'frontend-demo-v1',
  isDemo: true,
  reviewStatus: 'pending',
  theme: literal('theme', 'demoTheme', '}'),
  spots: literal('theme', 'spots', ']'),
  roles: literal('roles', 'roles', ']'),
  npcs: literal('npcs', 'npcs', ']'),
  tasks: literal('tasks', 'tasks', ']'),
  clues: literal('clues', 'clues', ']'),
  codex: literal('codex', 'codexEntries', ']'),
  knowledge: literal('knowledge', 'knowledgeBase', ']'),
  endings: literal('endings', 'endings', ']'),
}
fs.mkdirSync(path.join(root, 'data/demo'), { recursive: true })
fs.writeFileSync(path.join(root, 'data/demo/seed.json'), `${JSON.stringify(seed, null, 2)}\n`)
console.log('Exported demonstration data; every cultural record remains pending review.')
