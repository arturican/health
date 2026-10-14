import { useState, type SyntheticEvent } from 'react'
import { exportTextBackup, restoreTextBackup } from '../data/backupRepository'
import { serializeTextBackup, type TextBackup } from '../domain/backup'
import { localDate } from '../domain/input'
import { downloadJson } from '../ui/download'
import { Feedback, useAction } from '../ui/actions'
import { readBackupFile } from '../ui/backupFile'
import { Field } from '../ui/Field'
import { EnergyPlanSettings } from './EnergyPlanSettings'
import { StorageBoundary } from '../ui/StorageBoundary'

export function SettingsPage() {
  const action = useAction()
  const importing = useAction()
  const restoring = useAction()
  const [preview, setPreview] = useState<TextBackup | null>(null)
  const [consent, setConsent] = useState(false)
  function checkFile(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault()
    const file = new FormData(event.currentTarget).get('backup')
    setPreview(null)
    setConsent(false)
    restoring.reset()
    importing.run(async () => {
      if (!(file instanceof File)) throw new Error('Выберите файл копии')
      setPreview(await readBackupFile(file))
    }, 'Файл проверен; база не изменена')
  }
  function restore(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!preview || !consent) return
    restoring.run(async () => {
      await restoreTextBackup(preview)
      importing.reset()
      setPreview(null)
      setConsent(false)
    }, 'Текстовая копия восстановлена')
  }
  return (
    <section className="page" aria-labelledby="settings-title">
      <h1 id="settings-title">Настройки</h1>
      <StorageBoundary><EnergyPlanSettings /></StorageBoundary>
      <h2>Резервная копия</h2>
      <p>Текстовая копия содержит профиль, историю веса, каталог продуктов, записи еды, полноту дней, шаги, тренировки и версии энергетических планов. Файлы не включены.</p>
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
        <Field label="Файл текстовой копии" name="backup" type="file" accept=".json,application/json" required disabled={importing.pending || restoring.pending} onChange={() => { setPreview(null); setConsent(false); importing.reset(); restoring.reset() }} />
        <button type="submit" disabled={importing.pending || restoring.pending}>{importing.pending ? 'Проверяем…' : 'Проверить файл'}</button>
      </form>
      <Feedback error={importing.error} message={importing.message} />
      {preview && <section className="card" aria-label="Предпросмотр текстовой копии">
        <h3>Предпросмотр текстовой копии</h3>
        <p>Версия: {preview.version}. Дата экспорта: {preview.exportedAt}.</p>
        <p>Профилей: {preview.profile ? 1 : 0}. Измерений веса: {preview.weights.length}. Продуктов: {preview.products.length}. Записей еды: {preview.foodEntries.length}. Отметок полноты: {preview.nutritionDays.length}.</p>
        <p>Итогов шагов: {preview.steps.length}. Тренировок: {preview.workouts.length}. Версий плана: {preview.energyPlans.length}.</p>
        <p>Восстановление заменяет перечисленные данные. Фото и документы сохраняются.</p>
        <p>Пустой раздел в копии означает удаление текущих записей этого раздела.</p>
        <form aria-label="Подтверждение восстановления" onSubmit={restore}>
          <Field label="Согласен заменить текстовые данные дневника" name="consent" type="checkbox" required checked={consent} disabled={restoring.pending} onChange={event => { setConsent(event.target.checked) }} />
          <div className="actions">
            <button type="submit" disabled={!consent || restoring.pending}>{restoring.pending ? 'Восстанавливаем…' : 'Восстановить текстовую копию'}</button>
            <button type="button" disabled={restoring.pending} onClick={() => { setPreview(null); setConsent(false) }}>Отменить импорт</button>
          </div>
        </form>
      </section>}
      <Feedback error={restoring.error} message={restoring.message} />
      <p>Копия не зашифрована. Данные приложения хранятся в этом браузере; очистка данных браузера удаляет дневник.</p>
    </section>
  )
}
