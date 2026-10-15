import { useId } from 'react'
import { calculateBmi, adultBmiCategory, bmiCategories } from '../domain/bmi'
import { ageOn, localDate } from '../domain/input'
import type { Profile, Weight } from '../domain/profile'

interface BmiCardProps {
  profile: Profile | null
  weight: Weight | null
  date?: string
}

export function BmiCard({ profile, weight, date = localDate() }: BmiCardProps) {
  const title = useId()
  const measurement = weight && weight.date <= date ? weight : null
  let bmi: number | null = null
  let failed = false
  try { bmi = calculateBmi(measurement?.kg ?? null, profile?.heightCm ?? null) }
  catch { failed = true }
  const age = profile?.birthDate && profile.birthDate <= date ? ageOn(profile.birthDate, date) : null
  const category = adultBmiCategory(bmi, age)
  return (
    <section className="card" aria-labelledby={title}>
      <h2 id={title}>ИМТ (справочно)</h2>
      {failed ? <>
        <p role="alert">Не удалось рассчитать ИМТ по этим параметрам. Проверьте рост в профиле и измерение веса.</p>
        <div className="actions"><a href="#profile">Проверить профиль</a><a href="#weight">Проверить измерение веса</a></div>
      </> : bmi === null ? <p>Нужны рост в профиле и измерение веса не позже даты оценки.</p> : (
        <>
          <p><strong className="metric-value">{bmi.toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</strong> кг/м²</p>
          <p>По текущему росту и измерению от {measurement?.date.split('-').reverse().join('.')}.</p>
          <p>{category ? `Справочная категория CDC: ${bmiCategories[category]}.` : 'Взрослая категория доступна с 20 лет при известной дате рождения.'}</p>
          <p>Число округлено для отображения; категория учитывает точное значение.</p>
        </>
      )}
      <p>ИМТ не различает мышцы, жир и костную массу. Это не диагноз и не оценка состава тела.</p>
      <a href="https://www.cdc.gov/bmi/adult-calculator/bmi-categories.html" target="_blank" rel="noopener noreferrer">Источник и ограничения CDC</a>
    </section>
  )
}
