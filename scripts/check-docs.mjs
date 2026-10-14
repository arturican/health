import { readdir, readFile, access } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))

async function markdownFiles(directory, recursive) {
  const files = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name)
    if (entry.isFile() && entry.name.endsWith('.md')) files.push(path)
    if (recursive && entry.isDirectory()) {
      files.push(...await markdownFiles(path, true))
    }
  }
  return files
}

const files = [
  ...await markdownFiles(root, false),
  ...await markdownFiles(resolve(root, 'docs'), true),
]
const failures = []
let checked = 0

for (const file of files) {
  const content = await readFile(file, 'utf8')
  for (const match of content.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)) {
    const target = match[1].split('#')[0]
    if (!target || /^[a-z][a-z\d+.-]*:/i.test(target)) continue
    checked += 1
    try {
      await access(resolve(dirname(file), decodeURIComponent(target)))
    } catch {
      failures.push(`${file}: ${target}`)
    }
  }
}

if (failures.length > 0) {
  console.error(`Отсутствующие локальные ссылки:\n${failures.join('\n')}`)
  process.exitCode = 1
} else {
  console.log(`Документация: ${files.length} файлов, ${checked} локальных ссылок — OK`)
}
