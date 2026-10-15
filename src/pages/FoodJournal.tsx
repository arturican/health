import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { deleteFood, listFood } from '../data/foodRepository'
import { mealNames, portion, type FoodEntry } from '../domain/nutrition'
import { useDay } from '../ui/DayContext'
import { Confirmation } from '../ui/Confirmation'
import { Feedback, useAction } from '../ui/actions'
import { FoodForm } from './FoodForm'
import { CopyMealForm } from './CopyMealForm'
import { exactNumber } from '../ui/exactNumber'

export function FoodJournal() {
  const { day } = useDay()
  const result = useLiveQuery(async () => ({ day, entries: await listFood(day) }), [day])
  const entries = result?.day === day ? result.entries : undefined
  const [editing, setEditing] = useState<FoodEntry | null>(null)
  const [deleting, setDeleting] = useState<FoodEntry | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [focusVersion, setFocusVersion] = useState(0)
  const action = useAction()
  const dialog = useRef<HTMLDivElement>(null)
  useEffect(() => { if (action.error && deleting) dialog.current?.querySelector<HTMLButtonElement>('button')?.focus() }, [action.error, deleting])
  function finishEditing() {
    setEditing(null)
    setFocusVersion(value => value + 1)
  }
  return (
    <>
      {editing ? <FoodForm key={editing.id} entry={editing} focusVersion={focusVersion} onCancel={finishEditing} onSaved={() => { finishEditing(); setNotice('Запись еды изменена') }} /> : <FoodForm key="new" focusVersion={focusVersion} onSaved={() => { setNotice(null); action.reset() }} />}
      <h2>Записи выбранного дня</h2>
      {entries === undefined ? <p role="status">Загружаем еду…</p> : entries.length === 0 ? <p>За этот день нет записей еды.</p> : <ul className="record-list" aria-label="Еда выбранного дня">
        {entries.map((entry, index) => {
          const nutrients = portion(entry.snapshot, entry.grams)
          return <li key={entry.id}>
            <div>
              <strong>{entry.snapshot.name}</strong>
              <p>{mealNames[entry.meal]} · {exactNumber(entry.grams)} г · {nutrients.kcal.toLocaleString('ru-RU', { maximumFractionDigits: 1 })} ккал</p>
              <p>Источник: {entry.snapshot.source || 'не указан'}</p>
              {entry.note && <p>{entry.note}</p>}
            </div>
            <div className="actions">
              <button type="button" className="secondary" disabled={action.pending} aria-label={`Изменить запись еды ${String(index + 1)}: ${entry.snapshot.name}`} onClick={() => { action.reset(); setEditing(entry); setFocusVersion(value => value + 1); setNotice(null) }}>Изменить</button>
              <button type="button" className="secondary" disabled={action.pending} aria-label={`Удалить запись еды ${String(index + 1)}: ${entry.snapshot.name}`} onClick={() => { action.reset(); setDeleting(entry); setNotice(null) }}>Удалить</button>
            </div>
          </li>
        })}
      </ul>}
      <div ref={dialog}>{deleting && <Confirmation question={`Удалить запись «${deleting.snapshot.name}» за ${deleting.date.split('-').reverse().join('.')}?`} pending={action.pending} onCancel={() => { setDeleting(null); action.reset() }} onConfirm={() => {
        action.run(async () => { await deleteFood(deleting.id); setDeleting(null); finishEditing() }, 'Запись еды удалена')
      }} />}</div>
      {!editing && <Feedback error={action.error} message={notice ?? action.message} />}
      {entries && <CopyMealForm entries={entries} />}
    </>
  )
}
