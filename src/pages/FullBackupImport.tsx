import { useEffect, useRef, useState, type SyntheticEvent } from 'react'
import { type FullBackup } from '../domain/fullBackup'
import { readFullBackupFile } from '../media/fullBackupFile'
import { Field } from '../ui/Field'
import { Feedback, useAction } from '../ui/actions'

export function FullBackupImport() {
  const importing = useAction()
  const [preview, setPreview] = useState<FullBackup | null>(null)
  const title = useRef<HTMLHeadingElement>(null)
  const form = useRef<HTMLFormElement>(null)
  useEffect(() => { if (preview) title.current?.focus() }, [preview])
  useEffect(() => { if (importing.error) form.current?.querySelector<HTMLInputElement>('input[type="file"]')?.focus() }, [importing.error])
  function checkFile(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault()
    const file = new FormData(event.currentTarget).get('fullBackup')
    setPreview(null)
    importing.run(async () => { setPreview(await readFullBackupFile(file)) }, 'Полная копия проверена; база не изменена')
  }
  return <section aria-labelledby="full-import-title">
    <h2 id="full-import-title">Восстановление полной копии</h2>
    <p>JSON до 200 MiB, вложения суммарно до 100 MiB. Проверка файла не меняет дневник.</p>
    <form ref={form} aria-label="Импорт полной копии" onSubmit={checkFile}>
      <Field label="Файл полной копии" name="fullBackup" type="file" accept=".json,application/json" required disabled={importing.pending} onChange={() => { setPreview(null); importing.reset() }} />
      <button type="submit" disabled={importing.pending}>{importing.pending ? 'Проверяем полную копию…' : 'Проверить полную копию'}</button>
    </form>
    <Feedback error={importing.error} message={importing.message} />
    {preview && <section className="card" aria-label="Предпросмотр полной копии">
      <h3 ref={title} tabIndex={-1}>Предпросмотр полной копии</h3>
      <p>Версия: {preview.version}. Дата экспорта: {preview.text.exportedAt}.</p>
      <p>Профилей: {preview.text.profile ? 1 : 0}. Измерений веса: {preview.text.weights.length}. Продуктов: {preview.text.products.length}. Записей еды: {preview.text.foodEntries.length}. Отметок полноты: {preview.text.nutritionDays.length}.</p>
      <p>Итогов шагов: {preview.text.steps.length}. Тренировок: {preview.text.workouts.length}. Версий плана: {preview.text.energyPlans.length}.</p>
      <p>Фото: {preview.photos.length}. Документов: {preview.documents.length}. Показателей: {preview.labResults.length}. Настроек: {preview.metadata.length}.</p>
      <p>Файлов: {preview.files.length}. Размер вложений: {preview.files.reduce((sum, file) => sum + file.size, 0)} байт.</p>
      <button type="button" onClick={() => { setPreview(null); importing.reset(); form.current?.querySelector<HTMLInputElement>('input[type="file"]')?.focus() }}>Отменить полную копию</button>
    </section>}
  </section>
}
