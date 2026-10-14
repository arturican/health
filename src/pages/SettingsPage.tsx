import { exportTextBackup } from '../data/backupRepository'
import { serializeTextBackup } from '../domain/backup'
import { localDate } from '../domain/input'
import { downloadJson } from '../ui/download'
import { Feedback, useAction } from '../ui/actions'

export function SettingsPage() {
  const action = useAction()
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
      <p>Копия не зашифрована. Данные приложения хранятся в этом браузере; очистка данных браузера удаляет дневник.</p>
    </section>
  )
}
