import { useDiaryQuery } from '../dataAccess'
import { getFile } from '../dataAccess'
import { BlobImage } from '../ui/BlobImage'
import { documentExtensions, downloadBlob } from '../ui/download'
import { Feedback, useAction } from '../ui/actions'

interface DocumentFileProps { fileId: string; title: string }

export function DocumentFile({ fileId, title }: DocumentFileProps) {
  const result = useDiaryQuery(async () => {
    try { return { fileId, file: await getFile(fileId) } }
    catch { return { fileId, file: null } }
  }, [fileId])
  const action = useAction()
  if (result?.fileId !== fileId) return <p role="status">Загружаем вложение…</p>
  const file = result.file
  if (!file || file.purpose !== 'document') return <p role="alert">Не удалось открыть вложение документа.</p>
  return <>
    {file.mime === 'application/pdf' ? <p>PDF доступен для скачивания. Откройте его в своей программе просмотра.</p> : <BlobImage blob={file.blob} alt={`Документ: ${title}`} />}
    <div className="actions">
      <button type="button" disabled={action.pending} aria-label={`Скачать оригинал: ${title}`} onClick={() => {
        action.run(() => {
          try { downloadBlob(file.blob, `health-document-${file.id}.${documentExtensions[file.mime]}`) }
          catch { throw new Error('Не удалось скачать файл документа') }
        }, 'Скачивание оригинала начато')
      }}>{action.pending ? 'Готовим файл…' : 'Скачать оригинал'}</button>
    </div>
    <Feedback error={action.error} message={action.message} />
  </>
}
