import { useId, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { listLabHistory } from '../data/labHistoryRepository'
import { getFile } from '../data/fileRepository'
import { labPlot } from '../domain/labPlot'
import { formatLabValue } from '../domain/labResult'
import { SelectField } from '../ui/Field'
import { Icon } from '../ui/Icon'
import { downloadBlob } from '../ui/download'
import { Feedback, useAction } from '../ui/actions'
import '../lab-trends.css'

const extensions = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' } as const
const dateLabel = (date: string) => date.split('-').reverse().join('.')
function scaleLabel(value: number | null) {
  if (value === null) return ''
  const magnitude = Math.abs(value)
  return value.toLocaleString('ru-RU', { maximumSignificantDigits: 4, notation: magnitude >= 1e6 || (magnitude > 0 && magnitude < .001) ? 'scientific' : 'standard' })
}

export function LabTrends() {
  const title = useId()
  const hint = useId()
  const history = useLiveQuery(() => listLabHistory(), [])
  const [seriesKey, setSeriesKey] = useState('')
  const [resultId, setResultId] = useState('')
  const action = useAction()
  const series = history?.series.find(value => value.key === seriesKey) ?? history?.series[0]
  const plot = series ? labPlot(series) : null
  const selected = plot?.entries.find(entry => entry.id === resultId) ?? plot?.entries.at(-1)
  const sources = new Map(history?.documents.map(document => [document.id, document]))
  const source = selected ? sources.get(selected.documentId) : undefined
  const markers = plot?.points.map(point => ({ ...point, style: { left: `${String(point.x / 6)}%`, top: `${String(point.y / 2.4)}%` } })) ?? []
  const first = plot?.entries[0]
  const last = plot?.entries.at(-1)
  return <section className="card lab-trends" aria-labelledby={title}>
    <h2 id={title}><Icon name="documents" /> Динамика показателей</h2>
    <p>По значениям, внесённым вручную из бланков анализов.</p>
    {!history ? <p role="status">Загружаем историю показателей…</p> : !series || !plot || !selected ? <p>Показателей для графика пока нет. Загрузите бланк и внесите результаты ниже.</p> : <>
      <SelectField label="Показатель для графика" value={series.key} onChange={event => { setSeriesKey(event.currentTarget.value); setResultId(''); action.reset() }}>
        {history.series.map(value => <option key={value.key} value={value.key}>{value.name} · {value.unit || 'единицы не указаны'}</option>)}
      </SelectField>
      <p className="lab-note">Совпадение названия и единиц не гарантирует сопоставимость. Перед сравнением проверьте единицы и методику в исходных бланках.</p>
      <div className="lab-trends-layout">
        <div className="lab-graph">
          {plot.points.length === 0 ? <p>Для графика нужны точные числа с указанными единицами. Остальные результаты доступны в истории.</p> : <>
            <div className="lab-chart-layout">
              <div className="lab-scale" aria-hidden="true">
                {plot.minimum !== plot.maximum && <span className="lab-scale-top">{scaleLabel(plot.maximum)}</span>}
                <span className={plot.minimum === plot.maximum ? 'lab-scale-middle' : 'lab-scale-bottom'}>{scaleLabel(plot.minimum)}</span>
              </div>
              <div className="lab-canvas">
                <svg viewBox="0 0 600 240" preserveAspectRatio="none" role="img" aria-label="График выбранного показателя" aria-describedby={hint}>
                  {[40, 80, 120, 160, 200].map(y => <path key={y} d={`M40 ${String(y)}H560`} className="lab-grid-line" />)}
                  {plot.segments.map((segment, index) => <polyline key={index} points={segment} className="lab-series-line" />)}
                </svg>
                {markers.map(point => <span key={point.id} aria-hidden="true" className={point.id === selected.id ? 'lab-point lab-point-selected' : 'lab-point'} style={point.style} />)}
              </div>
              <div className="lab-date-axis"><span>{first && dateLabel(first.date)}</span>{first?.date !== last?.date && <span>{last && dateLabel(last.date)}</span>}</div>
            </div>
            <p id={hint} className="lab-note">Единицы: {series.unit}. Шкала адаптирована к данным и может не начинаться с нуля; подписи округлены. Точные значения — в истории. Интервалы соответствуют календарным дням.</p>
          </>}
          <p className="lab-note">Линия соединяет только соседние точные результаты с разными датами. Текст, знаки сравнения и повторные даты разрывают линию. Изменение числа само по себе не означает улучшение или ухудшение.</p>
        </div>
        <aside className="lab-selected" aria-label="Источник выбранного показателя">
          <h3>Выбранное измерение</h3>
          <SelectField label="Измерение показателя" value={selected.id} onChange={event => { setResultId(event.currentTarget.value); action.reset() }}>
            {plot.entries.map(entry => <option key={entry.id} value={entry.id}>{dateLabel(entry.date)} — {formatLabValue(entry.value)}</option>)}
          </SelectField>
          <div role="status" aria-label="Выбранный показатель" className="lab-readout"><strong>{formatLabValue(selected.value)}</strong><span>{selected.unit || 'Единицы не указаны'}</span><time dateTime={selected.date}>{dateLabel(selected.date)}</time></div>
          <p>Референс на бланке: {selected.reference || 'не указан'}</p>
          <p>Источник: {source?.title ?? 'недоступен'}</p>
          {source && <button type="button" className="secondary" disabled={action.pending} onClick={() => {
            action.run(async () => {
              const file = await getFile(source.fileId)
              if (!file || file.purpose !== 'document') throw new Error('Не удалось открыть бланк показателя')
              downloadBlob(file.blob, `health-analysis-${file.id}.${extensions[file.mime]}`)
            }, 'Скачивание бланка начато')
          }}>Скачать бланк выбранного показателя</button>}
          <Feedback error={action.error} message={action.message} />
        </aside>
      </div>
      <h3>История показателя</h3>
      <p className="lab-note">Показано {plot.entries.length} из {plot.total} записей, не больше 100 последних. Полные записи доступны в показателях бланков ниже.</p>
      <ul className="lab-history" aria-label="История выбранного показателя">{[...plot.entries].reverse().map(entry => <li key={entry.id}>
        <time dateTime={entry.date}>{dateLabel(entry.date)}</time><strong>{formatLabValue(entry.value)} {entry.unit || '(единицы не указаны)'}</strong><span>{sources.get(entry.documentId)?.title}</span>
      </li>)}</ul>
    </>}
  </section>
}
