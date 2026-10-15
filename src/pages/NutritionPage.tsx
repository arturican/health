import { seedProducts } from '../data/productRepository'
import { ProductCatalog } from './ProductCatalog'
import { Feedback, useAction } from '../ui/actions'
import { FoodJournal } from './FoodJournal'
import { useDay } from '../ui/DayContext'
import { NutritionSummary } from '../ui/NutritionSummary'
import { EnergySummary } from '../ui/EnergySummary'
import { MacroCharts } from '../ui/MacroCharts'
import '../nutrition.css'

export function NutritionPage() {
  const { day } = useDay()
  const action = useAction()
  return (
    <section className="page nutrition-page" aria-labelledby="nutrition-title">
      <h1 id="nutrition-title">Питание</h1>
      <p>Приёмы пищи, состав продуктов и итоги выбранного дня.</p>
      <MacroCharts />
      <div className="nutrition-overview">
      <NutritionSummary />
      <EnergySummary />
      </div>
      <FoodJournal key={day} />
      <ProductCatalog />
      <div className="actions">
        <button type="button" className="secondary" disabled={action.pending} onClick={() => { action.run(() => seedProducts(), 'Примеры добавлены') }}>Добавить примеры продуктов</button>
      </div>
      <p>Примеры содержат учебные значения. Для своих записей используйте данные этикетки.</p>
      <Feedback error={action.error} message={action.message} />
    </section>
  )
}
