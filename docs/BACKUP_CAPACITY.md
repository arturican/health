# Измеренная ёмкость JSON-копий

T243 / AUD-014,20.10.2026, после c322f45; приложение не менялось.
Node24.22.0/npm11.19.1, WSL Ubuntu24.04, PostgreSQL18.3 localhost55432,
UUID testDatabase, Fastify inject, без внешней сети/реальных данных.
Изолированный прогон Vitest, один процесс последовательно. Время — один
локальный образец, не SLA; peakRSS — накопленный high-water всей последовательности,
включая Vitest/inject/удержание response/GC, не дополнительная память API.

| Products / files | Формат | HTTP | Bytes ответа | ms | Peak RSS KiB |
|---|---|---|---|---|---|
| 50778 ASCII /0 | text |200|20971515|676|419556|
| 50779 ASCII /0 | text |413|113|480|635188|
| 80000 ASCII /0 | full |200|33040319|1105|698436|
| 80000 ASCII /100MiB PDF | full |200|172856037|2589|1756756|
| 80000 CJK /100MiB PDF | full |413|113 error body|2604|2109984|

Первые четыре строки — первоначальный успешный прогон; последний — расширенный
повтор. Mixed full повтор200/2601ms/1715672KiB. Ни один замер не был production.
ASCII name120/source160, kcal0 и остальные nullable/false:413 bytes/product.
Точная text граница для этого fixture —50778; длина UTF-8 меняет границу.
CJK использует три UTF-8 bytes на символ и тоже укладывается в field limits.
20 документов по5MiB валидного synthetic PDF =100MiB, с реальными связями files.
Ни одна исходная запись не удаляется отказом; products80000 сохранены.

## Решение и доступный путь

Поддерживаемые контракты прежние: text≤20MiB, full≤200MiB и files≤100MiB,
каждый массив≤100000. Эти ограничения действуют одновременно, а не гарантируют
экспорт произвольной разрешённой комбинации. Full обходит text20MiB для проверенного
ASCII fixture, но НЕ гарантирует копию любой базы; CJK mixed это опровергает.
UI T244 должен дать явный выбор full и объяснять оба отказа без автоматических
повторных тяжёлых запросов. Защитные лимиты не увеличивать.

При full413 оператор проверяет административную зашифрованную копию всей БД по
[BACKUPS](BACKUPS.md), а не удаление записей ради экспорта. Это путь через
оператора и private recovery key, не самостоятельный browser import. Dump всей
БД нельзя выдавать пользователю аккаунта: он содержит другие аккаунты/auth.
Оператор должен отдельно организовать безопасное сохранение данных владельца.
Браузерный импорт для большого mixed fixture и production peak memory НЕ
измерены; existing restore tests подтверждают только свои synthetic размеры.
100MiB файлы в JSON используют Base64 (примерно4/3 исходных bytes).
Сервер одновременно материализует rows/validated objects/JSON, browser парсит
ещё раз. Измеренный RSS требует отдельного streaming exporter/importer решения,
если необходимо гарантировать UI-копии всех допустимых данных. Пока AUD-014
частично устранён объяснимым пределом/альтернативой, универсальная ёмкость
остаётся известным ограничением; нельзя утверждать его полное исправление.

## Воспроизведение

Ниже временный test; сохранить как src/server/backupCapacity.measure.test.ts,
использовать только TEST_DATABASE_URL изолированной PostgreSQL, запустить
npx vitest run src/server/backupCapacity.measure.test.ts и удалить файл после
измерения. TestDatabase создаёт/удаляет UUID DB/role; не подставлять рабочий URL.
Не добавлять тяжёлый benchmark в обычный check.

```ts
// @vitest-environment node
import { randomUUID } from 'node:crypto'
import { expect, it } from 'vitest'
import { testApi } from '../../tests/serverApi'
import { registerBackups } from './backupRoutes'
it('synthetic capacity measurement', async () => {
  const c = await testApi(registerBackups)
  try {
    const headers = await c.headers()
    for (const count of [50778, 50779, 80000]) {
      await c.database.pool.query('DELETE FROM health.products')
      await c.database.pool.query("INSERT INTO health.products(user_id,id,name,source,kcal) SELECT $1,gen_random_uuid(),repeat('x',120),repeat('y',160),0 FROM generate_series(1,$2)", [c.alice.id,count])
      for (const format of ['text','full']) {
        const started = performance.now()
        const response = await c.app.inject({url:'/api/v1/backup/'+format,headers})
        console.log(JSON.stringify({count,files:0,format,status:response.statusCode,bytes:Buffer.byteLength(response.body),ms:Math.round(performance.now()-started),peakRSSKiB:process.resourceUsage().maxRSS}))
        expect(response.statusCode).toBe(format==='text' && count>=50779 ? 413 : 200)
      }
    }
    const bytes = Buffer.alloc(5*1024*1024,32)
    bytes.write('%PDF-1.7\n');bytes.write('\n%%EOF\n',bytes.length-7)
    for(let n=0;n<20;n++){
      const file=randomUUID()
      await c.database.pool.query('INSERT INTO health.files(user_id,id,purpose,mime,size,bytes) VALUES ($1,$2,\'document\',\'application/pdf\',$3,$4)',[c.alice.id,file,bytes.length,bytes])
      await c.database.pool.query("INSERT INTO health.documents(user_id,id,file_id,date,title,kind,note) VALUES ($1,$2,$3,'2026-10-15','Synthetic','other','')",[c.alice.id,randomUUID(),file])
    }
    const started=performance.now()
    const response=await c.app.inject({url:'/api/v1/backup/full',headers})
    console.log(JSON.stringify({count:80000,files:104857600,format:'full',status:response.statusCode,bytes:Buffer.byteLength(response.body),ms:Math.round(performance.now()-started),peakRSSKiB:process.resourceUsage().maxRSS}))
    expect(response.statusCode).toBe(200)
    await c.database.pool.query("UPDATE health.products SET name=repeat('界',120), source=repeat('界',160)")
    const maximumStart=performance.now()
    const maximum=await c.app.inject({url:'/api/v1/backup/full',headers})
    console.log(JSON.stringify({count:80000,encoding:'CJK',files:104857600,format:'full',status:maximum.statusCode,ms:Math.round(performance.now()-maximumStart),peakRSSKiB:process.resourceUsage().maxRSS}))
    expect(maximum.statusCode).toBe(413)
    expect((await c.database.pool.query('SELECT count(*)::int AS n FROM health.products')).rows[0]).toEqual({n:80000})
  } finally {await c.close()}
},60000)

```
