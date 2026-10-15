import { useDay } from '../ui/DayContext'
import { StepsForm } from './StepsForm'
import { WorkoutJournal } from './WorkoutJournal'
import { ActivityOverview } from '../ui/ActivityOverview'
import '../activity.css'

export function ActivityPage() {
  const { day } = useDay()
  return <section className="page activity-page" aria-labelledby="activity-title">
    <h1 id="activity-title">Активность</h1>
    <p>Шаги и тренировки · движение в вашем ритме.</p>
    <ActivityOverview />
    <div className="activity-layout">
    <div className="activity-input">
    <StepsForm key={day} />
    <section className="card"><h2>Как учитывается расход</h2><p>Ручная оценка тренировки хранится с записью. Шаги и тренировки не прибавляются повторно к общему суточному расходу.</p><a href="#settings">План питания и расхода</a></section>
    </div>
    <WorkoutJournal key={`workouts-${day}`} />
    </div>
  </section>
}
