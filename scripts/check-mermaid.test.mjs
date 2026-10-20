import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { test } from 'node:test'
import { checkMermaid } from './check-mermaid.mjs'

const good = ['flowchart TD\n A["Старт"] --> B["Конец"]',
  'erDiagram\n ACCOUNT ||--o{ FILE : owns\n ACCOUNT {\n uuid id PK\n }',
  'sequenceDiagram\n participant U as Пользователь\n participant A as API\n U->>A: GET']
const bad = ['flowchart TD\n A -->', 'erDiagram\n ACCOUNT ||-- B : owns',
  'sequenceDiagram\n A->B hi']

async function fixture(content, run) {
  const root = await mkdtemp(resolve(tmpdir(), 'health-mermaid-'))
  try {
    await mkdir(resolve(root, 'design'))
    await writeFile(resolve(root, 'design/README.md'), content)
    await run(root)
  } finally { await rm(root, { recursive: true, force: true }) }
}

test('official parser accepts flowchart ER sequence offline, including design scope', async () => {
  await fixture(good.map(text => '```mermaid\n' + text + '\n```').join('\n'), async root => {
    const result = await checkMermaid(root)
    assert.equal(result.checked, 3)
    assert.deepEqual(result.failures, [])
  })
})

test('invalid flowchart ER sequence fail individually', async () => {
  for (const text of bad) await fixture('~~~mermaid\n' + text + '\n~~~', async root => {
    const result = await checkMermaid(root)
    assert.equal(result.checked, 1)
    assert.equal(result.failures.length, 1)
    assert.ok(result.failures[0].includes('design/README.md:1'))
  })
})

test('Mermaid in Markdown example is ignored, long fences close only at their own length', async () => {
  await fixture('````md\n```mermaid\ninvalid\n```\n````\n~~~mermaid\n' + good[0] + '\n~~~', async root => {
    const result = await checkMermaid(root)
    assert.equal(result.checked, 1)
    assert.deepEqual(result.failures, [])
  })
})

test('empty and unterminated Mermaid blocks fail', async () => {
  for (const content of ['```mermaid\n```', '~~~mermaid\n' + good[0]]) {
    await fixture(content, async root => assert.equal((await checkMermaid(root)).failures.length, 1))
  }
})
