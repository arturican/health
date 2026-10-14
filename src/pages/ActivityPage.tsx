import { useDay } from '../ui/DayContext'
import { StepsForm } from './StepsForm'

export function ActivityPage() {
  const { day } = useDay()
  return <section className="page" aria-labelledby="activity-title">
    <h1 id="activity-title">Активность</h1>
    <StepsForm key={day} />
  </section>
}
