import Dexie from 'dexie'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { DiaryDatabase } from './db'
import { addProduct, archiveProduct, seedProducts, updateProduct } from './productRepository'
import { addFood, copyMeal, updateFood } from './foodRepository'
import { addEnergyPlan } from './energyPlanRepository'
import { addLabResult, updateLabResult } from './labRepository'
import { DIARY_GENERATION_ID } from './clearDiary'

vi.mock('../domain/backup', async importOriginal => ({ ...await importOriginal<typeof import('../domain/backup')>(), BACKUP_MAX_RECORDS: 3 }))

const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`
const product = { id: id(1), name: 'Синтетический продукт', source: '', kcal: 100, protein: null, fat: null, carbs: null, archived: false }
const today = '2026-10-14'
const food = { date: today, meal: 'lunch', productId: product.id, grams: 100, note: '' }
const plan = { effectiveFrom: today, goalKcal: 1800, method: 'manual', manualKcal: 2100, factor: null, source: 'Синтетический план' }
const document = { id: id(201), fileId: id(301), date: today, title: 'Синтетический источник', kind: 'lab', note: '' }
const lab = { documentId: document.id, date: today, name: 'Синтетический показатель', value: { type: 'number', number: 0, operator: 'eq' }, unit: '', reference: '', note: '' }
const connections: DiaryDatabase[] = []
function createDatabase(name = `health-diary-test-record-catalog-${crypto.randomUUID()}`) {
  const database = new DiaryDatabase(name)
  connections.push(database)
  return database
}
function expectSingleLimit(results: readonly PromiseSettledResult<unknown>[]) {
  expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
  const failures = results.filter(result => result.status === 'rejected')
  expect(failures).toHaveLength(1)
  const reason: unknown = failures[0]?.reason
  expect(reason).toBeInstanceOf(Error)
  if (!(reason instanceof Error)) throw new Error('Ожидался отказ лимита')
  expect(reason.message).toMatch(/лимит/i)
}
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-14T12:00:00.000Z'))
})
afterEach(async () => {
  vi.restoreAllMocks()
  for (const database of connections) database.close()
  await Promise.all([...new Set(connections.map(database => database.name))].map(name => Dexie.delete(name)))
  connections.length = 0
  vi.useRealTimers()
})

it('не позволяет новому продукту превысить лимит, сохраняя весь каталог', async () => {
  const database = createDatabase()
  for (let index = 1; index <= 3; index++) await addProduct({ ...product, id: id(index) }, database)
  const before = await database.products.toArray()
  await expect(addProduct({ ...product, id: id(4) }, database)).rejects.toThrow(/лимит/i)
  expect(await database.products.toArray()).toEqual(before)
  const changes = { name: 'Синтетическая правка', source: '', kcal: 0, protein: 0, fat: null, carbs: null }
  await updateProduct(product.id, changes, database)
  await archiveProduct(product.id, true, database)
  expect(await database.products.get(product.id)).toEqual({ ...changes, id: product.id, archived: true })
  expect(await database.products.count()).toBe(3)
})

it('при конкурентном добавлении продуктов через два соединения занимает только последний слот', async () => {
  const database = createDatabase()
  await database.products.bulkAdd([{ ...product, id: id(1) }, { ...product, id: id(2) }])
  const before = await database.products.toArray()
  expectSingleLimit(await Promise.allSettled([
    addProduct({ ...product, id: id(3) }, database),
    addProduct({ ...product, id: id(4) }, createDatabase(database.name)),
  ]))
  expect(await database.products.count()).toBe(3)
  expect(await database.products.toArray()).toEqual(expect.arrayContaining(before))
})

it.each([2, 3])('примеры отклоняются целиком для каталога из %i записей, когда не хватает места для всех отсутствующих', async count => {
  const database = createDatabase()
  await database.products.bulkAdd(Array.from({ length: count }, (_, index) => ({ ...product, id: id(index + 1) })))
  const before = await database.products.toArray()
  await expect(seedProducts(database)).rejects.toThrow(/лимит/i)
  expect(await database.products.toArray()).toEqual(before)
  expect(await database.metadata.toArray()).toEqual([])
})

it('добавляет ровно один отсутствующий пример в последний слот без перезаписи пользовательского продукта', async () => {
  const database = createDatabase()
  const customExample = { ...product, id: id(101), name: 'Синтетический изменённый пример' }
  await database.products.bulkAdd([product, customExample])
  await seedProducts(database)
  expect(await database.products.count()).toBe(3)
  expect(await database.products.get(id(101))).toEqual(customExample)
  expect(await database.products.get(id(102))).toMatchObject({ name: 'Пример: продукт Б' })
  expect(await database.metadata.toArray()).toEqual([{ id: 'catalog-seeded', value: 'done' }])
  const before = await database.products.toArray()
  await seedProducts(database)
  expect(await database.products.toArray()).toEqual(before)
})

it.each([2, 3])('маркер примеров учитывает %i пользовательских metadata, исключая служебное поколение', async count => {
  const database = createDatabase()
  const marker = { id: DIARY_GENERATION_ID, value: id(999) }
  const metadata = Array.from({ length: count }, (_, index) => ({ id: `fixture-${String(index)}`, value: 'Синтетическая настройка' }))
  await database.metadata.bulkAdd([marker, ...metadata])
  await expect(seedProducts(database)).resolves.toBeUndefined()
  expect(await database.products.count()).toBe(2)
  expect(await database.metadata.get(DIARY_GENERATION_ID)).toEqual(marker)
  const expected = count === 2 ? [...metadata, { id: 'catalog-seeded', value: 'done' }] : metadata
  expect((await database.metadata.toArray()).filter(row => row.id !== DIARY_GENERATION_ID)).toEqual(expect.arrayContaining(expected))
  expect(await database.metadata.count()).toBe(expected.length + 1)
  const before = await database.products.toArray()
  await seedProducts(database)
  expect(await database.products.toArray()).toEqual(before)
  expect(await database.metadata.count()).toBe(expected.length + 1)
})

it('при лимите еды отклоняет добавление, сохраняя возможность правки прежней порции', async () => {
  const database = createDatabase()
  await addProduct(product, database)
  const first = await addFood(food, database)
  await addFood({ ...food, note: 'Вторая порция' }, database)
  await addFood({ ...food, note: 'Третья порция' }, database)
  const before = await database.foodEntries.toArray()
  await expect(addFood({ ...food, note: 'Лишняя порция' }, database)).rejects.toThrow(/лимит/i)
  expect(await database.foodEntries.toArray()).toEqual(before)
  const changes = { date: '2026-10-13', meal: 'dinner', grams: 125, note: 'Синтетическая правка' }
  await updateFood(first.id, changes, database)
  expect(await database.foodEntries.get(first.id)).toEqual({ ...first, ...changes })
  expect(await database.foodEntries.count()).toBe(3)
})

it('недостаток одного слота для двух копий отклоняет весь приём, сохраняя исходные записи и полноту дней', async () => {
  const database = createDatabase()
  await addProduct(product, database)
  await addFood(food, database)
  await addFood({ ...food, grams: 75 }, database)
  const completeness = [{ date: today, complete: true }, { date: '2026-10-13', complete: false }]
  await database.nutritionDays.bulkAdd(completeness)
  const before = await database.foodEntries.toArray()
  await expect(copyMeal(today, 'lunch', '2026-10-13', database)).rejects.toThrow(/лимит/i)
  expect(await database.foodEntries.toArray()).toEqual(before)
  expect(await database.nutritionDays.toArray()).toEqual([...completeness].reverse())
})

it.each(['add', 'copy'])('конкурентные add и %s через два соединения не превышают последний слот еды', async competitor => {
  const database = createDatabase()
  await addProduct(product, database)
  const source = await addFood(food, database)
  const neighbor = await addFood({ ...food, meal: 'breakfast' }, database)
  const other = createDatabase(database.name)
  const second = competitor === 'copy' ? copyMeal(today, 'lunch', '2026-10-13', other) : addFood({ ...food, note: 'Конкурент' }, other)
  expectSingleLimit(await Promise.allSettled([addFood({ ...food, note: 'Последний слот' }, database), second]))
  expect(await database.foodEntries.count()).toBe(3)
  expect(await database.foodEntries.get(source.id)).toEqual(source)
  expect(await database.foodEntries.get(neighbor.id)).toEqual(neighbor)
})

it('копирование допускает точное заполнение последнего слота', async () => {
  const database = createDatabase()
  await addProduct(product, database)
  const source = await addFood(food, database)
  await addFood({ ...food, meal: 'breakfast' }, database)
  expect(await copyMeal(today, 'lunch', '2026-10-13', database)).toBe(1)
  const copies = await database.foodEntries.where('date').equals('2026-10-13').toArray()
  expect(copies).toHaveLength(1)
  expect(copies[0]).toMatchObject({ ...source, id: copies[0]?.id, date: '2026-10-13' })
  expect(copies[0]?.id).not.toBe(source.id)
  expect(await database.foodEntries.count()).toBe(3)
})

it('лимит версий плана сохраняет прежнюю историю и снимки', async () => {
  const database = createDatabase()
  for (let index = 0; index < 3; index++) await addEnergyPlan(plan, database)
  const before = await database.energyPlans.toArray()
  await expect(addEnergyPlan(plan, database)).rejects.toThrow(/лимит/i)
  expect(await database.energyPlans.toArray()).toEqual(before)
})

it('лимит показателей сохраняет документ-источник и допускает правку существующего результата', async () => {
  const database = createDatabase()
  await database.documents.add({ ...document, kind: 'lab' })
  const first = await addLabResult(lab, database)
  await addLabResult({ ...lab, name: 'Второй синтетический показатель' }, database)
  await addLabResult({ ...lab, name: 'Третий синтетический показатель' }, database)
  const before = await database.labResults.toArray()
  await expect(addLabResult(lab, database)).rejects.toThrow(/лимит/i)
  expect(await database.labResults.toArray()).toEqual(before)
  const changes = { ...lab, name: 'Синтетическая правка', value: { type: 'text', text: 'Синтетический текст' } }
  await updateLabResult(first.id, changes, database)
  expect(await database.labResults.get(first.id)).toEqual({ ...changes, id: first.id })
  expect(await database.labResults.count()).toBe(3)
  expect(await database.documents.toArray()).toEqual([document])
})
