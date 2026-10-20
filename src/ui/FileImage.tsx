import { BlobImage } from './BlobImage'
import { useDiaryQuery } from '../dataAccess'
import { getFile } from '../dataAccess'

interface FileImageProps { fileId: string; alt: string; width?: number; height?: number }

export function FileImage({ fileId, alt, width, height }: FileImageProps) {
  const result = useDiaryQuery(async () => {
    try { return { fileId, file: await getFile(fileId), failed: false } }
    catch { return { fileId, file: null, failed: true } }
  }, [fileId])
  const data = result?.fileId === fileId ? result : undefined
  if (!data) return <p role="status">Загружаем изображение…</p>
  if (data.failed || !data.file) return <p role="alert">Не удалось открыть файл изображения.</p>
  return <BlobImage blob={data.file.blob} alt={alt} width={width} height={height} />
}
