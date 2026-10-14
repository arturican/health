export function downloadJson(contents: string, filename: string): void {
  const blob = new Blob([contents], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  try {
    document.body.append(anchor)
    anchor.click()
  } finally {
    anchor.remove()
    queueMicrotask(() => { URL.revokeObjectURL(url) })
  }
}
