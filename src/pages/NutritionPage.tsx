import { seedProducts } from '../data/productRepository'
import { ProductCatalog } from './ProductCatalog'
import { Feedback, useAction } from '../ui/actions'

export function NutritionPage() {
  const action = useAction()
  return (
    <section className="page" aria-labelledby="nutrition-title">
      <h1 id="nutrition-title">Питание</h1>
      <ProductCatalog />
      <div className="actions">
        <button type="button" className="secondary" disabled={action.pending} onClick={() => { action.run(() => seedProducts(), 'Примеры добавлены') }}>Добавить примеры продуктов</button>
      </div>
      <p>Примеры содержат учебные значения. Для своих записей используйте данные этикетки.</p>
      <Feedback error={action.error} message={action.message} />
    </section>
  )
}
