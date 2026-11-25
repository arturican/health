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

## Целевой профиль выпуска T277

25.11.2026 согласован один год синтетических записей и 76 вложений. В наборе
52 геометрических JPEG по 1 МиБ и 24 PDF по 2 МиБ. Итого 100 МиБ исходных
байтов и 139 810 304 байта Base64. В T278 предстоят скачивание, предпросмотр
и импорт полной копии между двумя аккаунтами на Desktop Chromium и в эмуляции
Pixel 7. Размер полного JSON и время фиксируются отдельно. Пограничный сценарий
проверяет отказ при полном импорте файла на один байт больше 200 МиБ.

Этот профиль задаёт цель измерения. Приведённые выше результаты T243 относятся
к другим наборам и серверному замеру. [Точный состав и критерии T277](tasks/T277.md)

## Полный перенос T278 — 25.11.2026

На срезе приложения `3c7728e` проверен профиль T277. Полная копия содержит
365 дней записей, 52 JPEG по 1 МиБ и 24 PDF по 2 МиБ. Полученный JSON —
141 405 056 байт (134,85 МиБ), исходные вложения — 104 857 600 байт.
Записи, связи и SHA256 всех 76 файлов совпали с фикстурой и восстановленным
дневником второго аккаунта. Исходный аккаунт и его ревизия сохранены.
До импорта запрос чужого файла из второго аккаунта вернул 404.

| Проект | Скачивание, мс | Предпросмотр, мс | Импорт, мс |
|---|---:|---:|---:|
| Desktop Chromium | 3 188 | 1 995 | 8 454 |
| Chromium, эмуляция Pixel 7 375 × 812 | 3 062 | 2 026 | 9 963 |

Среда — WSL Ubuntu 24.04, Node 24.22.0, npm 11.19.1, PostgreSQL 18.3,
Playwright 1.64.1 и Chromium 156.0.8078.4. Два последовательных прогона
выполнены на одном компьютере с 15,4 ГиБ доступной ОС памяти.
Время измерялось целиком для действий в браузере, включая сохранение
скачанного файла. Это по одному образцу без гарантированного порога времени.
Физический телефон и потребление памяти на нём предстоит проверить отдельно.

Файл размером 209 715 201 байт отклонён в предпросмотре с сообщением о 200 MiB.
POST импорта отсутствовал, содержимое дневника и ревизия сохранились.
Отдельный API-тест подтвердил HTTP 413 при таком `Content-Length` и
неизменность снимка и ревизии. Он проверяет ограничение заголовка до разбора тела.

Для повторения подготовлены [фикстура года](../tests/performance/yearBackupFixture.ts),
[браузерный сценарий](../tests/performance/year-backup.spec.ts) и
[отдельная конфигурация](../tests/performance/year-backup.config.ts).
После настройки локальной тестовой БД по [TESTING](TESTING.md)
выполните следующие команды в WSL из каталога проекта.

```bash
source ~/.nvm/nvm.sh
nvm use
export TEST_DATABASE_URL=postgresql://postgres:synthetic-local-only@127.0.0.1:55432/health_test
npm run build
npx playwright test --config tests/performance/year-backup.config.ts
npm test -- src/server/restoreFull.test.ts
```

В текущем WSL библиотеки Chromium загружались из ранее подготовленного
пользовательского каталога. Для повторения в этой среде перед прогоном задайте
`export LD_LIBRARY_PATH="$HOME/.cache/health-browser-deps/root/usr/lib/x86_64-linux-gnu"`.
На другой машине библиотеки готовятся по TESTING.

Порты 4173/4181 должны быть свободны. Данные создаются в случайной тестовой БД,
которая удаляется при завершении. Скачанные синтетические файлы и отчёты
остаются в `/tmp/health-year-backup-results`. Большой сценарий запускается
отдельно от обычного CI. Этот профиль дополняет измерения T243.
Для другого количества записей, состава или размеров файлов нужен новый замер.

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
