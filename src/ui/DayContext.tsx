import { createContext, useContext, useState, type PropsWithChildren } from 'react'
import { localDate, parseDate } from '../domain/input'

interface DayState { day: string; setDay: (value: string) => void }
const DayContext = createContext<DayState | null>(null)

export function DayProvider({ children }: PropsWithChildren) {
  const [day, updateDay] = useState(localDate)
  function setDay(value: string) {
    const date = parseDate(value)
    if (date > localDate()) throw new Error('День дневника не может быть в будущем')
    updateDay(date)
  }
  return <DayContext value={{ day, setDay }}>{children}</DayContext>
}

export function useDay(): DayState {
  const state = useContext(DayContext)
  if (!state) throw new Error('Для выбора дня нужен DayProvider')
  return state
}
