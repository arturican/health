import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { deleteFood, listFood } from '../data/foodRepository'
import { mealNames, portion, type FoodEntry } from '../domain/nutrition'
import { useDay } from '../ui/DayContext'
import { Confirmation } from '../ui/Confirmation'
import { Feedback, useAction } from '../ui/actions'
import { FoodForm } from './FoodForm'

export function FoodJournal() {
  const { day } = useDay()
  const result = useLiveQuery(async () => ({ day, entries: await listFood(day) }), [day])
  const entries = result?.day === day ? result.entries : undefined
  const [editing, setEditing] = useState<FoodEntry | null>(null)
  const [deleting, setDeleting] = useState<FoodEntry | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const action = useAction()
  return (
    <>
      {editing ? <FoodForm key={editing.id} entry={editing} onCancel={() => { setEditing(null) }} onSaved={() => { setEditing(null); setNotice('Запись еды изменена') }} /> : <FoodForm key="new" />}
      <h2>Записи выбранного дня</h2>
      {entries === undefined ? <p role="status">Загружаем еду…</p> : entries.length === 0 ? <p>За этот день нет записей еды.</p> : <ul className="record-list" aria-label="Еда выбранного дня">
        {entries.map((entry, index) => {
          const nutrients = portion(entry.snapshot, entry.grams)
          return <li key={entry.id}>
            <div>
              <strong>{entry.snapshot.name}</strong>
              <p>{mealNames[entry.meal]} · {entry.grams.toLocaleString('ru-RU')} г · {nutrients.kcal.toLocaleString('ru-RU', { maximumFractionDigits: 1 })} ккал</p>
              <p>Источник: {entry.snapshot.source || 'не указан'}</p>
              {entry.note && <p>{entry.note}</p>}
            </div>
            <div className="actions">
              <button type="button" className="secondary" disabled={action.pending} aria-label={`Изменить запись еды ${String(index + 1)}: ${entry.snapshot.name}`} onClick={() => { setEditing(entry); setNotice(null) }}>Изменить</button>
              <button type="button" className="secondary" disabled={action.pending} aria-label={`Удалить запись еды ${String(index + 1)}: ${entry.snapshot.name}`} onClick={() => { setDeleting(entry); setNotice(null) }}>Удалить</button>
            </div>
          </li>
        })}
      </ul>}
      {deleting && <Confirmation question={`Удалить запись «${deleting.snapshot.name}» за ${deleting.date.split('-').reverse().join('.')}?`} pending={action.pending} onCancel={() => { setDeleting(null) }} onConfirm={() => {
        action.run(async () => { await deleteFood(deleting.id); setDeleting(null); setEditing(null) }, 'Запись еды удалена')
      }} />}
      {!editing && <Feedback error={action.error} message={notice ?? action.message} />}
    </>
  )
}
