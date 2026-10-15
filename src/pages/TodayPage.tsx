import { useLiveQuery } from 'dexie-react-hooks'
import { getProfile } from '../data/profileRepository'
import { listWeights } from '../data/weightRepository'
import { db } from '../data/db'
import { BmiCard } from '../ui/BmiCard'
import { NutritionSummary } from '../ui/NutritionSummary'
import { EnergySummary } from '../ui/EnergySummary'
import { ActivitySummary } from '../ui/ActivitySummary'
import { useDay } from '../ui/DayContext'
import { WeightChart } from '../ui/WeightChart'
import { Icon } from '../ui/Icon'
import { useVisibility } from '../ui/useVisibility'
import { listFood } from '../data/foodRepository'
import { foodTotals, mealNames } from '../domain/nutrition'
import '../today.css'

export function TodayPage() {
  const { day } = useDay()
  const visibility = useVisibility()
  const result = useLiveQuery(() => db.transaction('r', db.profiles, db.weights, async () => ({ day, profile: await getProfile(), weights: await listWeights(day) })), [day])
  const data = result?.day === day ? result : undefined
  const weight = data?.weights[0] ?? null
  return <section className="page today-page" aria-labelledby="today-title">
    <header className="dashboard-heading">
    <p className="eyebrow">ЛИЧНОЕ ПРОСТРАНСТВО</p>
    <h1 id="today-title">Сегодня</h1>
    <p>Сводка за {day.split('-').reverse().join('.')}. Дневник хранится в этом браузере.</p>
    <nav className="actions quick-actions" aria-label="Быстрые записи">
      <a href="#weight">Записать вес</a>
      <a href="#nutrition">Записать еду</a>
      <a href="#activity">Открыть активность</a>
    </nav>
    </header>
    <div className="today-grid">
    {data?.profile === null && <section className="card onboarding-card" aria-labelledby="onboarding-title">
      <h2 id="onboarding-title">Начните с профиля</h2>
      <p>Рост и история веса нужны для справочного ИМТ. Питание и активность можно записывать сразу.</p>
      <a className="primary-link" href="#profile">Заполнить профиль</a>
    </section>}
    <NutritionSummary />
    <section className="card weight-summary" aria-labelledby="today-weight-title">
      <h2 id="today-weight-title"><Icon name="weight" /> Последнее измерение веса</h2>
      {weight && <strong className="metric-value">{String(weight.kg).replace('.', ',')} кг</strong>}
      {!data ? <p role="status">Загружаем измерение…</p> : weight === null ? <p>Нет измерений не позже выбранного дня.</p> : <p>{String(weight.kg).replace('.', ',')} кг, измерено {weight.date.split('-').reverse().join('.')}.</p>}
    </section>
    <ActivitySummary />
    </div>
    <div className="dashboard-content">
    <WeightChart weights={data?.weights ?? []} historyLink />
    <TodayMeals />
    {data && <BmiCard profile={data.profile} weight={weight} date={day} />}
    <section className="card materials-card" aria-labelledby="materials-title">
      <h2 id="materials-title">Материалы дневника</h2>
      {visibility?.value.showPhotos && <a href="#photos"><Icon name="photos" /> Фото по датам</a>}
      {visibility?.value.showDocuments && <a href="#documents"><Icon name="documents" /> Анализы и показатели</a>}
      <a href="#settings">Настройки и резервная копия</a>
    </section>
    <div className="energy-panel"><EnergySummary /></div>
    </div>
  </section>
}

function TodayMeals() {
  const { day } = useDay()
  const result = useLiveQuery(async () => ({ day, entries: await listFood(day) }), [day])
  const entries = result?.day === day ? result.entries : undefined
  const meals = (['breakfast', 'lunch', 'snack', 'dinner'] as const).map(meal => ({
    meal, kcal: entries ? foodTotals(entries.filter(entry => entry.meal === meal), false).kcal : null,
  }))
  const total = entries ? foodTotals(entries, false).kcal : null
  return <section className="card meals-card" aria-labelledby="today-meals-title">
    <h2 id="today-meals-title">Питание за день</h2>
    {entries === undefined ? <p role="status">Загружаем приёмы пищи…</p> : <>
      <p>Записей еды: {entries.length}. Учтены внесённые порции.</p>
      <ul className="meal-bars">{meals.map(({ meal, kcal }) => <li key={meal}>
        <span>{mealNames[meal]}</span><strong>{kcal === null ? 'нет записей' : `${kcal.toLocaleString('ru-RU', { maximumFractionDigits: 1 })} ккал`}</strong>
        {kcal !== null && total !== null && total > 0 && <meter aria-label={`${mealNames[meal]}: доля записанных калорий`} min={0} max={total} value={kcal} />}
      </li>)}</ul>
    </>}
    <a className="primary-link" href="#nutrition">Добавить еду</a>
  </section>
}
