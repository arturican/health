import { useEffect, useRef, useState, type SyntheticEvent } from 'react'
import { type FullBackup } from '../domain/fullBackup'
import { readFullBackupFile } from '../media/fullBackupFile'
import { restoreFullBackup } from '../data/fullBackupRepository'
import { Field } from '../ui/Field'
import { Feedback, useAction } from '../ui/actions'

export function FullBackupImport() {
  const importing = useAction()
  const restoring = useAction()
  const [preview, setPreview] = useState<FullBackup | null>(null)
  const [consent, setConsent] = useState(false)
  const title = useRef<HTMLHeadingElement>(null)
  const form = useRef<HTMLFormElement>(null)
  const confirmation = useRef<HTMLFormElement>(null)
  useEffect(() => { if (preview) title.current?.focus() }, [preview])
  useEffect(() => { if (importing.error) form.current?.querySelector<HTMLInputElement>('input[type="file"]')?.focus() }, [importing.error])
  useEffect(() => { if (restoring.error) confirmation.current?.querySelector<HTMLInputElement>('input[type="checkbox"]')?.focus() }, [restoring.error])
  function checkFile(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault()
    if (importing.pending || restoring.pending) return
    const file = new FormData(event.currentTarget).get('fullBackup')
    setPreview(null)
    setConsent(false)
    restoring.reset()
    importing.run(async () => { setPreview(await readFullBackupFile(file)) }, 'Полная копия проверена; база не изменена')
  }
  function restore(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!preview || !consent || importing.pending || restoring.pending) return
    restoring.run(async () => {
      await restoreFullBackup(preview)
      setPreview(null)
      setConsent(false)
      importing.reset()
    }, 'Полная копия восстановлена')
  }
  useEffect(() => { if (restoring.message) form.current?.querySelector<HTMLInputElement>('input[type="file"]')?.focus() }, [restoring.message])
  const pending = importing.pending || restoring.pending
  return <section aria-labelledby="full-import-title">
    <h2 id="full-import-title">Восстановление полной копии</h2>
    <p>JSON до 200 MiB, вложения суммарно до 100 MiB. Проверка файла не меняет дневник.</p>
    <form ref={form} aria-label="Импорт полной копии" onSubmit={checkFile}>
      <Field label="Файл полной копии" name="fullBackup" type="file" accept=".json,application/json" required disabled={pending} onChange={() => { setPreview(null); setConsent(false); importing.reset(); restoring.reset() }} />
      <button type="submit" disabled={pending}>{importing.pending ? 'Проверяем полную копию…' : 'Проверить полную копию'}</button>
    </form>
    <Feedback error={importing.error} message={importing.message} />
    {preview && <section className="card" aria-label="Предпросмотр полной копии">
      <h3 ref={title} tabIndex={-1}>Предпросмотр полной копии</h3>
      <p>Версия: {preview.version}. Дата экспорта: {preview.text.exportedAt}.</p>
      <p>Профилей: {preview.text.profile ? 1 : 0}. Измерений веса: {preview.text.weights.length}. Продуктов: {preview.text.products.length}. Записей еды: {preview.text.foodEntries.length}. Отметок полноты: {preview.text.nutritionDays.length}.</p>
      <p>Итогов шагов: {preview.text.steps.length}. Тренировок: {preview.text.workouts.length}. Версий плана: {preview.text.energyPlans.length}.</p>
      <p>Фото: {preview.photos.length}. Документов: {preview.documents.length}. Показателей: {preview.labResults.length}. Настроек: {preview.metadata.length}.</p>
      <p>Файлов: {preview.files.length}. Размер вложений: {preview.files.reduce((sum, file) => sum + file.size, 0)} байт.</p>
      <p>Восстановление заменит весь дневник, включая фото, оригиналы документов, показатели и настройки. Пустые разделы удалят текущие записи этих разделов.</p>
      <p>Копия не зашифрована. Сохраните текущую полную копию перед заменой данных.</p>
      <form ref={confirmation} aria-label="Подтверждение полного восстановления" onSubmit={restore}>
        <Field label="Согласен заменить весь дневник, включая файлы и показатели" name="fullConsent" type="checkbox" required checked={consent} disabled={pending} onChange={event => { setConsent(event.target.checked) }} />
        <div className="actions">
          <button type="submit" disabled={!consent || pending}>{restoring.pending ? 'Восстанавливаем полную копию…' : 'Восстановить полную копию'}</button>
          <button type="button" disabled={pending} onClick={() => { setPreview(null); setConsent(false); importing.reset(); restoring.reset(); form.current?.querySelector<HTMLInputElement>('input[type="file"]')?.focus() }}>Отменить полную копию</button>
        </div>
      </form>
    </section>}
    <Feedback error={restoring.error} message={restoring.message} />
  </section>
}
