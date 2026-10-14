export function downloadJson(contents: string, filename: string): void {
  downloadBlob(new Blob([contents], { type: 'application/json' }), filename)
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  let anchor: HTMLAnchorElement | null = null
  try {
    anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    document.body.append(anchor)
    anchor.click()
  } finally {
    anchor?.remove()
    queueMicrotask(() => { URL.revokeObjectURL(url) })
  }
}
