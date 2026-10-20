import { useEffect, useState } from 'react'

interface BlobImageProps { blob: Blob; alt: string; width?: number | undefined; height?: number | undefined }
export function BlobImage({ blob, alt, width, height }: BlobImageProps) {
  const [resource, setResource] = useState<{ blob: Blob; url: string } | null>(null)
  const [failedBlob, setFailedBlob] = useState<Blob | null>(null)
  useEffect(() => {
    let alive = true
    let url: string | null = null
    void Promise.resolve().then(() => {
      if (!alive) return
      url = URL.createObjectURL(blob)
      setResource({ blob, url })
    }).catch(() => { if (alive) setFailedBlob(blob) })
    return () => { alive = false; if (url) URL.revokeObjectURL(url) }
  }, [blob])
  if (failedBlob === blob) return <p role="alert">Не удалось показать изображение.</p>
  const url = resource?.blob === blob ? resource.url : null
  if (!url) return <p role="status">Готовим изображение…</p>
  return <img className="file-image" src={url} alt={alt} width={width} height={height} onError={() => { setFailedBlob(blob) }} />
}
