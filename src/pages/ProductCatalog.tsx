import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { archiveProduct, listProducts } from '../data/productRepository'
import type { Product } from '../domain/nutrition'
import { Field } from '../ui/Field'
import { Feedback, useAction } from '../ui/actions'
import { ProductForm } from './ProductForm'
import { exactNumber } from '../ui/exactNumber'

function macroLabel(value: number | null) {
  return value === null ? 'неизвестно' : `${exactNumber(value)} г`
}

export function ProductCatalog() {
  const products = useLiveQuery(() => listProducts(true), [])
  const [editing, setEditing] = useState<Product | null>(null)
  const [search, setSearch] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const action = useAction()
  const filtered = products?.filter(product => (showArchived || !product.archived) && product.name.toLocaleLowerCase('ru-RU').includes(search.trim().toLocaleLowerCase('ru-RU')))
  return (
    <>
      {editing ? <ProductForm key={editing.id} product={editing} onSaved={() => { setEditing(null); setNotice('Продукт обновлён') }} onCancel={() => { setEditing(null) }} /> : <ProductForm key="new" />}
      <h2>Каталог продуктов</h2>
      <div className="form-grid">
        <Field label="Поиск продукта" value={search} onChange={event => { setSearch(event.target.value) }} />
        <label><input type="checkbox" checked={showArchived} onChange={event => { setShowArchived(event.target.checked) }} /> Показать архив</label>
      </div>
      {products === undefined ? <p role="status">Загружаем справочник…</p> : (
        <>
          <p>Активных продуктов: {products.filter(product => !product.archived).length}</p>
          {filtered?.length === 0 ? <p>Продукты не найдены. Добавьте свой продукт или измените поиск.</p> : <ul className="record-list" aria-label="Каталог продуктов">
            {filtered?.map(product => <li key={product.id}>
              <div>
                <strong>{product.name}</strong>{product.archived && <span> · В архиве</span>}
                <p>{exactNumber(product.kcal)} ккал/100 г · Белки: {macroLabel(product.protein)} · Жиры: {macroLabel(product.fat)} · Углеводы: {macroLabel(product.carbs)}</p>
                <p>Источник: {product.source || 'не указан'}</p>
              </div>
              <div className="actions">
                <button type="button" className="secondary" disabled={action.pending} aria-label={`Править продукт ${product.name}`} onClick={() => { setEditing(product); setNotice(null) }}>Править</button>
                <button type="button" className="secondary" disabled={action.pending} aria-label={`${product.archived ? 'Вернуть' : 'Архивировать'} продукт ${product.name}`} onClick={() => {
                  setNotice(null)
                  action.run(() => archiveProduct(product.id, !product.archived), product.archived ? 'Продукт возвращён из архива' : 'Продукт перемещён в архив')
                }}>{product.archived ? 'Вернуть' : 'Архивировать'}</button>
              </div>
            </li>)}
          </ul>}
        </>
      )}
      <p>Изменение справочника не меняет снимки в ранее сохранённых записях еды.</p>
      {!editing && <Feedback error={action.error} message={notice ?? action.message} />}
    </>
  )
}
