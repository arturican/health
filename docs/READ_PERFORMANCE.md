# Чтения экрана Сегодня

T248 baseline126e982,20.10.2026. Node24.22.0, Chromium Playwright1.64.1,
WSL Ubuntu24.04, PostgreSQL18.3 localhost, built Vite preview. Empty UUID owner,
fixed2026-10-14T12:00Z, timezoneMoscow, authcookie synthetic.
Воспроизведение: актуальный npm run build; TEST_DATABASE_URL отдельного
localhost test PG; npx playwright test tests/e2e/today-requests.spec.ts
--project chromium. Global setup создаёт/удаляет UUID DB/role.
Тест не использует live account, внешнюю сеть или произвольный sleep.

| Фаза | GET без auth/session | diary-state | food | nutrition-days | network ms |
|---|---|---|---|---|---|
| initial |31|21|3|2|345|
| focus event |30|20|3|2|134|
| сохранение полноты дня |30|20|3|2|205|

Остальные5GET: effective plan,profile,weights,steps,workouts, каждый1.
В initial есть дополнительная инициализация diary-state. Исходный AUD30/20
относится к повторному чтению, не полному bootstrap. Durations — один локальный
образец до последнего завершённого API-запроса, без500ms networkidle ожидания;
не production SLA и не причинное доказательство задержки у пользователя.
Mutation duration включает POST; count table — толькоGET.
Ошибки pageerror/network в этом measurement отдельно не профилировались;
функциональные проверки выполняются другими E2E.

## Бюджет и следующие шаги

Постоянный test ограничивает baseline≤31GET/≤21state в каждой фазе.
T249/T249a: сохранить внешнюю before/after пару snapshot, убрать вложенные
fences у4paged repositories внутри summaries; ожидаемый budget≤23GET/≤13state.
ReadScope передаётся явно, прекращает действие по выходу callback; параллельные
scopes изолированы, никакого global async depth. Три retry/owner/generation/
cursorloop проверки остаются обязательными. Это сначала coreprotocol (T249),
затем4repositories+summaries (T249a), чтобы каждый коммит укладывался в5appfiles.

T250: shared food/nutrition-days между TodayMeals/NutritionSummary/EnergySummary
в одном view. Целевой≤16GET/≤9state для общего питания; объединение остальных карточек
в один согласованный snapshot может довести до≤12GET/≤5state отдельным шагом.
Точный бюджет уточнить по замеру после
T249a. Независимые экраны сохраняют самостоятельные reads. Day/owner changes,
incomplete/null значения и запрет stale writes не ослабляются.
Файловый cache T251 выбирается отдельно после повторного замера bytes.

## После T249a

Desktop initial23GET/13state (336ms), focus22/12 (111ms), mutation22/12 (173ms).
Mobile23/13 (305ms),22/12 (115ms),22/12 (179ms). По одному sample; count
устойчив в обоих profiles, ms не статистическое сравнение скорости.
SQL regression5summaries подтверждает ровно2stateGET каждая; standalone list
по-прежнему сам fenced. Gate ужесточён≤23/13. DataGET food3/status2 пока прежние.

## После T250/T250a

TodaySummaryProvider читает общий getTodaySummary: все7ресурсов по1, outerstate2.
App/Today visibility добавляют2state и bootstrapещё1. Initial12GET/5state,
focus/mutation11/4 наdesktop иmobile. Food3→1, nutrition-days2→1.
Desktop312/150/185ms, mobile318/129/203ms; одиночные loopback samples не
подтверждают ускорение UI. Устранены19GET/initial и19GET/refresh относительно
T248, тоесть≈61–63% запросов. Gate≤12/5 и ровно1food/status.

Снимок группирует view одногоowner/day; при failedлюбомresource сохраняются
прежние данные целиком, currentfalse блокирует fullness. Это расширяет область
отказа между карточками, зато они не смешивают разные snapshot revisions.
Initial failure какпрежде обрабатывает StorageBoundary. Остальные экраны
сохраняют standalone summaries/fences. Derived sums остаются domain.

## T251 — Immutable files

После5bf34ec realbuilt Chromium/API/PG:6syntheticJPEG1600×1200 изrandomnoise,
каждый1582151bytes, безличныхпикселей/EXIF. Content-Length6GET=9492906bytes
наinitial, ещё9492906наfocus и ещё9492906наmetadataedit однойподписи.
Это payloadbytes поHTTP header, неTLS/headers. Разные UUID, общийsynthetic
source валиденпоMIME/размеру и реально декодируется клиентом.
Воспроизведение tests/e2e/file-requests.spec.ts, только localhost UUID fixture.
Первый probe ошибочно увиделfocus0: networkidle мог быть уже завершён ДО
обработки focus. Исправлено явным ожиданием ответа metadata/photos перед idle;
Today benchmark получил тот же synchronization (diary-state), счётчики12/11
подтверждены повторно. Нельзя использовать первыйfocus0 как измерение.

Решение T251a: достаточно cache одного проверенного Blob на mountedfile viewer,
идентичность owner+generation+epoch+fileID. Не globalMap/IndexedDB/serviceworker.
6gallerycards ограничивают типичныйживойобъём≤12MiB, comparisonещё≤4MiB; явно
открытые документы удерживают свои bytes доClose. URLs принадлежат BlobImage
и download, самcache URLsне создаёт. Metadata/focus не обновляют неизменные
bytes; metadataзапросы/auth и consistencyfences сохраняются.
Удаление уводит DTOизсписка/выбора иunmount очищаетcache/URL; logout/replace/
rotation/owner switch меняютepoch и очищаютданные. Pendingпослелюбойсмены
отвергается/не заполняетновыйcache; ошибки/null не кешируются, retryвозможен.
Close не отменяетHTTP; readerпослеunmount не кешируетответ. Междуэкранами
cacheнепереиспользуется — меньшеprivacy/lifecycle сложности, достаточная
измеренная экономия≈19MB наfocus+редактирование этойгалереи.

После T251a обеихprofiles: initial6GET≈9.49MB, focus0/metadata0. Cache local
mountedviewer реализован; failedmetadataпослеlocalDELETE ещё требуетT251b.
До этойзадачи полнаяочисткаdeletedBlob не заявляется и выпуск не выполняется.
