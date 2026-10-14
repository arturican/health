import { useLiveQuery } from 'dexie-react-hooks'
import { listProducts, seedProducts } from '../data/productRepository'
import { ProductForm } from './ProductForm'
import { Feedback, useAction } from '../ui/actions'

export function NutritionPage() {
  const products = useLiveQuery(() => listProducts(), [])
  const action = useAction()
  return (
    <section className="page" aria-labelledby="nutrition-title">
      <h1 id="nutrition-title">Питание</h1>
      <ProductForm />
      {products === undefined ? <p role="status">Загружаем справочник…</p> : <p>Активных продуктов: {products.length}</p>}
      <div className="actions">
        <button type="button" className="secondary" disabled={action.pending} onClick={() => { action.run(() => seedProducts(), 'Примеры добавлены') }}>Добавить примеры продуктов</button>
      </div>
      <p>Примеры содержат учебные значения. Для своих записей используйте данные этикетки.</p>
      <Feedback error={action.error} message={action.message} />
    </section>
  )
}
