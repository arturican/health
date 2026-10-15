import { useEffect, useRef, useState } from 'react'
import { clearDiary } from '../data/clearDiary'
import { Confirmation } from '../ui/Confirmation'
import { Feedback, useAction } from '../ui/actions'

export function DeleteDiary({ onCleared }: { onCleared?: () => void }) {
  const [confirming, setConfirming] = useState(false)
  const action = useAction()
  const button = useRef<HTMLButtonElement>(null)
  const dialog = useRef<HTMLDivElement>(null)
  useEffect(() => { if (action.error) dialog.current?.querySelector<HTMLButtonElement>('button')?.focus() }, [action.error])
  useEffect(() => { if (action.message) button.current?.focus() }, [action.message])
  return <section aria-labelledby="delete-diary-title">
    <h2 id="delete-diary-title">Удаление дневника</h2>
    <p>Удаляются профиль, записи, продукты, планы, фото, оригиналы документов, показатели и настройки в этом браузере. Отменить удаление можно только восстановлением резервной копии.</p>
    <p>Скачанные копии остаются на устройстве; удаляйте их отдельно при необходимости.</p>
    <button ref={button} type="button" disabled={action.pending} onClick={() => { action.reset(); setConfirming(true) }}>Удалить весь дневник</button>
    <div ref={dialog}>
      {confirming && <Confirmation question="Удалить все данные дневника, включая фото, документы, показатели и настройки? Без резервной копии восстановить их не получится." pending={action.pending}
        onCancel={() => { setConfirming(false); action.reset() }}
        onConfirm={() => { action.run(async () => { await clearDiary(); setConfirming(false); onCleared?.() }, 'Все данные дневника удалены') }} />}
    </div>
    <Feedback error={action.error} message={action.message} />
  </section>
}
