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
const id = randomUUID()
beforeEach(async () => {
  database = await testDatabase()
  await migrate(database.pool, await readMigrations())
  alice = await createAccount(database.pool, { login: 'alice', password: 'synthetic-only-password', timezone: 'UTC' })
  bob = await createAccount(database.pool, { login: 'bob', password: 'synthetic-only-password', timezone: 'UTC' })
  for (const account of [alice, bob]) await withUser(database.runtime, account, async client => {
    await client.query("INSERT INTO health.steps(user_id,date,count) VALUES ($1,'2026-10-15',0)", [account.id])
    await client.query(`INSERT INTO health.workouts(user_id,id,date,kind,minutes,kcal,source,note)
      VALUES ($1,$2,'2026-10-15','Учебная тренировка',0.0000001,NULL,'','')`, [account.id, id])
    await client.query(`INSERT INTO health.energy_plans(user_id,id,effective_from,created_on,revision,method,source,resting_formula,snapshot_formula_sex)
      VALUES ($1,$2,'2026-10-16','2026-10-15',1,'none','','mifflin-st-jeor-1990','none')`, [account.id, id])
  }, true)
})
afterEach(async () => { await database.close() })

it('изолирует шаги, тренировки и версии планов по владельцу', async () => {
  for (const table of ['steps', 'workouts', 'energy_plans']) {
    for (const account of [alice, bob]) {
      expect((await withUser(database.runtime, account, client => client.query(`SELECT user_id FROM health.${table}`))).rows).toEqual([{ user_id: account.id }])
    }
    expect((await database.runtime.query(`SELECT * FROM health.${table}`)).rowCount).toBe(0)
    expect((await withUser(database.runtime, alice, client => client.query(`DELETE FROM health.${table} WHERE user_id=$1`, [bob.id]), true)).rowCount).toBe(0)
  }
  await expect(withUser(database.runtime, alice, client => client.query('UPDATE health.workouts SET user_id=$1', [bob.id]), true)).rejects.toMatchObject({ code: '42501' })
  await expect(withUser(database.runtime, alice, client => client.query('UPDATE health.energy_plans SET goal_kcal=2000'), true)).rejects.toMatchObject({ code: '42501' })
})

it('сохраняет ноль и неизвестное отдельно и проверяет пределы активности', async () => {
  expect((await withUser(database.runtime, alice, client => client.query('SELECT count FROM health.steps'))).rows).toEqual([{ count: 0 }])
  expect((await withUser(database.runtime, alice, client => client.query('SELECT kcal,minutes::text FROM health.workouts'))).rows).toEqual([{ kcal: null, minutes: '0.0000001' }])
  for (const value of [-1, 1000001]) await expect(withUser(database.runtime, alice, client => client.query('UPDATE health.steps SET count=$1', [value]), true)).rejects.toMatchObject({ code: '23514' })
  for (const expression of ['minutes=0', 'minutes=1441', 'kcal=-1', 'kcal=100001', "kind=' '", "note=repeat('x',501)"]) {
    await expect(withUser(database.runtime, alice, client => client.query(`UPDATE health.workouts SET ${expression}`), true)).rejects.toMatchObject({ code: '23514' })
  }
  await expect(withUser(database.runtime, alice, client => client.query("INSERT INTO health.steps(user_id,date,count) VALUES ($1,'2026-10-15',1000000)", [alice.id]), true)).rejects.toMatchObject({ code: '23505' })
})

it('проверяет согласованность метода, снимка, даты и номера версии плана', async () => {
  for (const expression of ["method='manual'", "method='factor'", 'factor=1.2', 'snapshot_kg=70', "snapshot_weight_date='2026-10-15'", "snapshot_kg=70,snapshot_weight_date='2026-10-16'", 'snapshot_age=9999', 'snapshot_height_cm=0', "effective_from='2026-10-14'", 'revision=0']) {
    await expect(database.pool.query(`UPDATE health.energy_plans SET ${expression} WHERE user_id=$1`, [alice.id])).rejects.toMatchObject({ code: '23514' })
  }
  await database.pool.query("UPDATE health.energy_plans SET method='manual',manual_kcal=0 WHERE user_id=$1", [alice.id])
  await database.pool.query("UPDATE health.energy_plans SET method='factor',manual_kcal=NULL,factor=1.4,snapshot_kg=70,snapshot_weight_date='2026-10-15',snapshot_age=30 WHERE user_id=$1", [alice.id])
  await expect(withUser(database.runtime, alice, client => client.query(`INSERT INTO health.energy_plans(user_id,id,effective_from,created_on,revision,method,source,resting_formula,snapshot_formula_sex)
    VALUES ($1,$2,'2026-10-16','2026-10-15',1,'none','','mifflin-st-jeor-1990','none')`, [alice.id, randomUUID()]), true)).rejects.toMatchObject({ code: '23505' })
})

it('удаляет активность аккаунта каскадно, сохраняя другого', async () => {
  await database.pool.query('DELETE FROM health.users WHERE id=$1', [alice.id])
  for (const table of ['steps', 'workouts', 'energy_plans']) expect((await database.pool.query(`SELECT user_id FROM health.${table}`)).rows).toEqual([{ user_id: bob.id }])
})
