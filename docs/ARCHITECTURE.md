# Как устроен Health Diary

Код и конфигурация сверены 20.10.2026 после T260, код dev @ b58094a.
Исходный аудит относится к 9718e60; исправления учтены здесь. Это описание
репозитория. Установленные component SHA и результаты доставки фиксируются
отдельно в [DEPLOYMENT](DEPLOYMENT.md) и [PROGRESS](PROGRESS.md): наличие
артефакта не означает его активацию на VPS. Проверки/риски — [AUDIT](AUDIT.md),
очередь — [IMPROVEMENTS](IMPROVEMENTS.md), поиск — [PROJECT_MAP](PROJECT_MAP.md).

## Приложение за пять минут

Это личный дневник на русском языке: вес, питание, шаги, тренировки, фотографии,
документы и вручную введённые показатели. Пользователь видит только свой дневник.
Совместного доступа, медицинской интерпретации, AI и распознавания бланков нет.
Все восемь разделов работают через сервер. Демо-продукты загружаются отдельной
кнопкой и явно обозначены; демонстрационные записи создаёт отдельная CLI.

Браузер показывает React-приложение и отправляет запросы Fastify API. Сервер
проверяет вход, владельца и данные, затем обращается к PostgreSQL. Там находятся
и записи, и байты файлов. API — HTTP-интерфейс между браузером и сервером;
транзакция — группа изменений, которая сохраняется целиком либо откатывается.

Email-регистрация требует письма: адрес → подтверждение → установка пароля →
обычный вход. Старые аккаунты могут входить по логину. При отключённой почте
новый локальный аккаунт создаётся CLI. Сессия хранится в защищённой cookie,
состояние дневника — в памяти вкладки. Для работы нужен сервер; offline-очереди нет.

Старое хранилище IndexedDB оставлено для явного скачивания прежнего дневника и
изолированных тестов. Оно не обслуживает рабочие экраны. Полная JSON-копия
переносит файлы; текстовая — записи без вложений и показателей документов.
Эти скачанные копии не зашифрованы. Серверные GPG-копии — отдельный механизм.

Сценарии проверяются локально с настоящими API/PostgreSQL и Chromium.
T260: live release/health/readiness/401, публичные desktop/mobile формы и
сохранность данных при миграции подтверждены; production CRUD не запускался.
Safari/Firefox, screen reader и реальный телефон не покрыты. Независимый канал
оповещений ещё не выбран; подготовленные scripts не равны включённому monitor.
Пределы JSON-копий — [BACKUP_CAPACITY](BACKUP_CAPACITY.md).

## Общая схема

```mermaid
flowchart TB
    U[Пользователь] -->|формы и файлы| B[React в браузере]
    B -->|HTTPS same origin /api/v1| N[Nginx frontend VPS]
    N -->|SSH tunnel| A[Fastify API VPS]
    A -->|SQL и bytea| P[(PostgreSQL)]
    A -->|служебная ссылка без дневника| M[Локальный Postfix и OpenDKIM]
    M -->|SMTP| E[Почтовый провайдер получателя]
    P -->|pg_dump по расписанию| S[backup_send.py и GPG]
    S -->|SSH ciphertext| R[backup_receive.py на втором VPS]
```

Nginx отдаёт статику и проксирует API через закрытый туннель. API/БД слушают
loopback. SMTP передаёт только служебные письма. Схема получена из конфигурации
и инструкций; read-only инвентаризация T252 подтвердила основные процессы и связи.
Доставка кода и основных ops подтверждена T260; independent alerts остаются blocked. Подробности
и границы доверия — [PRIVACY_SECURITY](PRIVACY_SECURITY.md).

## Компоненты и зависимости

```mermaid
flowchart TB
    Main[main.tsx] -->|монтирует| Auth[AuthBoundary]
    Auth -->|session и diary готовы| App[App и DayProvider]
    App -->|hash route| UI[pages и ui]
    UI -->|публичные репозитории| DA[dataAccess.ts]
    DA -->|экспортирует| C[client HTTP session queries commands]
    UI -->|чистые расчёты| D[domain]
    UI -->|подготовка файлов| Media[media]
    C -->|HTTP| Routes[server runtime и Routes]
    Routes -->|валидация| D
    Routes -->|операция владельца| Records[Records и withCommand]
    Records -->|withUser и FORCE RLS| DB[(PostgreSQL)]
```

Направление рабочих зависимостей идёт от UI через client к серверу; схемы
domain общие для обеих сторон. Legacy подключается отдельным адаптером, а не
выбирается автоматически при недоступном API. Корень приложения не использует
роутер-библиотеку: маршрут задаёт fragment URL (`#weight` и т. п.).

| Расположение | Ответственность, вход → выход | Основные зависимости |
|---|---|---|
| `src/main.tsx`, `src/App.tsx` | DOM → вход/оболочка/экран | AuthBoundary, Navigation, DayContext |
| `src/client/AuthBoundary.tsx`, `auth.ts`, `emailRecovery.ts` | реквизиты/ссылка → сессия или состояние формы | HTTP, session, accountChanges |
| `src/client/session.ts`, `records.ts` | account/diary → epoch и контекст владельца | domain/session, input |
| `src/client/http.ts`, `upload.ts` | запрос → проверенный DTO/Blob | fetch, Zod, AbortController |
| `src/client/commands.ts`, `mutations.ts`, `confirmations.ts` | пользовательская команда → повторяемая запись | контекст, idempotency key, queries |
| `src/client/*Repository.ts`, `pages.ts`, `readState.ts` | параметры → записи/страницы/копия | HTTP, domain, consistentRead |
| `src/client/queries.ts`, `useDiaryQuery.ts`, `notices.ts` | чтение/инвалидация → data/current/ошибка | React, session |
| `src/pages` | выбор/черновик → действия репозиториев | dataAccess, domain, ui, media |
| `src/ui` | представление/подписи/фокус/графики | domain, dataAccess для чтений |
| `src/domain` | unknown/записи → runtime-схемы и чистые результаты | Zod; без SQL и React |
| `src/media` | локальный файл → проверенные bytes/подготовленное фото | domain, браузерные декодеры/canvas |
| `src/server/main.ts`, `runtime.ts`, `config.ts`, `app.ts` | env → listener, hooks, HTTP-ошибки | Fastify, pool, регистрация Routes |
| `src/server/*Routes.ts`, `fileRecords.ts` | HTTP → доступ/валидация/операция/ответ | authorize, Records, withCommand |
| `src/server/*Records.ts` | DTO → SQL → проверенный DTO | PoolClient, domain, recordValidation |
| `src/server/userTransaction.ts`, `writeCommand.ts`, `commands.ts` | account/command → атомарный результат | RLS, advisory lock, revision/generation |
| `src/server/*Snapshot.ts`, `restore*.ts`, `import*.ts`, `prepareFullImport.ts` | копия ↔ таблицы и файлы | backup-схемы, транзакция владельца |
| `src/server/migrations.ts`, `migrate.ts`, `migrations` | SQL с checksum → версия схемы | отдельная migrator-роль |
| `src/server/createAccount.ts`, `seedDemo.ts`, `demo*.ts`, `seed*.ts` | административный env → синтетический аккаунт/дневник | отдельный CLI, не публичные endpoints |
| `src/data`, `src/legacy` | прежняя IndexedDB → JSON/тестовый адаптер | Dexie; явное подключение |
| `tests`, `*.test.*`, `*.browser.test.tsx` | синтетические сценарии → assertions | Vitest, Playwright, testDatabase |
| `src/server/diagnostics.ts`, `deploy/watchdog_*.py`, `offsite_check.py` | безопасный сигнал/проверки доступности и ciphertext; не автоматическая активация | journal, локальный HTTP/SMTP, SHA sidecar |
| `deploy`, `.github/workflows/check.yml` | сборки/копии → доставка и диагностика | Python, systemd, Nginx, SSH, GPG |

Полный файловый охват, включая CSS, конфигурацию, SQL и тесты —
[AUDIT_SCOPE](AUDIT_SCOPE.md). Монорепозитория, workspaces, ORM, Redis, очереди
фоновых прикладных задач и отдельного файлового бакета в коде нет.

## Порядок запуска

1. PostgreSQL и отдельные SQL-роли готовятся вне API; миграции выполняет CLI
   `migrate.ts` под migrator-ролью. API не применяет их при старте.
2. `server/main.ts` вызывает `startApi(process.env)` из runtime: config → Fastify
   → необязательный локальный mailer → runtime pool → auth → upload transport
   → все Routes → readiness → loopback listener.
3. Без `DATABASE_URL` в development доступны только health/readiness. В
   production БД и HTTPS `APP_ORIGIN` обязательны. SIGTERM/SIGINT закрывают
   приложение; принудительный предел 125 секунд, systemd даёт 135 секунд.
4. `main.tsx` загружает CSS и StrictMode; AuthBoundary восстанавливает сессию и
   diary-state. Только после этого монтируются App и выбранная страница.
5. DayProvider хранит выбранный календарный день; timezone берётся из аккаунта
   через `configureCalendarTimezone`. Переключение страницы сохраняет день до
   размонтирования приложения. Неизвестный hash открывает «Сегодня».

## Экраны и путь действий

У всех восьми экранов одна прикладная роль — владелец вошедшего аккаунта.
Административного UI нет. Скрытие фото/документов не меняет права на API.

| Hash / экран | Возможности и обработчики | Репозиторий → серверные данные |
|---|---|---|
| `#today` / TodayPage | выбранный день, сводки, графики | TodaySummaryProvider → getTodaySummary → profile, weights, food, nutrition-days, steps, workouts, energy-plans |
| `#nutrition` / NutritionPage | FoodForm/FoodJournal: порция, правка, удаление; CopyMealForm; ProductCatalog/ProductForm; полнота дня | food/product/nutritionRepository → foodRoutes/productRoutes/nutritionRoutes |
| `#activity` / ActivityPage | StepsForm; WorkoutForm/WorkoutJournal; недельная сводка | steps/workoutRepository → stepsRoutes/workoutRoutes |
| `#weight` / WeightPage | дата/кг, график, выбор точки, правка/удаление | weightRepository, getWeightOverview → weightRoutes, weights |
| `#photos` / PhotosPage | PhotoForm, PhotoGallery, PhotoComparison: подготовка, загрузка, метаданные, сравнение/удаление | photo/fileRepository → photoRoutes/fileRecords |
| `#documents` / DocumentsPage | DocumentForm/List/File; LabSection/Form/List/Trends: оригинал, метаданные, ручные результаты/история | document/lab/labHistory/fileRepository → documentRoutes/labRoutes/fileRecords |
| `#profile` / ProfilePage | первый профиль+вес атомарно, затем правка профиля; справки | profileRepository → profileRoutes, profiles/weights |
| `#settings` / SettingsPage | EnergyPlanSettings/Form; PrivacySettings; EmailBinding; export/import; BrowserDiaryExport; DeleteDiary | energyPlan/visibility/backupRepository, confirmations, auth/email → plan/settings/backup/clearRoutes |

Формы обрабатывают submit через `useAction`, валидируют поля и вызывают функцию
репозитория. React хранит выбор/errors/pending и refs snapshot; текст большинства черновиков
остаётся в uncontrolled DOM-полях (defaultValue), суммы считаются
domain-функциями. `StorageBoundary` различает первоначальную ошибку/повтор;
`QueryFeedback` сообщает о сбое обновления уже показанных данных. `current=false`
блокирует запись по устаревшим данным, но snapshot редактора остаётся прежним.
Cancel в Product/Food/Workout/Lab доступен при устаревшем чтении без собственной
записи/конфликтующего удаления; отмена возвращает фокус на main. После 409
PrivacySettings/EnergyPlanForm удерживают draft и исходный snapshot. Только
явный отказ от ввода загружает текущую revision: refetch сам не перебазирует
черновик. EnergyPlan создаёт новую версию, не изменяет старую.

useVisibility хранит последнее принятое значение того же epoch: сбой refresh
не прячет открытый редактор/File. Первоначальная неизвестность считается
скрытой; реальное сокрытие/выход размонтируют экран. Права остаются на сервере.

## API и ошибки

Базовый путь `/api/v1`; полный перечень **62** явно зарегистрированных method/path,
поля DTO, MIME, заголовки, пагинация, результаты и статусы ошибок находятся в
[API_REFERENCE](API_REFERENCE.md). Таблица ниже связывает весь контракт с кодом;
суффиксы путей подразумевают общий базовый путь. Автоматические HEAD не включены.

| Методы и пути | Назначение, вход → результат | Регистрация / данные |
|---|---|---|
| GET `/health`, `/readiness` | публичные liveness и SQL SELECT 1 → 200/503 | app, readiness |
| POST `/auth/login`, `/auth/logout`; GET `/auth/session` | реквизиты/cookie → account+csrf либо 204 | auth, sessions, accounts |
| POST `/auth/email/register`, `/auth/email/request`, `/auth/email/complete` | email/zone или purpose/token/password → accepted | emailAuth и SQL-функции миграций 013/014/016 |
| GET `/auth/email`; POST `/auth/email/bind` | текущая сессия, адрес+пароль → состояние/accepted | emailBinding |
| GET/POST/PUT `/profile` | профиль+первый вес / правка → R или null | profileRoutes, profileRecords |
| GET/POST `/weights`; PUT/DELETE `/weights/:id` | asOf/before или дата/кг/ревизия → страница/R/204 | weightRoutes, weightRecords |
| GET/POST `/products`; GET/PUT `/products/:id`; POST `/products/seed` | курсор/фильтр или продукт → страница/R/added | productRoutes, productRecords, seedProducts |
| GET/POST `/food`; PUT/DELETE `/food/:id`; POST `/food/copy` | день/порция/снимок или source/meal/target → страница/R/count | foodRoutes, foodRecords |
| GET/PUT `/nutrition-days/:date` | дата/complete → R или null | nutritionRoutes, nutritionRecords |
| GET `/steps`; GET/PUT/DELETE `/steps/:date` | диапазон/дата/count → страница/R/null/204 | stepsRoutes, stepsRecords |
| GET/POST `/workouts`; PUT/DELETE `/workouts/:id` | день/kind/minutes/kcal → страница/R/204 | workoutRoutes, workoutRecords |
| GET/POST `/energy-plans`; GET `/energy-plans/effective/:date` | версия/snapshot/expectedRevision → страница/действующий план | planRoutes, planRecords |
| GET/POST `/photos`; PUT/DELETE `/photos/:id` | курсор/bytes+X-Record/метаданные → страница/R/204 | photoRoutes, photoRecords |
| GET/POST `/documents`; GET/PUT/DELETE `/documents/:id`; GET `/documents/:id/results-count` | bytes/метаданные/подтверждённое число результатов → страница/R/count/204 | documentRoutes, documentRecords |
| GET/POST `/lab-results`; PUT/DELETE `/lab-results/:id` | documentId/ручной number или text → страница/R/204 | labRoutes, labRecords |
| GET `/files/:id` | file UUID → авторизованный Blob либо 404 | fileRecords |
| GET `/diary-state`; PUT `/settings`; DELETE `/diary` | состояние/visibility/confirm → state/generation | settingsRoutes, diaryState, clearRoutes |
| GET/POST `/backup/text`, `/backup/full` | JSON attachment / import bytes+mode → копия/generation | backupRoutes, backupTransport, snapshots/restore |

`R={value,revision}`. JSON по умолчанию до 16 KiB. Изменение требует точного
Origin; приватные запросы — сессии, приватные изменения — CSRF. Владелец берётся
из сессии, не из тела. Ответ содержит `X-Account-Id`. Обычные команды требуют
generation, используют ревизию записи; клиент также посылает Idempotency-Key.
Для очистки/импорта обязательны ключ и глобальная changeRevision.

400 — неверные данные; 401 — вход; 403 — Origin/CSRF; 404 — нет объекта в
доступном владельцу наборе; 409 — конфликт; 413/415 — размер/тип; 429 — бюджет;
500 — безопасная общая ошибка; 503 — readiness/mail недоступны. Клиент переводит
статус в русский текст в `http.ts`, не показывает SQL/stack trace. Ошибка
фактической SMTP-доставки не меняет публичный accepted, чтобы не раскрывать адрес.

409 различается по причине. Revision conflict сохраняет draft до явного
перечитывания. command_capacity объясняет hard limit журнала. command_rotation:
команда не сохранена, служебный журнал очищен и generation сменился. Клиент
объясняет сброс старых форм и не исполняет команду автоматически.

## Состояние и согласованность

| Где | Что хранится / сколько живёт |
|---|---|
| React state/ref и DOM формы | маршрут/день/запись, errors/pending и исходная ревизия; большинство введённых значений — uncontrolled DOM-поля; до размонтирования |
| client/session | account, csrf, diary generation/revisions, epoch; в памяти вкладки; notices объясняет смену generation того же аккаунта |
| client/commands | до 128 неподтверждённых команд, повтор с тем же ключом; не переживают reload |
| client/queries | глобальная ревизия инвалидации и подписчики; полноценного общего кеша запросов нет |
| cookie | `__Host-health_session`, Secure/HttpOnly/SameSite=Lax; хеш сессии в PostgreSQL |
| accountChanges | BroadcastChannel-сигнал о смене аккаунта; без дневника и токенов; при запрете канала остаётся проверка владельца ответа |
| useFileReader / BlobImage | проверенный положительный Blob на время mounted viewer; object URL отзывается при cleanup |
| IndexedDB | прежний дневник и отдельные тестовые базы; явный экспорт, не fallback |
| PostgreSQL | текущие записи, байты, ревизии, журнал команд, сессии, email-токены и auth budgets |

requestApi проверяет путь/статус/владельца и ограничивает ожидание130 секунд.
Смена сессии отменяет запросы и делает старый epoch недействительным.
readPages собирает metadata по 100 элементов; без scope сохраняет собственную
пару diary-state. Глобальная инвалидация и полное чтение больших списков
пока остаются, общего постоянного query cache нет.

### Согласованное чтение и экран «Сегодня»

consistentRead сравнивает changeRevision/generation до/после чтения,
повторяет максимум три попытки, затем даёт конфликт. Явный маркер ReadScope
действует только внутри callback одной попытки: вложенные paged readers
не добавляют собственные fences, но проверяют owner/generation/epoch и
активность scope после await. Независимые параллельные чтения не делят scope.
Это оптимистическая согласованность HTTP-ответов, а не общая SQL-транзакция.

TodaySummaryProvider вызывает getTodaySummary на query cycle; retries и
инвалидации вызывают новые чтения. Profile/weights, food/nutrition-day/plan,
steps/workouts читаются по одному разу на попытку под общей внешней парой
diary-state. Все карточки Today используют этот snapshot; на других экранах
summary сохраняют standalone hooks. Failed refresh удерживает весь прежний
snapshot/current=false, полнота disabled до успешного повтора. Day/owner/epoch
не смешивают поздние ответы. Измеренные GET экрана: при открытии 31→12,
diary-state 21→5; focus/запись 30→11 и 20→4, без auth/session. Это request counts
на loopback, не production latency; [READ_PERFORMANCE](READ_PERFORMANCE.md).

### Служебный журнал команд

withCommand сначала проверяет replay/generation/revision. При pre-work
внешний порог 90000 новая допустимая команда откатывается; отдельная
owner transaction повторно проверяет generation/count под lock, удаляет
только commands и меняет generation. Записи/файлы/revisions сохраняются.
409 command_rotation объясняет отсутствие записи команды и сброс старых форм;
автоматического повтора работы нет. Direct/nested runCommand сохраняет
жёсткий предел 100000/command_capacity. [COMMAND_REPLAY](COMMAND_REPLAY.md) описывает
replay window, конкурентность и этот компромисс.

### Файлы: открытие, память, удаление

Любое вложение документа читается по «Открыть вложение». DocumentFileState
удерживает только in-flight promise: Close→Open/Retry не запускают параллельный
GET. Inner viewer использует один проверенный Blob для preview и download.
Close/retry/unmount очищают settled cache; BlobImage владеет URL и отзывает
его при cleanup. Физическая отмена GET по Close не добавлена.

PhotoGallery монтирует до шести карточек страницы; смена страницы снимает прежние
viewer/URL. PhotoComparison отдельно может загрузить два выбранных фото.
Metadata всех фото по-прежнему читается целиком. Количество viewer ограничено,
но точный heap/GPU limit не измерен.

useFileReader хранит только положительный Blob в mounted viewer по
owner/generation/session epoch/fileId. Focus/metadata edit обновляют списки
и доступ, сохраняя неизменные bytes. Null/ошибка не кешируются; Close/unmount/
смена идентичности очищают ссылки. Нет общего cache между разными viewer.

После успешного DELETE и assertContext репозиторий сообщает fileId+epoch:
соответствующий Blob/download/URL убирается даже при failed metadata refresh,
соседний viewer сохраняется. getFile подписан до завершения запроса и проверки
Blob, поэтому отложенный результат после удаления становится null, включая
повторное открытие через старый pending promise. Истории deletion нет.
В другой вкладке удаление заметно при успешном metadata refresh; уже полученные
клиентом bytes нельзя отозвать. Global/persistent cache не добавлен.

## Модель данных

Схема `health`, SQL в `migrations/001…016`; checksum и журнал миграций создаются
`server/migrations.ts`. UUID идентифицируют аккаунты/объекты; дата — строка
`YYYY-MM-DD` (SQL date), момент события — timestamptz. Часовой пояс аккаунта
используется для «сегодня». Числовые пределы — технические, не медицинские нормы.

| Таблица | Значимые поля и ограничения | Владелец / жизненный цикл |
|---|---|---|
| users | id, unique login, Argon2id password_hash, timezone, email/email_required/email_verified_at; unique lower(email) | аккаунт; очистка дневника его сохраняет |
| sessions | token_hash PK, user_id FK, created/expires/last_seen/revoked | срок/выход/смена пароля; секрет cookie не хранится открыто |
| account_tokens | token_hash PK, user_id, purpose, email, nullable registration_timezone для verify, срок/consumed; unique user+purpose | одноразовая ссылка, 1 час verify / 15 минут reset |
| auth_rate_limits | bucket/dimension/digest PK, attempts/expires_at | общий SQL-бюджет auth; истёкшее очищается при обращении |
| profiles | user_id PK, name, height_cm, birth_date?, formula_sex, revision | максимум один; первый вес создаётся атомарно |
| weights | user_id+id PK, date, kg, revision; unique user+date | FK на profiles; один вес в день |
| products | user_id+id, name/source, kcal/БЖУ, archived, revision | архивирование; история еды сохраняет снимок |
| food_entries | user_id+id, date/meal, product_id?, снимок в name/source/kcal/protein/fat/carbs, grams/note, revision | FK user+product; при удалении продукта связь NULL, снимок остаётся |
| nutrition_days | user_id+date PK, complete, revision | отсутствие отличается от явно полного пустого дня |
| steps | user_id+date PK, count, revision | отсутствие не равно введённому нулю |
| workouts | user_id+id, date/kind/minutes/kcal?/source/note, revision | отдельный журнал; не прибавляется повторно к общему расходу |
| energy_plans | user_id+id, effective_from/created_on, goal_kcal/method/factor/manual_kcal, snapshot_* поля, unique user+revision | append-only; начало сегодня или в будущем, прежний snapshot неизменен |
| files | user_id+id, purpose/mime/size/bytes; size=octet_length(bytes) | 100 MiB на владельца; связанный файл удаляется с записью |
| photos | user_id+id, file_id/purpose, date/title/note/width/height, revision | FK user+file+purpose; JPEG после подготовки, до 2048 px |
| documents | user_id+id, file_id/purpose, date/title/kind/note, revision | оригинал; удаление с подтверждением числа результатов |
| lab_results | user_id+id, document_id, date/name, number+operator ИЛИ text, unit/reference/note | FK user+document; каскадное удаление; правка повышает revision документа |
| settings | user_id PK, generation, visibility_defined/show_*, catalog_seeded, revision/change_revision | лениво создаётся; generation меняется при import/clear/ротации commands |
| legacy_metadata | user_id+id, value | совместимые поля копии; служебные ключи исключены |
| commands | user_id+id, request_hash, response JSONB, created_at | replay до ротации; внешний порог 90000, nested жёсткий предел 100000; owner cleanup меняет generation |
| schema_migrations | name PK, checksum, applied_at | системный журнал migrator; не данные пользователя |

Личные таблицы защищены FORCE RLS: PostgreSQL сам ограничивает строки по
`health.user_id`, установленному в транзакции. У runtime нет прав владельца схемы
или обхода RLS. Для users разрешён прямой SELECT, для sessions — прямые
SELECT/INSERT/UPDATE/DELETE; owner-RLS на них не применяется. Отдельные account
операции, tokens и auth budgets используют ограниченные SQL-функции.
Изменения одного владельца сериализуются advisory lock. FK включают user_id,
поэтому нельзя связать свой результат с чужим документом. Индексы покрывают
день/документ/план и уникальность; измерений EXPLAIN на большой БД не проводилось.

```mermaid
erDiagram
    direction TB
    users ||--o| profiles : owns
    profiles ||--o{ weights : has
    users ||--o| settings : owns
    users ||--o{ energy_plans : owns
```

Профиль нужен весам; настройки и планы принадлежат аккаунту независимо от него.

```mermaid
erDiagram
    direction TB
    users ||--o{ products : owns
    users ||--o{ food_entries : owns
    products o|--o{ food_entries : optional_link
    users ||--o{ nutrition_days : owns
```

Снимок продукта в food_entries не зависит от последующей правки каталога.

```mermaid
erDiagram
    direction TB
    users ||--o{ steps : owns
    users ||--o{ workouts : owns
```

Шаги и тренировки — независимые журналы, а не автоматически рассчитанный расход.

```mermaid
erDiagram
    direction TB
    users ||--o{ files : owns
    files ||--o| photos : photo_purpose
    files ||--o| documents : document_purpose
    documents ||--o{ lab_results : contains
```

Файл предназначен для фото либо документа; карточки проверяют purpose. Из files
каскад идёт к карточке/результатам; прикладное удаление карточки также удаляет файл
в транзакции. При проверке связей всегда учитывается user_id.

```mermaid
erDiagram
    direction TB
    users ||--o{ sessions : authenticates
    users ||--o{ account_tokens : verifies
    users ||--o{ commands : retries
    users ||--o{ legacy_metadata : preserves
```

Auth_rate_limits не имеет FK на users: псевдонимы IP/адреса ограничивают также
анонимные запросы. Schema_migrations описывает версии всей схемы, не аккаунта.

## Сквозные сценарии

### Вход и восстановление

```mermaid
sequenceDiagram
    actor U as Пользователь
    participant UI as AuthBoundary и auth.ts
    participant API as auth.ts и sessions.ts
    participant DB as PostgreSQL
    U->>UI: Почта или legacy login и пароль
    UI->>API: POST auth/login с Origin
    API->>DB: Rate budget и поиск аккаунта
    API->>API: Argon2 verify в ограниченном слоте
    API->>DB: Блокировка аккаунта и повторная сверка хеша
    API->>DB: Хеш новой сессии
    API-->>UI: Cookie и account/csrf
    UI->>API: GET diary-state
    API-->>UI: generation и revisions
    UI-->>U: App с личным дневником
```

Неверный пароль даёт 401, бюджет — 429; до готового diary-state App не
монтируется. Email-flow находится в RegistrationForm/PasswordRecovery →
emailAuth → SQL-функции миграций 013/014/016 → accountMail/Postfix. Ссылка содержит
секрет во fragment, UI удаляет его из history. Погашение атомарно меняет пароль,
отзывает все сессии/другие ссылки и требует нового входа. Часовой пояс
нового email_required аккаунта берётся из подтверждаемого токена016;
повторная регистрация связывает новый пояс только с реально выданной ссылкой.
Cooldown не меняет прежнюю ссылку, resend переносит её пояс. Старые NULL-токены
и legacy/reset сохраняют users.timezone. Ошибка доставки
не раскрывает существование адреса; искать причину следует в mail-контуре,
используя безопасные диагностические события ниже.

### Запись порции и конкурентная правка

```mermaid
sequenceDiagram
    participant UI as FoodForm
    participant C as foodRepository и commands
    participant API as foodRoutes и withCommand
    participant DB as PostgreSQL
    UI->>C: Создание порции или правка с revision
    C->>API: POST/PUT food с командными заголовками
    API->>API: authorize, CSRF и формат командных заголовков
    API->>DB: BEGIN, owner и advisory lock
    API->>DB: replay, generation и revision
    alt Новая команда ниже порога
        API->>API: Runtime-валидация DTO в Records
        API->>DB: Запись, snapshot, revisions и replay result
        DB-->>API: COMMIT
        API-->>C: R
        C-->>UI: Инвалидация и свежие чтения
    else Повтор ключа или конфликт revision
        API-->>C: Сохранённый результат либо 409
        C-->>UI: Результат либо сохранённый draft
    else Порог после валидного work
        API->>DB: ROLLBACK новой команды
        API->>DB: Новая owner transaction, lock, повтор generation/count
        API->>DB: Очистить commands и сменить generation
        DB-->>API: COMMIT служебного изменения
        API-->>C: 409 command_rotation
        C-->>UI: Команда не сохранена, новая эпоха
    end
```

FoodRecords читает пищевую ценность продукта с сервера; произвольный snapshot
клиента не принимается за истину. Историческая правка меняет дату/приём пищи/массу/заметку,
сохраняя исходный снимок. Domain/nutrition считает порции и итоги. Полнота дня
отдельна от наличия еды; баланс допустим лишь при подтверждённой полноте.
Формулы/округление/null описаны в [CALCULATIONS](CALCULATIONS.md).

### Загрузка и удаление документа

DocumentForm → `media/prepareDocument` проверяет тип/размер → upload отправляет
байты и канонический base64url `X-Record`. `uploadTransport.onRequest` проверяет
сессию/Origin/CSRF до чтения тела и резервирует один из двух слотов. Сервер
проверяет metadata, сигнатуру/декодирование и квоту; documentRecords атомарно
создаёт files+documents. Ошибка откатывает обе записи. PDF/JPEG/PNG/WebP
сохраняются оригинальными, до 20 MiB; фото проходят отдельную JPEG-подготовку
со снятием EXIF и пределом 10 MiB.

Кнопка «Открыть вложение» → DocumentFile → fileRepository → авторизованный GET files с проверкой владельца,
MIME/purpose и bytes → скачивание с UUID-именем. LabForm пишет результат только
в доступный документ. Перед удалением UI читает results-count и его revision;
DELETE требует исходную ревизию и точное подтверждённое число результатов.
Параллельное добавление результата повышает ревизию документа и даёт 409,
сохраняя данные. Удаление очищает результаты, карточку и файл транзакционно.

### Импорт и серверная резервная копия

FullBackupImport/SettingsPage → checkBackupFile/схема → подтверждение замены (UI всегда replace; API также допускает empty) → `backupRepository` → `backupRoutes`. Проверяются Origin/CSRF, ключ,
generation/changeRevision, UTF-8/MIME/размер, связи/квоты и файлы. Только затем
restoreFull/restoreText выполняет транзакцию владельца. Ошибка валидации/импорта сохраняет пользовательские записи/файлы;
command_rotation отдельно меняет служебный журнал/generation и требует
нового явного действия. Успех меняет generation, и клиент загружает новый diary-state.
Текстовый импорт сохраняет вложения; полный перенос включает их. Это не merge.

```mermaid
sequenceDiagram
    participant T as health-backup.timer
    participant S as backup_send.py
    participant DB as PostgreSQL
    participant R as backup_receive.py
    T->>S: Ежедневный запуск
    S->>DB: pg_dump
    DB-->>S: SQL archive
    S->>S: GPG публичным ключом и checksum
    S->>R: SSH только ciphertext
    R->>R: Проверка bytes/SHA, sidecar, retention
    R-->>S: Подтверждение
    S->>S: Локальная retention и status
```

Receiver установлен T260: свежая внешняя копия attested, для сохранённых
source-копий выполнен доверенный replay. Сейчас 7 verified/7 unattested;
последние сохраняются до доказательства происхождения либо штатной ротации. Отдельной прикладной очереди нет. Прежний локальный
monitor на data VPS проверяет свежесть/результат и шлёт сообщение при смене
состояния; он не переживает исчезновение этого VPS.

watchdog_probe проверяет health/readiness через фиксированный туннель второго
VPS; watchdog_monitor готовит state/dedup/SMTP policy и units. offsite_monitor
(T254d) добавляет отдельные state/dedup/email и hourly units, ещё не установлен.
offsite_check
сверяет найденные ciphertext с receiver-attested SHA без расшифровки.
Отсутствующий manifest — unattested, не healthy. Старым архивам backfill
допустим лишь по тому же имени и совпавшему SHA ещё сохранённого source.
Исчезновение всей прежней пары без исторического ledger не обнаруживается.
T252a выбрал самостоятельный frontend SMTP; T262 установил Postfix/OpenDKIM
с отдельным ключом, без data relay. Локальные gates PASS; T262a подтвердил
прямые A/SPF/DKIM и data --dns. Отправка deferred до PTR/receipt;
T262/T253a/T254c blocked. [MAIL_MONITOR](MAIL_MONITOR.md)
описывает точные записи. Артефакты не доказывают независимую доставку.

Private key остаётся вне VPS. Synthetic dump→GPG→restore текущих 20 таблиц,
файлов/ACL/RLS/отзыва auth проверен; это не расшифровка каждого рабочего архива.
[BACKUP_CONTROL](BACKUP_CONTROL.md) описывает границы,
[BACKUPS](BACKUPS.md) — восстановление,
[BACKUP_CAPACITY](BACKUP_CAPACITY.md) — пределы JSON.

## Запуск и работа разработчика

Требуются Node **24.22.0**, npm **11.19.1**, Python 3.12+, выделенный PostgreSQL
**18.3**, Docker и уже доступный образ postgres:18.3 (restore использует
--pull=never), GnuPG (gpg/gpgconf) и Chromium с системными библиотеками.
Lock воспроизведён npm ci при добавлении dev-only mermaid 12.2.0; версии
ранее зафиксированных пакетов не изменились.
На новой машине: `. ~/.nvm/nvm.sh`, `nvm install`, `nvm use`, `npm ci`.
Настройка ролей/контейнера/миграций и аккаунта — [README](../README.md).

| Команда | Что делает / побочные эффекты |
|---|---|
| `npm run dev` | Vite UI 5173, proxy `/api/` → 3001 |
| `npm run dev:api` | build:api и API; автоматического watch/restart нет |
| `npm run db:migrate` | DDL миграции выбранной БД; только осознанно под migrator |
| `npm run account:create`, `npm run db:seed` | административные записи/синтетический дневник; не обычная проверка |
| `npm run lint`, `npm run typecheck` | ESLint и строгие типы; отдельного formatter/gate форматирования нет |
| `npm run test:coverage` | Vitest unit/API + случайные тестовые БД; runtime-тест собирает и запускает API |
| `npm run test:browser:run` | компоненты/файлы в настоящем Chromium |
| `npm run build`, `npm run build:api` | перезаписывают игнорируемые dist / build-api |
| `npm run preview` | просмотр dist; APP_ORIGIN API должен соответствовать адресу/порту |
| `npm run test:e2e` | актуальный dist, preview 4173, synthetic API 4181, уникальные БД/аккаунты |
| `npm run check` | docs → lint → types → coverage → Browser → build → E2E |
| `npm run check:docs`, `git diff --check` | node tests, собственный Markdown/anchors и Mermaid syntax; пробелы diff; без автоматического rendering |
| `python3 -B -m unittest discover -s deploy -p 'test_*.py' -v` | синтетические тесты доставки/копий/монитора |
| `python3 -B deploy/verify_build.py dist` | проверяет настоящий tar сборки тем же read_build |

Не подставлять рабочую DATABASE_URL в тесты. `testDatabase` допускает только
loopback `/health_test`, но SQL-роли общие для кластера: нужен выделенный тестовый
контейнер. Дочерний runtime smoke автоматически
очищает app env через runtimeEnvironment; очистка shell — дополнительная защита.
Cleanup учитывает только acquired UUID ресурсы, пытается очистить каждый
независимо и сохраняет ошибки; старые неизвестные остатки не удаляет. При наличии
готового кеша WSL-библиотек аудиту помог
`LD_LIBRARY_PATH=/home/artur/.cache/health-browser-deps/root/usr/lib/x86_64-linux-gnu`;
это особенность данной машины, не установка зависимостей и не проектный default.

### Переменные окружения

Источник значений/проверок: [.env.example](../.env.example), config, database,
accountMail, CLI и тестовые конфигурации. Примеры синтетические; секреты
не задаются в `VITE_*`. Серверный env-файл — закрытый, права 600.

| Имя | Назначение / обязательность / безопасный пример |
|---|---|
| NODE_ENV | development по умолчанию; production включает строгие требования |
| API_HOST / API_PORT | loopback `127.0.0.1` / `3001`; production unit использует свой env |
| API_TRUST_PROXY | `false` по умолчанию; true только с заменяющим X-Forwarded-For loopback proxy |
| DATABASE_URL | runtime PostgreSQL; обязательно в production; `postgresql://health_app:REPLACE@127.0.0.1:55433/health` |
| APP_ORIGIN | при DATABASE_URL обязателен точный origin; `http://127.0.0.1:5173`, production только HTTPS |
| MIGRATION_DATABASE_URL | отдельно для миграций/admin CLI; не в production API env |
| ADMIN_LOGIN / ADMIN_PASSWORD / ADMIN_TIMEZONE | CLI создания аккаунта; `synthetic-user` / закрытый ввод / `UTC`; не публичный UI |
| MAIL_ENABLED / MAIL_SMTP_PORT | локальный SMTP: `false` / `25`; нет remote host/password env |
| HEALTH_API_PROXY | только Vite/preview; `http://127.0.0.1:3001` |
| TEST_DATABASE_URL | выделенный тестовый cluster `/health_test`; synthetic URL из README |
| PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH | необязательный явный путь системного Chromium |
| LD_LIBRARY_PATH / DISPLAY / WAYLAND_DISPLAY | системная загрузка библиотек / выбор режима Browser; не конфигурация приложения |
| HEALTH_E2E_ADMIN_URL / HEALTH_E2E_RUNTIME_URL | создаёт local E2E setup для fixtures; не задавать production URL |
| EXPECTED_RELEASE / HEALTH_DEMO_CREDENTIALS | точный SHA и путь к закрытым синтетическим реквизитам для tests/deployed; baseURL закреплён в конфигурации; изменяющие сценарии требуют явного разрешения |

Deploy/backup JSON, systemd пути, SSH/GPG и GitHub secrets не являются frontend
env; их полный безопасный перечень — [DEPLOYMENT](DEPLOYMENT.md),
[BACKUPS](BACKUPS.md), [MAIL_DNS](MAIL_DNS.md). Токены/пароли здесь не приводятся.

### CI, доставка и эксплуатация

```mermaid
flowchart TB
    G[Push dev или PR] -->|checkout точного SHA| CI[GitHub Actions]
    CI -->|параллельно| ST[static coverage browser build]
    ST -->|один artifact ID dist| E2E[Desktop и mobile E2E с разными PostgreSQL]
    E2E -->|все gates| CH[Итоговый check]
    CH -->|только разрешённый dev push или dispatch| DEP[Frontend deploy по SSH]
    DEP -->|archive current previous| NG[Nginx и release.txt]
    CH -->|отдельная ручная процедура| AP[API artifact миграции и systemd]
```

Workflow закрепляет Actions по SHA, Node по .nvmrc; build job также проверяет
Python deploy, tar и monitor units. Runtime unit-тест внутри coverage выполняет
build:api, поэтому серверная сборка уже участвует в CI. E2E и deploy используют
один dist artifact ID. PR и master не публикуются. API/БД/SMTP не развёртываются
автоматически этим frontend job: для них нужны артефакт/SHA256, свежая внешняя
копия, атомарный current и проверенный rollback по инструкции.

Liveness: GET health; SQL-ready: GET readiness; без cookie GET profile даёт 401.
Readiness не проверяет миграции/SMTP/копию. Frontend SHA — release.txt.
Для API обязательны точный артефакт/SHA256, проверенная свежая внешняя копия
перед migration016, npm ci --omit=dev и atomic current/rollback.

diagnostics пишет три события: api_internal_error, email_delivery_failed,
email_binding_failed. Поля — event, UTC time, случайный ID, suppressed count;
до 30 событий каждого типа в минуту. Нет account/адреса/IP/URL/token/body/SQL/raw error.
Отказ sink не завершает API. Это сигнал отказа, не полная причина инцидента.

API unit policy установлена T260 для journal namespace health-diary:
16 MiB persistent / 8 MiB runtime, семь дней. Disk pressure/active file не гарантируют
точную длительность хранения. Для просмотра: journalctl
--namespace=health-diary -u health-api; до неё default namespace.
Точный unit verify, activation и synthetic diagnostic function в transient unit
прошли T260. Реальный сбой API ради проверки логов не вызывался.
Backup/monitor логи/status-файлы описаны профильными runbooks.

Frontend config с T260 сжимает только публичный /assets/, API gzip off;
binary MIME локального TTF также включён. Bytes/URLs/CSP/cache прежние.
Native isolated helper проверяет encoding/decoded bytes/API exclusion без
reload рабочего Nginx; это manual deployment gate, не unittest discovery.
Модель дала assets 1045464→440551 bytes и median FCP 3476→1500 ms,
не production p95. App сохраняет static imports: T259 отложила lazy loading,
warning threshold не повышен. [COLD_LOAD](COLD_LOAD.md) содержит все точки.

Watchdog/offsite timers не активируются без независимого транспорта.
Не проверять эксплуатацию созданием реальных медицинских записей.
Приёмочные команды/установленные версии — [DEPLOYMENT](DEPLOYMENT.md),
контроль копий — [BACKUP_CONTROL](BACKUP_CONTROL.md).

## Где менять код, если нужно…

| Изменение | Начать здесь / затем проверить |
|---|---|
| Добавить экран | Navigation routes + App + pages + CSS; dataAccess/client при необходимости; keyboard/empty/error/E2E |
| Изменить расчёт | CALCULATIONS → domain функция/схема → unit границы/null/единицы → представление |
| Добавить поле | domain schema → новая неизменяемая SQL migration → Records/Routes → client response schema → форма → backups/import/legacy compatibility и тесты |
| Исправить доступ | auth/sessions/httpSecurity → withUser/RLS/SQL grants; проверка чужих объектов через runtime роль |
| Изменить повтор/конкурентность | commands/writeCommand/diaryState ↔ client commands/records/readState; response-loss, 409, generation и reload |
| Исправить файл/квоту | domain attachment/storedFile, media, uploadTransport/attachmentValidation/fileRecords; malformed bytes/abort/rollback |
| Подключить интеграцию | отдельная карточка и согласование scope; сначала privacy/контракт/ошибки; существующая внешняя интеграция — только mail/backup |
| Изменить доставку/копию | deploy и runbooks, Python/regression/verify_build, затем отдельное разрешение публикации |

## Термины и ограничения

**DTO** — проверяемая структура данных на границе API. **Revision** — версия
записи, **changeRevision** — общий счётчик изменений, **generation** — новая
эпоха дневника после замены/очистки/ротации commands. **Epoch** — локальный
счётчик клиента: поздний ответ прежнего контекста отбрасывается. **Blob** —
файл в памяти браузера; **object URL** — временная ссылка для его отображения. **Idempotency** — повтор запроса возвращает
прежний результат без второй записи. **RLS** — ограничения строк самой БД.
**Snapshot** — неизменяемый снимок исходных значений. **CSP** — политика браузера,
ограничивающая исполняемый код/сетевые обращения. **Readiness** — готовность
обслуживать SQL, **liveness** — факт работы HTTP-процесса.

Один владелец, нет общего доступа/AI/offline; публичного удаления аккаунта нет,
«Удалить дневник» сохраняет аккаунт. Расход/ИМТ — справочные оценки, null не ноль.
БД не шифруется приложением at rest; администраторы VPS входят в доверенную зону.
Проверены отдельные synthetic read/transfer/export/cold-load границы;
production load/heap/p95 не измерены. Metadata читается полностью, JSON
не покрывает любое сочетание допустимых данных, independent alerts требуют канала. Схемы отражают исходный код, а не
гарантируют текущее состояние production или отсутствие других дефектов.
