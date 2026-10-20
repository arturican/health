import { readdir, readFile, access } from 'node:fs/promises'
import { dirname, extname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ignored = new Set(['.git', 'node_modules', 'dist', 'build-api', 'coverage',
  'playwright-report', 'test-results', '.cache'])

export async function markdownFiles(directory) {
  const files = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name)
    if (entry.isFile() && entry.name.endsWith('.md')) files.push(path)
    if (entry.isDirectory() && !ignored.has(entry.name)) files.push(...await markdownFiles(path))
  }
  return files
}

function withoutFences(content) {
  let fence = null
  return content.split(/\r?\n/).map(line => {
    const marker = /^ {0,3}([`~]{3,})/.exec(line)?.[1]
    if (fence) {
      if (marker?.[0] === fence[0] && marker.length >= fence.length
        && new RegExp('^ {0,3}[' + fence[0] + ']+\\s*$').test(line)) fence = null
      return ''
    }
    if (marker && [...marker].every(char => char === marker[0])) { fence = marker; return '' }
    return line
  }).join('\n')
}

function visibleText(text) {
  const codes = []
  const protectedText = text.replace(/(`+)(.*?)\1/g, (_match, _delimiter, code) =>
    '\uE000' + (codes.push(code) - 1) + '\uE000')
  return protectedText.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '').replace(/(\*{1,3})(.+?)\1/g, '$2')
    .replace(/(?<![\p{L}\p{N}])(_{1,3})(.+?)\1(?![\p{L}\p{N}])/gu, '$2')
    .replace(/[~]/g, '').replace(/\uE000(\d+)\uE000/g, (_match, index) => codes[Number(index)])
}

export function anchors(content) {
  const result = new Set()
  const generated = new Set()
  const lines = withoutFences(content).split('\n')
  for (let index = 0; index < lines.length; index += 1) {
    for (const match of lines[index].matchAll(/<a\s+[^>]*(?:id|name)=["']([^"']+)["'][^>]*>/g)) {
      result.add(match[1])
    }
    const heading = /^ {0,3}#{1,6}\s+(.+?)(?:\s+#+)?$/.exec(lines[index])?.[1]
      ?? (index + 1 < lines.length && /^ {0,3}(?:=+|-+)\s*$/.test(lines[index + 1])
        && lines[index].trim() ? lines[index].trim() : null)
    if (heading === null) continue
    const base = visibleText(heading).trim().toLowerCase()
      .replace(/[^\p{L}\p{N}\p{M}_ -]/gu, '').replaceAll(' ', '-')
    let slug = base
    for (let suffix = 1; generated.has(slug); suffix += 1) slug = base + '-' + suffix
    generated.add(slug)
    result.add(slug)
  }
  return result
}

function destinations(content) {
  const text = withoutFences(content)
  const targets = []
  // Inline destinations, including angle-quoted paths and one level of balanced parentheses.
  for (const match of text.matchAll(/!?\[[^\]\n]*\]\(\s*(<[^>\n]+>|(?:[^()\n]|\([^()\n]*\))+)\s*\)/g)) {
    const raw = match[1].trim()
    targets.push(raw.startsWith('<') ? /^<([^>]+)>/.exec(raw)?.[1] ?? raw : raw.replace(/\s+["'][^"']*["']$/, ''))
  }
  const references = new Map()
  for (const match of text.matchAll(/^ {0,3}\[([^\]]+)\]:\s*(<[^>\n]+>|\S+)/gm)) {
    references.set(match[1].trim().toLowerCase(), match[2].replace(/^<|>$/g, ''))
  }
  for (const match of text.matchAll(/!?\[([^\]\n]+)\]\[([^\]\n]*)\]/g)) {
    const id = (match[2] || match[1]).trim().toLowerCase()
    targets.push(references.get(id) ?? 'missing-reference:' + id)
  }
  return targets
}

export async function checkDocs(root) {
  const files = await markdownFiles(root)
  const failures = []
  const cache = new Map()
  let checked = 0
  async function headingIds(path) {
    if (!cache.has(path)) cache.set(path, anchors(await readFile(path, 'utf8')))
    return cache.get(path)
  }
  for (const file of files) {
    for (const target of destinations(await readFile(file, 'utf8'))) {
      if (target.startsWith('missing-reference:')) {
        failures.push(relative(root, file) + ': ' + target)
        continue
      }
      if (/^[a-z][a-z\d+.-]*:/i.test(target) || target.startsWith('//')) continue
      checked += 1
      try {
        const separator = target.indexOf('#')
        const pathPart = decodeURIComponent(separator < 0 ? target : target.slice(0, separator))
        const fragment = separator < 0 ? '' : decodeURIComponent(target.slice(separator + 1))
        const path = pathPart ? resolve(dirname(file), pathPart) : file
        if (relative(root, path).startsWith('..')) throw new Error('Outside repository')
        await access(path)
        if (fragment && extname(path) === '.md' && !(await headingIds(path)).has(fragment)) {
          throw new Error('Missing heading')
        }
      } catch { failures.push(relative(root, file) + ': ' + target) }
    }
  }
  return { files: files.length, checked, failures }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await checkDocs(fileURLToPath(new URL('../', import.meta.url)))
  if (result.failures.length) {
    console.error('Ошибки локальных ссылок:\n' + result.failures.join('\n'))
    process.exitCode = 1
  } else {
    console.log('Документация: ' + result.files + ' файлов, ' + result.checked + ' локальных ссылок — OK')
  }
}
