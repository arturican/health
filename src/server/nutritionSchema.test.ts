// @vitest-environment node
import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { createAccount, type Account } from './accounts'
import { withUser } from './userTransaction'
import { migrate, readMigrations } from './migrations'
import { testDatabase } from '../../tests/serverDatabase'

let database: Awaited<ReturnType<typeof testDatabase>>
let alice: Account
let bob: Account
const product = randomUUID()
const food = randomUUID()
beforeEach(async () => {
  database = await testDatabase()
  await migrate(database.pool, await readMigrations())
  alice = await createAccount(database.pool, { login: 'alice', password: 'synthetic-only-password', timezone: 'UTC' })
  bob = await createAccount(database.pool, { login: 'bob', password: 'synthetic-only-password', timezone: 'UTC' })
  for (const account of [alice, bob]) await withUser(database.runtime, account, async client => {
    await client.query(`INSERT INTO health.products(user_id,id,name,source,kcal,protein,fat,carbs)
      VALUES ($1,$2,'Учебный продукт','Синтетические данные',100,NULL,0,100)`, [account.id, product])
    await client.query(`INSERT INTO health.food_entries(user_id,id,date,meal,product_id,name,source,kcal,grams,note)
      VALUES ($1,$2,'2026-10-15','breakfast',$3,'Снимок','Учебный источник',100,150,'')`, [account.id, food, product])
    await client.query("INSERT INTO health.nutrition_days(user_id,date,complete) VALUES ($1,'2026-10-15',false)", [account.id])
  }, true)
})
afterEach(async () => { await database.close() })

it('изолирует все таблицы и одинаковые UUID владельцев', async () => {
  for (const table of ['products', 'food_entries', 'nutrition_days']) {
    for (const account of [alice, bob]) {
      const result = await withUser(database.runtime, account, client => client.query(`SELECT user_id FROM health.${table}`))
      expect(result.rows).toEqual([{ user_id: account.id }])
    }
    expect((await database.runtime.query(`SELECT * FROM health.${table}`)).rowCount).toBe(0)
    await withUser(database.runtime, alice, async client => {
      expect((await client.query(`DELETE FROM health.${table} WHERE user_id=$1`, [bob.id])).rowCount).toBe(0)
    }, true)
    await expect(withUser(database.runtime, alice, client => client.query(`UPDATE health.${table} SET user_id=$1`, [bob.id]), true)).rejects.toMatchObject({ code: '42501' })
  }
})

it('проверяет ограничения и сохраняет неизвестное отдельно от нуля', async () => {
  const update = (table: string, expression: string) => withUser(database.runtime, alice, client => client.query(`UPDATE health.${table} SET ${expression}`), true)
  for (const expression of ["name=' '", "source=repeat('x',161)", 'kcal=-1', 'kcal=10001', "kcal='NaN'", 'protein=101', 'fat=-1', 'carbs=101', 'revision=0', 'archived=NULL']) {
    await expect(update('products', expression)).rejects.toHaveProperty('code')
  }
  for (const expression of ["meal='other'", 'grams=0', 'grams=100001', "date='0001-01-01 BC'", "note=repeat('x',501)", 'kcal=-1']) {
    await expect(update('food_entries', expression)).rejects.toMatchObject({ code: '23514' })
  }
  await expect(update('nutrition_days', 'complete=NULL')).rejects.toMatchObject({ code: '23502' })
  const values = await withUser(database.runtime, alice, client => client.query('SELECT protein::text,fat::text,carbs::text FROM health.products'))
  expect(values.rows).toEqual([{ protein: null, fat: '0', carbs: '100' }])
  await update('food_entries', 'grams=0.000000001')
})

it('снимок не меняется при правке/архиве/удалении каталога; чужая ссылка запрещена', async () => {
  const other = randomUUID()
  await withUser(database.runtime, bob, client => client.query(`INSERT INTO health.products(user_id,id,name,source,kcal) VALUES ($1,$2,'Чужой','',0)`, [bob.id, other]), true)
  await expect(withUser(database.runtime, alice, client => client.query('UPDATE health.food_entries SET product_id=$1', [other]), true)).rejects.toMatchObject({ code: '23503' })
  await withUser(database.runtime, alice, async client => {
    await client.query("UPDATE health.products SET name='Правка',kcal=200,archived=true")
    expect((await client.query('SELECT name,kcal::text FROM health.food_entries')).rows).toEqual([{ name: 'Снимок', kcal: '100' }])
    await client.query('DELETE FROM health.products')
    expect((await client.query('SELECT product_id,name,kcal::text FROM health.food_entries')).rows).toEqual([{ product_id: null, name: 'Снимок', kcal: '100' }])
  }, true)
})

it('уникальность и удаление аккаунта не затрагивают другого владельца', async () => {
  await expect(withUser(database.runtime, alice, client => client.query("INSERT INTO health.nutrition_days(user_id,date,complete) VALUES ($1,'2026-10-15',true)", [alice.id]), true)).rejects.toMatchObject({ code: '23505' })
  await database.pool.query('DELETE FROM health.users WHERE id=$1', [alice.id])
  for (const table of ['products', 'food_entries', 'nutrition_days']) {
    expect((await database.pool.query(`SELECT user_id FROM health.${table}`)).rows).toEqual([{ user_id: bob.id }])
  }
})
