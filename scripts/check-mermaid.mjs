import { readFile } from 'node:fs/promises'
import { relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { JSDOM } from 'jsdom'
import { markdownFiles } from './check-docs.mjs'

// DOMPurify needs a DOM for quoted labels. JSDOM defaults disable scripts/resources.
const dom = new JSDOM('<!doctype html><html><body></body></html>')
globalThis.window = dom.window
globalThis.document = dom.window.document
const { default: mermaid } = await import('mermaid')
mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' })

export function mermaidBlocks(content) {
  const blocks = []
  let fence = null
  let block = null
  for (const [index, line] of content.split(/\r?\n/).entries()) {
    const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line)
    if (fence) {
      if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) {
        if (block) blocks.push({ ...block, closed: true })
        fence = null
        block = null
      } else if (block) block.text += line + '\n'
    } else if (marker) {
      fence = marker[1]
      if (/^mermaid(?:\s|$)/.test(marker[2].trim())) block = { text: '', line: index + 1 }
    }
  }
  if (block) blocks.push({ ...block, closed: false })
  return blocks
}

export async function checkMermaid(root) {
  const failures = []
  let checked = 0
  for (const file of await markdownFiles(root)) {
    for (const block of mermaidBlocks(await readFile(file, 'utf8'))) {
      checked += 1
      try {
        if (!block.closed) throw new Error('Unclosed Mermaid fence')
        if (!await mermaid.parse(block.text)) throw new Error('Invalid Mermaid')
      } catch (error) {
        failures.push(relative(root, file) + ':' + block.line + ': ' +
          (error instanceof Error ? error.message.split('\n')[0] : 'Invalid Mermaid'))
      }
    }
  }
  return { checked, failures }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await checkMermaid(fileURLToPath(new URL('../', import.meta.url)))
  if (result.failures.length) {
    console.error('Ошибки Mermaid:\n' + result.failures.join('\n'))
    process.exitCode = 1
  } else console.log('Mermaid: ' + result.checked + ' блоков — syntax OK (без rendering)')
}
