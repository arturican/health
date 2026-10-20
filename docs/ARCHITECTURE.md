# Как устроен Health Diary

Исходный срез 20.10.2026: `dev` @ `9718e60423c28bbc708db95bf045db6403575769`.
Исправления T232–T240a учтены ниже; статусы и проверки — в TASKS/PROGRESS.
Это описание существующего кода. Проверки и ограничения — [AUDIT](AUDIT.md),
будущие изменения — [IMPROVEMENTS](IMPROVEMENTS.md), быстрый поиск файлов —
[PROJECT_MAP](PROJECT_MAP.md).

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

Главные сценарии подтверждены локальными тестами; актуальность установленного
VPS, Safari/Firefox, screen reader и реальная доставка писем в этом аудите
не проверялись. Найденные сбои восстановления форм описаны в AUDIT.

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
и инструкций, текущее состояние серверов здесь не инспектировалось. Подробности
и границы доверия — [PRIVACY_SECURITY](PRIVACY_SECURITY.md).

## Компоненты и зависимости

```mermaid
flowchart TB
    Main[main.tsx] -->|монтирует| Auth[AuthBoundary]
    Auth -->|session и diary готовы| App[App и DayProvider]
    App -->|hash route| UI[pages и ui]
    UI -->|публичные репозитории| DA[dataAccess.ts]
    DA -->|экспортирует| C[client HTTP session queries commands]
    UI -->|чистые расчёты и файлы| D[domain и media]
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
| `#today` / TodayPage | выбранный день, сводки, графики | summaries → profile, weights, food, nutrition-days, steps, workouts, energy-plans |
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
Ограничения Cancel/повторного сохранения — AUD-002/AUD-003 в аудите.

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

## Состояние и согласованность

| Где | Что хранится / сколько живёт |
|---|---|
| React state/ref и DOM формы | маршрут/день/запись, errors/pending и исходная ревизия; большинство введённых значений — uncontrolled DOM-поля; до размонтирования |
| client/session | account, csrf, diary generation/revisions, epoch; в памяти вкладки; notices объясняет смену generation того же аккаунта |
| client/commands | до 128 неподтверждённых команд, повтор с тем же ключом; не переживают reload |
| client/queries | глобальная ревизия инвалидации и подписчики; полноценного общего кеша запросов нет |
| cookie | `__Host-health_session`, Secure/HttpOnly/SameSite=Lax; хеш сессии в PostgreSQL |
| accountChanges | BroadcastChannel-сигнал о смене аккаунта; без дневника и токенов; при запрете канала остаётся проверка владельца ответа |
| Blob/object URL | временные изображения и скачивания; URL освобождаются при cleanup |
| IndexedDB | прежний дневник и отдельные тестовые базы; явный экспорт, не fallback |
| PostgreSQL | текущие записи, байты, ревизии, журнал команд, сессии, email-токены и auth budgets |

`requestApi` проверяет путь/статус/аккаунт и ограничивает ожидание 130 секундами.
Смена сессии отменяет запросы и делает старый epoch недействительным.
`readPages` собирает все страницы по 100 элементов. `consistentRead` сверяет
changeRevision до/после составного чтения, повторяет до трёх раз, затем даёт
конфликт. Сетевой сбой не превращается в пустой дневник. Сейчас инвалидация
глобальная; стоимость больших историй и файлов — AUD-007.

## Модель данных

Схема `health`, SQL в `migrations/001…016`; checksum и журнал миграций создаются
`server/migrations.ts`. UUID идентифицируют аккаунты/объекты; дата — строка
`YYYY-MM-DD` (SQL date), момент события — timestamptz. Часовой пояс аккаунта
используется для «сегодня». Числовые пределы — технические, не медицинские нормы.

| Таблица | Значимые поля и ограничения | Владелец / жизненный цикл |
|---|---|---|
| users | id, unique login, Argon2id password_hash, timezone, email/email_required/email_verified_at; unique lower(email) | аккаунт; очистка дневника его сохраняет |
| sessions | token_hash PK, user_id FK, created/expires/last_seen/revoked | срок/выход/смена пароля; секрет cookie не хранится открыто |
| account_tokens | hash PK, user_id, purpose, email, nullable registration_timezone для verify, срок/consumed; unique user+purpose | одноразовая ссылка, 1 час verify / 15 минут reset |
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
| commands | user_id+id, request_hash, response JSONB, created_at | replay до ротации; outer threshold90000, nested hard100000; owner cleanup меняет generation |
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
учитывая ограниченную диагностику AUD-009.

### Запись порции и конкурентная правка

```mermaid
sequenceDiagram
    participant UI as FoodForm
    participant C as foodRepository и commands
    participant API as foodRoutes и withCommand
    participant DB as PostgreSQL
    UI->>C: Создание с productId или правка FoodEntry с исходной revision
    C->>API: POST или PUT food с cookie CSRF generation key
    API->>API: authorize и проверка командных заголовков
    API->>DB: BEGIN set owner и advisory lock
    API->>DB: Проверить key generation и revision
    alt Команда новая и данные актуальны
        API->>API: Runtime-валидация DTO в Records
        API->>DB: Сохранить запись snapshot changeRevision и response
        DB-->>API: COMMIT
        API-->>C: R
        C-->>UI: Инвалидация и свежие чтения
    else Повтор или конфликт
        API-->>C: Сохранённый результат либо 409
        C-->>UI: Результат либо ошибка с сохранением черновика
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
restoreFull/restoreText выполняет транзакцию владельца. Ошибка сохраняет прежний
дневник целиком; успех меняет generation, и клиент загружает новый diary-state.
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
    R->>R: Проверка имени размера hash и retention
    R-->>S: Подтверждение
    S->>S: Локальная retention и status
```

Это единственная показанная здесь фоновая обработка; отдельной прикладной очереди
нет. Monitor проверяет свежесть/результат локально и отправляет сообщение при
смене состояния. Ключ расшифрования не должен находиться на VPS. Восстановление
в отдельную БД и отзыв восстановленных сессий — [BACKUPS](BACKUPS.md).

## Запуск и работа разработчика

Требуются Node **24.22.0**, npm **11.19.1**, Python 3.12+, выделенный PostgreSQL
**18.3**, Docker и уже доступный образ postgres:18.3 (restore использует
--pull=never), GnuPG (gpg/gpgconf) и Chromium с системными библиотеками.
Зафиксированные зависимости уже установлены; аудит не выполнял переустановку.
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
| `npm run test:browser:run` | 37 файлов компонентов/файлов в настоящем Chromium |
| `npm run build`, `npm run build:api` | перезаписывают игнорируемые dist / build-api |
| `npm run preview` | просмотр dist; APP_ORIGIN API должен соответствовать адресу/порту |
| `npm run test:e2e` | актуальный dist, preview 4173, synthetic API 4181, уникальные БД/аккаунты |
| `npm run check` | docs → lint → types → coverage → Browser → build → E2E |
| `npm run check:docs`, `git diff --check` | существование локальных ссылок / пробелы diff; не рендер Mermaid |
| `python3 -B -m unittest discover -s deploy -p 'test_*.py' -v` | синтетические тесты доставки/копий/монитора |
| `python3 -B deploy/verify_build.py dist` | проверяет настоящий tar сборки тем же read_build |

Не подставлять рабочую DATABASE_URL в тесты. `testDatabase` допускает только
loopback `/health_test`, но SQL-роли общие для кластера: нужен выделенный тестовый
контейнер. До smoke-suite удалять прикладные env из shell (AUD-005). При наличии
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

Liveness: GET health; SQL-ready: GET readiness; защита доступа: GET profile без
cookie должен дать 401. Readiness не проверяет миграции/SMTP/резервную копию.
Frontend SHA проверяется release.txt. Логи API после установки T241a — journalctl --namespace=health-diary -u health-api; до неё — default namespace. Копий —
health-backup/health-backup-monitor и status-файлы; пути и команды — профильные
runbooks. API не логирует тела/SQL/реквизиты; диагностика 500 сейчас ограничена.
Не проверяйте эксплуатацию созданием реальных медицинских записей.

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
эпоха дневника после замены/очистки. **Idempotency** — повтор запроса возвращает
прежний результат без второй записи. **RLS** — ограничения строк самой БД.
**Snapshot** — неизменяемый снимок исходных значений. **CSP** — политика браузера,
ограничивающая исполняемый код/сетевые обращения. **Readiness** — готовность
обслуживать SQL, **liveness** — факт работы HTTP-процесса.

Один владелец, нет общего доступа/AI/offline; публичного удаления аккаунта нет,
«Удалить дневник» сохраняет аккаунт. Расход/ИМТ — справочные оценки, null не ноль.
БД не шифруется приложением at rest; администраторы VPS входят в доверенную зону.
Масштаб больших историй не профилировался. Схемы отражают исходный код, а не
гарантируют текущее состояние production или отсутствие других дефектов.

Ротация служебного журнала описана в [COMMAND_REPLAY](COMMAND_REPLAY.md):
после pre-work threshold валидная новая команда откатывается, отдельная
owner transaction очищает commands/меняет generation и возвращает409.
Сохранённые записи и revisions не меняются; старые формы/контексты нужно
загрузить заново. Реализация — commands и writeCommand, новый сервис не добавлен.

После T246 вложения не читаются до открытия. Превью и download используют один
проверенный Blob (BlobImage); закрытие освобождает URL. Pending read одного
mounted FileState переиспользуется, settled bytes отдельно не кешируются.

После T247 PhotoGallery монтирует6карточек, следующие/предыдущие страницы
заменяют их и освобождают URL. Metadata всех фото доступна PhotoComparison;
оно загружает лишь явно выбранные2фото. Серверные списки пока читаются целиком.

После T249/T249a summaries передают branded ReadScope в paged repositories.
Одна внешняя пара diary-state защищает все вложенные страницы сводки; scoped
reader проверяет owner/generation и время жизни scope после await. Default
list без scope сохраняет свою пару fences;3retry/409 и cursor guards прежние.

После T250/T250a TodayPage оборачивает карточки TodaySummaryProvider.
Он вызывает getTodaySummary одинраз: profile/weights, food/nutrition-day/plan,
steps/workouts. Единая before/after diary-state пара защищает весь snapshot.
NutritionSummary/EnergySummary/ActivitySummary берут shared data/current;
TodayMeals и вес используют те же данные. В других экранах компоненты сохраняют
свои standalone hooks. При failedrefresh все карточки удерживают прежний
snapshot и отметка полноты disabled до успешного обновления; day/owner/epoch
не смешиваются. Формулы и модель хранения не менялись.
