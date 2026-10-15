import { useId, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { weightPlot } from '../domain/weightPlot'
import type { Weight } from '../domain/profile'
import { SelectField } from './Field'
import '../chart.css'

function amount(value: number) { return String(value).replace('.', ',') }
function dateLabel(value: string) { return value.split('-').reverse().join('.') }

export function WeightChart({ weights, historyLink = false }: { weights: readonly Weight[]; historyLink?: boolean }) {
  const title = useId()
  const description = useId()
  const hint = useId()
  const gradient = useId()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const plot = weightPlot(weights)
  const first = plot.points[0]
  const last = plot.points.at(-1)
  const selected = plot.points.find(point => point.id === selectedId) ?? last
  const coordinates = plot.points.map(point => `${String(point.x)},${String(point.y)}`).join(' ')

  function choosePoint(event: MouseEvent<HTMLButtonElement>) {
    if (!first || event.detail === 0) return
    const bounds = event.currentTarget.getBoundingClientRect()
    const x = (event.clientX - bounds.left) / bounds.width * 600
    const nearest = plot.points.reduce((best, point) => Math.abs(point.x - x) < Math.abs(best.x - x) ? point : best, first)
    setSelectedId(nearest.id)
  }
  function movePoint(event: KeyboardEvent<HTMLButtonElement>) {
    const index = plot.points.findIndex(point => point.id === selected?.id)
    const destinations: Record<string, number> = { ArrowLeft: index - 1, ArrowRight: index + 1, Home: 0, End: plot.points.length - 1 }
    const destination = destinations[event.key]
    if (destination === undefined) return
    event.preventDefault()
    const point = plot.points[Math.max(0, Math.min(plot.points.length - 1, destination))]
    if (point) setSelectedId(point.id)
  }

  return <section className="card chart-card" aria-labelledby={title}>
    <h2 id={title}>График веса</h2>
    {!first || !last || !selected || plot.minimum === null || plot.maximum === null ? <p>Для графика нужны измерения веса.</p> : <>
      <div className="chart-heading">
        <output className="chart-readout" aria-label="Выбранное измерение" aria-live="polite" aria-atomic="true">
          <strong>{amount(selected.kg)} <span>кг</span></strong>
          <time dateTime={selected.date}>{dateLabel(selected.date)}</time>
        </output>
        <span className="chart-badge">Измерений: {String(plot.points.length)}</span>
      </div>
      <div className="chart-layout">
        <div className="chart-scale" aria-hidden="true">
          <span className="chart-unit">кг</span>
          {plot.maximum === plot.minimum ? <span className="chart-middle">{amount(plot.minimum)}</span> : <>
            <span className="chart-top">{amount(plot.maximum)}</span>
            <span className="chart-bottom">{amount(plot.minimum)}</span>
          </>}
        </div>
        <div className="chart-canvas">
          <svg className="weight-chart" viewBox="0 0 600 240" preserveAspectRatio="none" role="img" aria-labelledby={title} aria-describedby={description}>
            <desc id={description}>Измерения от {dateLabel(first.date)} до {dateLabel(last.date)}; диапазон {amount(plot.minimum)}–{amount(plot.maximum)} кг. Все числа доступны в истории измерений{historyLink ? ' в разделе «Вес».' : ' ниже.'}</desc>
            <defs><linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#1a73e8" stopOpacity="0.16" /><stop offset="100%" stopColor="#1a73e8" stopOpacity="0.01" /></linearGradient></defs>
            {[40, 80, 120, 160, 200].map(y => <path key={y} d={`M40 ${String(y)}H560`} className="chart-grid-line" />)}
            {[40, 170, 300, 430, 560].map(x => <path key={x} d={`M${String(x)} 40V200`} className="chart-grid-line chart-grid-vertical" />)}
            {plot.points.length > 1 && <>
              <polygon points={`${String(first.x)},200 ${coordinates} ${String(last.x)},200`} fill={`url(#${gradient})`} />
              <polyline points={coordinates} className="chart-line" vectorEffect="non-scaling-stroke" />
            </>}
            <path d={`M${String(selected.x)} 30V210`} className="chart-crosshair" vectorEffect="non-scaling-stroke" />
          </svg>
          {plot.points.map(point => <span key={point.id} className="chart-sample-dot" style={{ left: `${String(point.x / 6)}%`, top: `${String(point.y / 2.4)}%` }} aria-hidden="true" />)}
          <span className="chart-selected" style={{ left: `${String(selected.x / 6)}%`, top: `${String(selected.y / 2.4)}%` }} aria-hidden="true" />
          <button className="chart-interaction" type="button" aria-label="Выбрать измерение на графике" aria-describedby={hint} onClick={choosePoint} onKeyDown={movePoint} />
        </div>
        <div className="chart-dates" aria-hidden="true">
          <span>{dateLabel(first.date)}</span>{first.id !== last.id && <span>{dateLabel(last.date)}</span>}
        </div>
      </div>
      <div className="chart-controls">
        <SelectField label="Измерение на графике" value={selected.id} onChange={event => { setSelectedId(event.target.value) }}>
            {plot.points.map(point => <option key={point.id} value={point.id}>{dateLabel(point.date)} — {amount(point.kg)} кг</option>)}
        </SelectField>
      </div>
      <p className="chart-hint" id={hint}>Нажмите на график или выберите дату. Стрелки переключают измерения, Home и End — первое и последнее.</p>
      <p>Период: {dateLabel(first.date)} — {dateLabel(last.date)}.</p>
      <p>Диапазон шкалы: {amount(plot.minimum)}–{amount(plot.maximum)} кг. Шкала адаптирована к измерениям и может не начинаться с нуля.</p>
      <p>Горизонтальные интервалы соответствуют календарным дням. Между точками проведена линия; измерений в пропущенные дни нет.</p>
      <p>Все даты и значения доступны {historyLink ? <a href="#weight">в истории веса</a> : 'в списке «История веса» ниже'}. График показывает записи, без оценки состояния здоровья.</p>
    </>}
  </section>
}
