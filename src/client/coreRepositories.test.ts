// @vitest-environment node
import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { clientApi } from '../../tests/clientApi'
import { registerProfile } from '../server/profileRoutes'
import { registerWeights } from '../server/weightRoutes'
import { registerProducts } from '../server/productRoutes'
import { createProfile, getProfile, updateProfile } from './profileRepository'
import { deleteWeight, latestWeight, listWeights, saveWeight, updateWeight } from './weightRepository'
import { addProduct, archiveProduct, getProduct, listProducts, seedProducts, updateProduct } from './productRepository'

let api: Awaited<ReturnType<typeof clientApi>>
const profile = { id: 'self', name: 'Учебный профиль', heightCm: 178, birthDate: '1990-01-01', formulaSex: 'none' }
const first = { id: randomUUID(), date: '2026-10-10', kg: 75 }
const product = { id: randomUUID(), name: 'Учебная каша', source: 'Учебный состав', kcal: 100, protein: null, fat: 0, carbs: 20, archived: false }
beforeEach(async () => {
  api = await clientApi((app, pool, authorize, clock) => { registerProfile(app, pool, authorize, clock); registerWeights(app, pool, authorize, clock); registerProducts(app, pool, authorize) })
})
afterEach(async () => { await api.close() })

it('профиль и вес проходят полный цикл, старый редактор не перезаписывает правку', async () => {
  expect(await getProfile()).toBeNull()
  expect(await listWeights('2026-10-15')).toEqual([])
  await createProfile(profile, first)
  const original = await getProfile()
  if (!original) throw new Error('Профиль не создан')
  await updateProfile({ ...original, name: 'Изменённое имя' }, original)
  await expect(updateProfile({ ...original, heightCm: 180 }, original)).rejects.toMatchObject({ status: 409 })
  const weight = await latestWeight('2026-10-15')
  if (!weight) throw new Error('Вес не создан')
  await saveWeight({ date: weight.date, kg: 74.123456 }, weight)
  await expect(updateWeight(weight, { date: weight.date, kg: 70 })).rejects.toMatchObject({ status: 409 })
  await saveWeight({ date: '2026-10-14', kg: 74 }, null)
  const latest = await latestWeight('2026-10-15')
  if (!latest) throw new Error('Нет второго веса')
  await deleteWeight(latest)
  expect((await listWeights('2026-10-15')).map(value => value.kg)).toEqual([74.123456])
  await api.signIn('bob')
  expect(await getProfile()).toBeNull()
  expect(await listWeights('2026-10-15')).toEqual([])
  await expect(deleteWeight(weight)).rejects.toMatchObject({ status: 409 })
})

it('повтор создания после потерянного ответа не дублирует профиль и вес', async () => {
  const transport = api.network.getMockImplementation()
  if (!transport) throw new Error('Нет транспорта')
  api.network.mockImplementationOnce(async (...args) => { await transport(...args); throw new Error('Ответ потерян') })
  await expect(createProfile(profile, first)).rejects.toThrow()
  await createProfile(profile, { ...first, id: randomUUID() })
  expect(await getProfile()).toEqual(profile)
  expect(await listWeights('2026-10-15')).toHaveLength(1)
  await expect(saveWeight({ date: '2026-10-14', kg: 0 }, null)).rejects.toThrow()
})

it('каталог сохраняет архив, изменения, seed и неизвестный состав', async () => {
  expect(await listProducts()).toEqual([])
  expect(await getProduct(randomUUID())).toBeNull()
  await addProduct(product)
  const original = (await listProducts())[0]
  if (!original) throw new Error('Продукт не создан')
  await archiveProduct(original, true)
  expect(await listProducts()).toEqual([])
  const archived = await getProduct(original.id)
  if (!archived) throw new Error('Архив не найден')
  await updateProduct(archived, { name: 'Новая каша', source: archived.source, kcal: 110, protein: null, fat: 0, carbs: 20 })
  await expect(archiveProduct(original, false)).rejects.toMatchObject({ status: 409 })
  const saved = await getProduct(original.id)
  expect(saved).toMatchObject({ archived: true, protein: null, fat: 0, name: 'Новая каша' })
  await seedProducts(); await seedProducts()
  expect(await listProducts()).toHaveLength(2)
  expect(await listProducts(true)).toHaveLength(3)
  await api.signIn('bob')
  expect(await getProduct(original.id)).toBeNull()
})
