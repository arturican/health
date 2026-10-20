import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { test } from 'node:test'
import { checkDocs, anchors } from './check-docs.mjs'

async function fixture(files, run) {
  const root = await mkdtemp(resolve(tmpdir(), 'health-docs-'))
  try {
    for (const [name, content] of Object.entries(files)) {
      const path = resolve(root, name)
      await mkdir(resolve(path, '..'), { recursive: true })
      await writeFile(path, content)
    }
    await run(root)
  } finally { await rm(root, { recursive: true, force: true }) }
}

test('valid Cyrillic, encoded paths/fragments, duplicate headings, links and inline code headings', async () => {
  await fixture({
    'README.md': '[a](docs/Мой%20файл.md#привет-мир)\n[b](docs/Мой%20файл.md#привет-мир-1)\n[c](docs/Мой%20файл.md#привет-мир-2)\n[d](docs/Мой%20файл.md#%D0%BF%D0%BE%D0%BB%D0%B5-account_tokens)\n[e](docs/Мой%20файл.md#anchor)',
    'docs/Мой файл.md': '# Привет, мир!\n## Привет мир\n## Привет мир\n## Поле `account_tokens`\n<a name="anchor"></a>\n',
  }, async root => {
    const result = await checkDocs(root)
    assert.equal(result.checked, 5)
    assert.deepEqual(result.failures, [])
  })
})

test('missing fragments and files, including design Markdown, fail', async () => {
  await fixture({
    'README.md': '# App\n[a](#absent)\n[b](missing.md)',
    'design/desktop/README.md': '[c](../../docs/model.md#absent)',
    'docs/model.md': '# Model',
  }, async root => {
    const result = await checkDocs(root)
    assert.equal(result.files, 3)
    assert.equal(result.failures.length, 3)
    assert.ok(result.failures.some(item => item.includes('design/desktop/README.md')))
  })
})

test('fenced examples do not define headings or links; ignored generated and dependency trees', async () => {
  await fixture({
    'README.md': '# App\n~~~md\n# Fake\n[a](missing.md)\n~~~\n[b](#app)',
    'node_modules/pkg/README.md': '[x](missing.md)',
    'dist/README.md': '[x](missing.md)',
    '.git/README.md': '[x](missing.md)',
  }, async root => {
    const result = await checkDocs(root)
    assert.equal(result.files, 1)
    assert.deepEqual(result.failures, [])
  })
})

test('reference links, explicit anchor, setext heading and angle paths', async () => {
  await fixture({
    'README.md': '[a][target]\n[target]: <docs/a b.md#custom>\n[b](<docs/a b.md#title> "Link title")\n[c](docs/a%20b.md#visible-link)',
    'docs/a b.md': 'Title\n=====\n<a id="custom"></a>\n## **Visible** [link](https://example.test)\n',
  }, async root => {
    const result = await checkDocs(root)
    assert.equal(result.checked, 3)
    assert.deepEqual(result.failures, [])
  })
})

test('a bad reference target, encoded malformed fragment and fake fenced heading fail', async () => {
  await fixture({
    'README.md': '[a][bad]\n[bad]: docs/page.md#missing\n[b](docs/page.md#%ZZ)\n[c](docs/page.md#fake)',
    'docs/page.md': '````md\n# fake\n```\n````\n# Real',
  }, async root => assert.equal((await checkDocs(root)).failures.length, 3))
})

test('code identifiers keep underscores and HTML anchors do not consume heading suffixes', async () => {
  assert.equal(anchors('<a id="title"></a>\n# Title\n## Title').has('title-2'), false)
  await fixture({
    'README.md': '[a](#change_revision_id)\n[b](#title-1)\n<a id="title"></a>\n# Title\n## Title\n## `change_revision_id`',
  }, async root => assert.deepEqual((await checkDocs(root)).failures, []))
})

test('intraword underscores differ from emphasis and invalid code slug is rejected', async () => {
  await fixture({
    'README.md': '[a](#поле-accounttokenhash)\n[b](#plain_account_token_hash)\n[c](#поле-account_token_hash)\n[d](#emphasis-text)\n## Поле `account_token_hash`\n## plain_account_token_hash\n## _Emphasis_ **text**',
  }, async root => {
    const result = await checkDocs(root)
    assert.deepEqual(result.failures, ['README.md: #поле-accounttokenhash'])
  })
})
