import { BlobImage } from './BlobImage'
import { useDiaryQuery } from '../dataAccess'
import { useFileReader } from './useFileReader'

interface FileImageProps { fileId: string; alt: string; width?: number; height?: number }

export function FileImage({ fileId, alt, width, height }: FileImageProps) {
  const { identity, readFile } = useFileReader(fileId)
  const result = useDiaryQuery(async () => {
    try { return { fileId, file: await readFile(), failed: false } }
    catch { return { fileId, file: null, failed: true } }
  }, [identity])
  const data = result?.fileId === fileId ? result : undefined
  if (!data) return <p role="status">Загружаем изображение…</p>
  if (data.failed || !data.file) return <p role="alert">Не удалось открыть файл изображения.</p>
  return <BlobImage blob={data.file.blob} alt={alt} width={width} height={height} />
}
