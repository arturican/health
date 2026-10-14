import { useId } from 'react'
import { weightPlot } from '../domain/weightPlot'
import type { Weight } from '../domain/profile'

function amount(value: number) { return String(value).replace('.', ',') }
function dateLabel(value: string) { return value.split('-').reverse().join('.') }

export function WeightChart({ weights }: { weights: readonly Weight[] }) {
  const title = useId()
  const description = useId()
  const plot = weightPlot(weights)
  const first = plot.points[0]
  const last = plot.points.at(-1)
  return <section className="card" aria-labelledby={title}>
    <h2 id={title}>График веса</h2>
    {!first || !last || plot.minimum === null || plot.maximum === null ? <p>Для графика нужны измерения веса.</p> : <>
      <svg className="weight-chart" viewBox="0 0 600 240" role="img" aria-labelledby={title} aria-describedby={description}>
        <desc id={description}>Измерения от {dateLabel(first.date)} до {dateLabel(last.date)}; диапазон {amount(plot.minimum)}–{amount(plot.maximum)} кг. Все числа доступны в истории измерений ниже.</desc>
        <path d="M40 40V200H560" fill="none" stroke="#52636b" vectorEffect="non-scaling-stroke" />
        {plot.points.length > 1 && <polyline points={plot.points.map(point => `${String(point.x)},${String(point.y)}`).join(' ')} fill="none" stroke="#244b3e" strokeWidth={2} vectorEffect="non-scaling-stroke" />}
        {plot.points.map(point => <circle key={point.id} cx={point.x} cy={point.y} r={5} fill="#244b3e"><title>{dateLabel(point.date)}: {amount(point.kg)} кг</title></circle>)}
      </svg>
      <p>Период: {dateLabel(first.date)} — {dateLabel(last.date)}.</p>
      <p>Диапазон шкалы: {amount(plot.minimum)}–{amount(plot.maximum)} кг. Шкала адаптирована к измерениям и может не начинаться с нуля.</p>
      <p>Горизонтальные интервалы соответствуют календарным дням. Между точками проведена линия; измерений в пропущенные дни нет.</p>
      <p>Все даты и значения доступны в списке «История веса» ниже. График показывает записи, без оценки состояния здоровья.</p>
    </>}
  </section>
}
