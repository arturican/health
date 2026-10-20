import { useDiaryQueryState, listEnergyPlans } from '../dataAccess'
import type { EnergyPlan } from '../domain/energyPlan'
import { calculateRestingEnergy } from '../domain/restingEnergy'
import { EnergyPlanForm } from './EnergyPlanForm'
import { Icon } from '../ui/Icon'

const sexNames = { none: 'не выбран', male: 'мужской', female: 'женский' }
function amount(value: number | null) { return value === null ? 'нет данных' : value.toLocaleString('ru-RU', { maximumFractionDigits: 0 }) }
function precise(value: number | null) { return value === null ? 'нет данных' : String(value).replace('.', ',') }

export function EnergyPlanSettings() {
  const { data: plans, current } = useDiaryQueryState(() => listEnergyPlans(), [])
  const latest = plans?.reduce<EnergyPlan | null>((result, plan) => !result || plan.revision > result.revision ? plan : result, null) ?? null
  return <section className="card" aria-labelledby="energy-settings-title">
    <h2 id="energy-settings-title"><Icon name="nutrition" /> Цель и оценка расхода</h2>
    <p>Новая версия действует с указанной даты. Прежние версии сохраняются вместе с параметрами расчёта.</p>
    <p>Общая оценка расхода включает активность; ручные оценки тренировок сохраняются отдельно в журнале.</p>
    {plans !== undefined && <EnergyPlanForm latest={latest} disabled={!current} />}
    <h3>История версий плана</h3>
    {plans === undefined ? <p role="status">Загружаем версии плана…</p> : plans.length === 0 ? <p>План пока не задан.</p> : <ul className="record-list" aria-label="Версии энергетического плана">
      {plans.map(plan => {
        const snapshot = plan.snapshot
        const resting = calculateRestingEnergy({ kg: snapshot.kg, heightCm: snapshot.heightCm, age: snapshot.age, formulaSex: snapshot.formulaSex })
        return <li key={plan.id}>
          <strong>Версия {plan.revision}, действует с {plan.effectiveFrom}</strong>
          <p>Цель: {precise(plan.goalKcal)} ккал/сутки.</p>
          <p>{plan.method === 'none' ? 'Оценка расхода не задана.' : plan.method === 'manual' ? `Общая ручная оценка: ${precise(plan.manualKcal)} ккал/сутки.` : `Коэффициент активности: ${precise(plan.factor)}. Расход в покое (оценка): ${amount(resting)} ккал/сутки.`}</p>
          <p>Снимок на {plan.createdOn}: рост {precise(snapshot.heightCm)} см; вес {precise(snapshot.kg)} кг{snapshot.weightDate && ` от ${snapshot.weightDate}`}; возраст {precise(snapshot.age)} лет; параметр формулы: {sexNames[snapshot.formulaSex]}.</p>
          {plan.source && <p>Источник оценки: {plan.source}</p>}
        </li>
      })}
    </ul>}
    <p>Расход в покое — справочная оценка по Mifflin–St Jeor для взрослых 19–78 лет, без индивидуального измерения. <a href="https://pubmed.ncbi.nlm.nih.gov/2305711/" target="_blank" rel="noopener noreferrer">Источник формулы</a>.</p>
  </section>
}
