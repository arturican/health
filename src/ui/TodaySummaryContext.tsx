import { createContext, useContext, type PropsWithChildren } from 'react'
import { getTodaySummary, useDiaryQueryState } from '../dataAccess'
import { useDay } from './DayContext'

interface TodayQuery { data: Awaited<ReturnType<typeof getTodaySummary>> | undefined; current: boolean }
const TodaySummaryContext = createContext<TodayQuery | null>(null)

export function TodaySummaryProvider({ children }: PropsWithChildren) {
  const { day } = useDay()
  const query = useDiaryQueryState(() => getTodaySummary(day), [day])
  return <TodaySummaryContext value={query}>{children}</TodaySummaryContext>
}
export const useTodaySummary = () => useContext(TodaySummaryContext)
