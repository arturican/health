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
const photoFile = randomUUID(), documentFile = randomUUID(), photo = randomUUID(), document = randomUUID()
beforeEach(async () => {
  database = await testDatabase()
  await migrate(database.pool, await readMigrations())
  alice = await createAccount(database.pool, { login: 'alice', password: 'synthetic-only-password', timezone: 'UTC' })
  bob = await createAccount(database.pool, { login: 'bob', password: 'synthetic-only-password', timezone: 'UTC' })
  for (const account of [alice, bob]) await withUser(database.runtime, account, async client => {
    // Только синтетические байты: это тест SQL-связей, не декодирования изображений.
    await client.query(`INSERT INTO health.files(user_id,id,purpose,mime,size,bytes)
      VALUES ($1,$2,'photo','image/jpeg',1,$4),($1,$3,'document','application/pdf',1,$4)`, [account.id, photoFile, documentFile, Buffer.from([1])])
    await client.query(`INSERT INTO health.photos(user_id,id,file_id,date,title,note,width,height)
      VALUES ($1,$2,$3,'2026-10-15','Учебная геометрия','',1,2048)`, [account.id, photo, photoFile])
    await client.query(`INSERT INTO health.documents(user_id,id,file_id,date,title,kind,note)
      VALUES ($1,$2,$3,'2026-10-15','Учебный бланк','lab','')`, [account.id, document, documentFile])
    await client.query(`INSERT INTO health.lab_results(user_id,id,document_id,date,name,value_type,value_number,value_operator,unit,reference,note)
      VALUES ($1,$2,$3,'2026-10-15','Учебный показатель','number',0.0000000001,'lt','','Как в бланке','')`, [account.id, randomUUID(), document])
  }, true)
})
afterEach(async () => { await database.close() })

it('изолирует файлы, карточки и показатели, запрещает изменение байтов runtime', async () => {
  for (const table of ['files', 'photos', 'documents', 'lab_results']) {
    for (const account of [alice, bob]) {
      const rows = await withUser(database.runtime, account, client => client.query(`SELECT DISTINCT user_id FROM health.${table}`))
      expect(rows.rows).toEqual([{ user_id: account.id }])
    }
    expect((await database.runtime.query(`SELECT * FROM health.${table}`)).rowCount).toBe(0)
    expect((await withUser(database.runtime, alice, client => client.query(`DELETE FROM health.${table} WHERE user_id=$1`, [bob.id]), true)).rowCount).toBe(0)
  }
  await expect(withUser(database.runtime, alice, client => client.query('UPDATE health.files SET bytes=$1', [Buffer.from([2])]), true)).rejects.toMatchObject({ code: '42501' })
  await expect(withUser(database.runtime, alice, client => client.query('UPDATE health.lab_results SET user_id=$1', [bob.id]), true)).rejects.toMatchObject({ code: '42501' })
})

it('проверяет назначение, уникальность файла и принадлежность связей', async () => {
  await expect(withUser(database.runtime, alice, client => client.query('UPDATE health.photos SET file_id=$1', [documentFile]), true)).rejects.toMatchObject({ code: '23503' })
  await expect(withUser(database.runtime, alice, client => client.query(`INSERT INTO health.photos(user_id,id,file_id,date,title,note,width,height)
    VALUES ($1,$2,$3,'2026-10-15','Повтор','',1,1)`, [alice.id, randomUUID(), photoFile]), true)).rejects.toMatchObject({ code: '23505' })
  const otherFile = randomUUID(), otherDocument = randomUUID()
  await database.pool.query(`INSERT INTO health.files(user_id,id,purpose,mime,size,bytes) VALUES ($1,$2,'document','application/pdf',1,$3)`, [bob.id, otherFile, Buffer.from([2])])
  await database.pool.query(`INSERT INTO health.documents(user_id,id,file_id,date,title,kind,note) VALUES ($1,$2,$3,'2026-10-15','Чужой','other','')`, [bob.id, otherDocument, otherFile])
  await expect(withUser(database.runtime, alice, client => client.query('UPDATE health.documents SET file_id=$1', [otherFile]), true)).rejects.toMatchObject({ code: '23503' })
  await expect(withUser(database.runtime, alice, client => client.query('UPDATE health.lab_results SET document_id=$1', [otherDocument]), true)).rejects.toMatchObject({ code: '23503' })
})

it('ограничивает размеры, типы и взаимоисключающие значения показателей', async () => {
  for (const expression of ['size=2', "mime='text/html'", "purpose='photo',mime='application/pdf'"]) {
    await expect(database.pool.query(`UPDATE health.files SET ${expression} WHERE user_id=$1 AND id=$2`, [alice.id, documentFile])).rejects.toMatchObject({ code: '23514' })
  }
  for (const expression of ['width=2049', 'height=0', "title=' '"]) await expect(database.pool.query(`UPDATE health.photos SET ${expression}`)).rejects.toMatchObject({ code: '23514' })
  for (const expression of ["value_type='text'", "value_text='Одновременно'", "value_number='NaN'", "value_number='Infinity'", 'value_operator=NULL', "value_operator='bad'", "unit=repeat('x',41)"]) {
    await expect(database.pool.query(`UPDATE health.lab_results SET ${expression}`)).rejects.toMatchObject({ code: '23514' })
  }
  expect((await withUser(database.runtime, alice, client => client.query('SELECT value_number::text FROM health.lab_results'))).rows).toEqual([{ value_number: '0.0000000001' }])
  await withUser(database.runtime, alice, client => client.query("UPDATE health.lab_results SET value_type='text',value_number=NULL,value_operator=NULL,value_text='Не обнаружено'"), true)
  await expect(withUser(database.runtime, alice, client => client.query("UPDATE health.lab_results SET value_text=' '"), true)).rejects.toMatchObject({ code: '23514' })
})

it('удаление файла документа каскадно удаляет карточку и показатели, аккаунта — все свои вложения', async () => {
  await withUser(database.runtime, alice, client => client.query('DELETE FROM health.files WHERE id=$1', [documentFile]), true)
  expect((await withUser(database.runtime, alice, client => client.query('SELECT * FROM health.documents'))).rowCount).toBe(0)
  expect((await withUser(database.runtime, alice, client => client.query('SELECT * FROM health.lab_results'))).rowCount).toBe(0)
  expect((await withUser(database.runtime, alice, client => client.query('SELECT * FROM health.photos'))).rowCount).toBe(1)
  await database.pool.query('DELETE FROM health.users WHERE id=$1', [alice.id])
  for (const table of ['files', 'photos', 'documents', 'lab_results']) expect((await database.pool.query(`SELECT DISTINCT user_id FROM health.${table}`)).rows).toEqual([{ user_id: bob.id }])
})
