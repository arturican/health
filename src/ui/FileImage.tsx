import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { getFile } from '../data/fileRepository'

interface FileImageProps { fileId: string; alt: string; width?: number; height?: number }

export function FileImage({ fileId, alt, width, height }: FileImageProps) {
  const result = useLiveQuery(async () => {
    try { return { fileId, file: await getFile(fileId), failed: false } }
    catch { return { fileId, file: null, failed: true } }
  }, [fileId])
  const data = result?.fileId === fileId ? result : undefined
  const blob = data?.file?.blob ?? null
  const [resource, setResource] = useState<{ blob: Blob; url: string } | null>(null)
  const [failedBlob, setFailedBlob] = useState<Blob | null>(null)
  useEffect(() => {
    if (!blob) return
    let alive = true
    let url: string | null = null
    void Promise.resolve().then(() => {
      if (!alive) return
      url = URL.createObjectURL(blob)
      setResource({ blob, url })
    }).catch(() => { if (alive) setFailedBlob(blob) })
    return () => { alive = false; if (url) URL.revokeObjectURL(url) }
  }, [blob])
  if (!data) return <p role="status">Загружаем изображение…</p>
  if (data.failed || !data.file) return <p role="alert">Не удалось открыть файл изображения.</p>
  if (failedBlob === blob) return <p role="alert">Не удалось показать изображение.</p>
  const url = resource?.blob === blob ? resource.url : null
  if (!url) return <p role="status">Готовим изображение…</p>
  return <img className="file-image" src={url} alt={alt} width={width} height={height} onError={() => { setFailedBlob(blob) }} />
}
