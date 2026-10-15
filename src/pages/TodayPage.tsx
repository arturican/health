import { useLiveQuery } from 'dexie-react-hooks'
import { getProfile } from '../data/profileRepository'
import { latestWeight } from '../data/weightRepository'
import { db } from '../data/db'
import { BmiCard } from '../ui/BmiCard'
import { NutritionSummary } from '../ui/NutritionSummary'
import { EnergySummary } from '../ui/EnergySummary'
import { ActivitySummary } from '../ui/ActivitySummary'
import { useDay } from '../ui/DayContext'

export function TodayPage() {
  const { day } = useDay()
  const result = useLiveQuery(() => db.transaction('r', db.profiles, db.weights, async () => ({ day, profile: await getProfile(), weight: await latestWeight(day) })), [day])
  const data = result?.day === day ? result : undefined
  return <section className="page today-page" aria-labelledby="today-title">
    <header className="day-hero">
    <p className="eyebrow">ВАШ ДЕНЬ В ДЕТАЛЯХ</p>
    <h1 id="today-title">Сегодня</h1>
    <p>Сводка за {day.split('-').reverse().join('.')}. Дневник хранится в этом браузере.</p>
    <nav className="actions quick-actions" aria-label="Быстрые записи">
      <a href="#weight">Записать вес</a>
      <a href="#nutrition">Записать еду</a>
      <a href="#activity">Открыть активность</a>
    </nav>
    <span className="hero-art" aria-hidden="true"><svg viewBox="0 0 180 180" fill="none"><circle cx="90" cy="90" r="70" /><circle cx="90" cy="90" r="48" /><path d="M28 92h33l16-34 27 65 17-31h31" /></svg></span>
    </header>
    <div className="today-grid">
    {data?.profile === null && <section className="card onboarding-card" aria-labelledby="onboarding-title">
      <h2 id="onboarding-title">Начните с профиля</h2>
      <p>Рост и история веса нужны для справочного ИМТ. Питание и активность можно записывать сразу.</p>
      <a className="primary-link" href="#profile">Заполнить профиль</a>
    </section>}
    <section className="card weight-summary" aria-labelledby="today-weight-title">
      <h2 id="today-weight-title">Последнее измерение веса</h2>
      {!data ? <p role="status">Загружаем измерение…</p> : data.weight === null ? <p>Нет измерений не позже выбранного дня.</p> : <p>{String(data.weight.kg).replace('.', ',')} кг, измерено {data.weight.date.split('-').reverse().join('.')}.</p>}
    </section>
    {data && <BmiCard profile={data.profile} weight={data.weight} date={day} />}
    <NutritionSummary />
    <ActivitySummary />
    <div className="energy-panel"><EnergySummary /></div>
    </div>
  </section>
}
