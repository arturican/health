import { seedProducts } from '../data/productRepository'
import { ProductCatalog } from './ProductCatalog'
import { Feedback, useAction } from '../ui/actions'
import { FoodJournal } from './FoodJournal'
import { useDay } from '../ui/DayContext'
import { NutritionSummary } from '../ui/NutritionSummary'
import { EnergySummary } from '../ui/EnergySummary'
import { MacroCharts } from '../ui/MacroCharts'

export function NutritionPage() {
  const { day } = useDay()
  const action = useAction()
  return (
    <section className="page" aria-labelledby="nutrition-title">
      <h1 id="nutrition-title">Питание</h1>
      <MacroCharts />
      <NutritionSummary />
      <EnergySummary />
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
