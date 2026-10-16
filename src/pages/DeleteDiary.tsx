import { useEffect, useRef, useState } from 'react'
import { clearDiary, prepareDiaryChange, type DiaryConfirmation } from '../dataAccess'
import { Confirmation } from '../ui/Confirmation'
import { Feedback, useAction } from '../ui/actions'

export function DeleteDiary({ onCleared }: { onCleared?: () => void }) {
  const [confirming, setConfirming] = useState<DiaryConfirmation | null>(null)
  const action = useAction()
  const button = useRef<HTMLButtonElement>(null)
  const dialog = useRef<HTMLDivElement>(null)
  const returnFocus = useRef(false)
  useEffect(() => {
    if (!confirming && !action.pending && returnFocus.current) {
      returnFocus.current = false
      button.current?.focus()
    }
  }, [confirming, action.pending])
  useEffect(() => { if (action.error) (dialog.current?.querySelector<HTMLButtonElement>('button') ?? button.current)?.focus() }, [action.error])
  useEffect(() => { if (action.message) button.current?.focus() }, [action.message])
  return <section aria-labelledby="delete-diary-title">
    <h2 id="delete-diary-title">Удаление дневника</h2>
    <p>Удаляются профиль, записи, продукты, планы, фото, оригиналы документов, показатели и настройки дневника. Отменить удаление можно только восстановлением резервной копии.</p>
    <p>Скачанные копии остаются на устройстве; удаляйте их отдельно при необходимости.</p>
    <button ref={button} type="button" disabled={action.pending || confirming !== null} onClick={() => {
      action.run(async () => { setConfirming(await prepareDiaryChange()) }, '')
    }}>Удалить весь дневник</button>
    <div ref={dialog}>
      {confirming && <Confirmation question="Удалить все данные дневника, включая фото, документы, показатели и настройки? Без резервной копии восстановить их не получится." pending={action.pending}
        onCancel={() => { returnFocus.current = true; setConfirming(null); action.reset() }}
        onConfirm={() => { action.run(async () => { await clearDiary(confirming); returnFocus.current = true; setConfirming(null); onCleared?.() }, 'Все данные дневника удалены') }} />}
    </div>
    <Feedback error={action.error} message={action.message} />
  </section>
}
