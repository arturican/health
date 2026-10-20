import { exportFullBackup } from '../dataAccess'
import { serializeFullBackup } from '../domain/fullBackup'
import { localDate } from '../domain/input'
import { downloadJson } from '../ui/download'
import { Feedback, useAction } from '../ui/actions'

export function FullBackupExport() {
  const action = useAction()
  return <section className="card" aria-labelledby="full-export-title">
    <h2 id="full-export-title">Полная резервная копия</h2>
    <p>Содержит все записи, фотографии, оригиналы документов, ручные показатели и настройки. Копия до 200 MiB; общий размер вложений до 100 MiB. Большой дневник может не поместиться в JSON даже при соблюдении лимита вложений.</p>
    <p>Копия не зашифрована. Храните скачанный файл в безопасном месте.</p>
    <div className="actions">
      <button type="button" disabled={action.pending} onClick={() => {
        action.run(async () => {
          const backup = await exportFullBackup()
          downloadJson(serializeFullBackup(backup), `health-diary-full-${localDate()}.json`)
        }, 'Полная копия подготовлена')
      }}>{action.pending ? 'Готовим полную копию…' : 'Скачать полную копию'}</button>
    </div>
    <Feedback error={action.error} message={action.message} />
  </section>
}
