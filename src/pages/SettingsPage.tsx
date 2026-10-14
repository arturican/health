import { useState, type SyntheticEvent } from 'react'
import { exportTextBackup } from '../data/backupRepository'
import { serializeTextBackup, type TextBackup } from '../domain/backup'
import { localDate } from '../domain/input'
import { downloadJson } from '../ui/download'
import { Feedback, useAction } from '../ui/actions'
import { readBackupFile } from '../ui/backupFile'
import { Field } from '../ui/Field'

export function SettingsPage() {
  const action = useAction()
  const importing = useAction()
  const [preview, setPreview] = useState<TextBackup | null>(null)
  function checkFile(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault()
    const file = new FormData(event.currentTarget).get('backup')
    setPreview(null)
    importing.run(async () => {
      if (!(file instanceof File)) throw new Error('Выберите файл копии')
      setPreview(await readBackupFile(file))
    }, 'Файл проверен; база не изменена')
  }
  return (
    <section className="page" aria-labelledby="settings-title">
      <h1 id="settings-title">Настройки</h1>
      <h2>Резервная копия</h2>
      <p>Текстовая копия содержит профиль, историю веса, каталог продуктов, записи еды и полноту дней. Файлы не включены.</p>
      <div className="actions">
        <button type="button" disabled={action.pending} onClick={() => {
          action.run(async () => {
            const backup = await exportTextBackup()
            downloadJson(serializeTextBackup(backup), `health-diary-text-${localDate()}.json`)
          }, 'Текстовая копия подготовлена')
        }}>{action.pending ? 'Готовим копию…' : 'Скачать текстовую копию'}</button>
      </div>
      <Feedback error={action.error} message={action.message} />
      <form aria-label="Импорт текстовой копии" onSubmit={checkFile}>
        <Field label="Файл текстовой копии" name="backup" type="file" accept=".json,application/json" required disabled={importing.pending} onChange={() => { setPreview(null) }} />
        <button type="submit" disabled={importing.pending}>{importing.pending ? 'Проверяем…' : 'Проверить файл'}</button>
      </form>
      <Feedback error={importing.error} message={importing.message} />
      {preview && <section className="card" aria-label="Предпросмотр текстовой копии">
        <h3>Предпросмотр текстовой копии</h3>
        <p>Версия: {preview.version}. Дата экспорта: {preview.exportedAt}.</p>
        <p>Профилей: {preview.profile ? 1 : 0}. Измерений веса: {preview.weights.length}. Продуктов: {preview.products.length}. Записей еды: {preview.foodEntries.length}. Отметок полноты: {preview.nutritionDays.length}.</p>
        <p>Восстановление заменяет перечисленные данные. Фото и документы сохраняются.</p>
        <button type="button" onClick={() => { setPreview(null) }}>Отменить импорт</button>
      </section>}
      <p>Копия не зашифрована. Данные приложения хранятся в этом браузере; очистка данных браузера удаляет дневник.</p>
    </section>
  )
}
