import { useFileReader } from '../ui/useFileReader'
import { useRef, useState } from 'react'
import { useDiaryQuery } from '../dataAccess'
import { getFile } from '../dataAccess'
import { BlobImage } from '../ui/BlobImage'
import { documentExtensions, downloadBlob } from '../ui/download'
import { Feedback, useAction } from '../ui/actions'

interface DocumentFileProps { fileId: string; title: string }

export function DocumentFile(props: DocumentFileProps) {
  return <DocumentFileState key={props.fileId} {...props} />
}

function DocumentFileState({ fileId, title }: DocumentFileProps) {
  const pending = useRef<ReturnType<typeof getFile> | null>(null)
  function readFile() {
    pending.current ??= getFile(fileId).finally(() => { pending.current = null })
    return pending.current
  }
  const [openedId, setOpenedId] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const button = useRef<HTMLButtonElement>(null)
  const opened = openedId === fileId
  return <>
    <button type="button" ref={button} aria-expanded={opened} aria-label={`${opened ? 'Закрыть' : 'Открыть'} вложение: ${title}`}
      onClick={() => { setOpenedId(opened ? null : fileId) }}>{opened ? 'Закрыть вложение' : 'Открыть вложение'}</button>
    {opened && <OpenedDocumentFile key={fileId + ':' + String(attempt)} fileId={fileId} title={title} readFile={readFile} onRetry={() => {
      setAttempt(value => value + 1)
      button.current?.focus()
    }} />}
  </>
}

function OpenedDocumentFile({ fileId, title, readFile, onRetry }: DocumentFileProps & { readFile: () => ReturnType<typeof getFile>; onRetry: () => void }) {
  const reader = useFileReader(fileId, readFile)
  const result = useDiaryQuery(async () => {
    try { return { fileId, file: await reader.readFile() } }
    catch { return { fileId, file: null } }
  }, [reader.identity])
  const action = useAction()
  if (result?.fileId !== fileId) return <p role="status">Загружаем вложение…</p>
  const file = result.file
  if (!file || file.purpose !== 'document') return <>
    <p role="alert">Не удалось открыть вложение документа.</p>
    <button type="button" onClick={onRetry}>Повторить открытие</button>
  </>
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
