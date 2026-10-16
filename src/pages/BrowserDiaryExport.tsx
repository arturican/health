import { exportBrowserDiary } from '../legacy/browserExport'
import { serializeFullBackup } from '../domain/fullBackup'
import { downloadJson } from '../ui/download'
import { Feedback, useAction } from '../ui/actions'

export function BrowserDiaryExport() {
  const action = useAction()
  return <section className="card" aria-labelledby="browser-export-title">
    <h2 id="browser-export-title">Прежний дневник в браузере</h2>
    <p>Если вы пользовались прежней версией на этом устройстве и адресе сайта, скачайте её полную копию. Исходная база останется без изменений; данные не отправляются на сервер.</p>
    <p>Для переноса в аккаунт выберите скачанный файл в восстановлении полной копии и проверьте состав перед подтверждением замены.</p>
    <button type="button" disabled={action.pending} onClick={() => {
      action.run(async () => {
        downloadJson(serializeFullBackup(await exportBrowserDiary()), 'health-diary-previous-browser.json')
      }, 'Копия прежнего дневника подготовлена')
    }}>{action.pending ? 'Читаем прежний дневник…' : 'Скачать прежний дневник из браузера'}</button>
    <Feedback error={action.error} message={action.message} />
  </section>
}
