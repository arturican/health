# Дневник здоровья

Развёрнутое приложение: <https://dev.arturican.com>.
Размещение и перенос локального дневника: [DEPLOYMENT.md](docs/DEPLOYMENT.md).

Локальное приложение для личных записей на React и TypeScript. Готовый MVP
содержит восемь разделов: «Сегодня», профиль, вес с графиком и справочным ИМТ,
питание, активность, фото, документы с ручными показателями и настройки.
Можно редактировать записи, сравнивать фото по датам, сохранять версии цели и
оценки расхода, экспортировать и восстанавливать резервные копии.

Данные и файлы хранятся в IndexedDB браузера. Отдельный каркас API пока не хранит
дневники; синхронизации, совместного доступа и AI нет. Приложение не даёт медицинских рекомендаций. Полный выполненный
план — [TASKS.md](TASKS.md), результаты проверок — [PROGRESS.md](docs/PROGRESS.md).

## Запуск в WSL / Linux

В существующей папке проекта обнови ветку `dev`:

```bash
cd ~/health
git fetch origin
git switch dev
git pull --ff-only
nvm install
nvm use
npm ci
npm run dev
```

Нужен установленный nvm. Версия Node закреплена в [.nvmrc](.nvmrc): **24.22.0**,
npm — **11.19.1**. Если nvm отсутствует, установи эти версии своим менеджером Node.
Проверь их командами `node -v` и `npm -v`. Ошибка `EBADENGINE` на Node 22 означает,
что сначала нужно переключить Node/npm и повторить `npm ci`; без успешной установки
зависимостей команда запуска не найдёт Vite. Проверку engines отключать не нужно.

Открой адрес из вывода Vite, обычно [http://localhost:5173](http://localhost:5173).
Оставь терминал работающим. Для просмотра production-сборки выполни
`npm run build`, затем `npm run preview` и открой напечатанный адрес
(обычно `http://localhost:4173`).

## Первое использование

Изолированный API (пока только liveness): `npm run dev:api`.
Для production: `npm run build:api`, затем `npm run start:api`.
Настройки NODE_ENV, API_HOST и API_PORT — в [.env.example](.env.example).
Скопируйте его в закрытый `.env` (`chmod 600 .env`); секреты никогда не задаются
через VITE_*. По умолчанию API слушает `127.0.0.1:3001`;
`GET /api/v1/health` возвращает liveness, без проверки БД.
SIGINT/SIGTERM корректно закрывают listener. Неверные настройки и занятый порт
завершают процесс с кодом 1. Серверная сборка находится в `build-api`, отдельно
от frontend `dist`; Node-bundle собирает установленный Vite после отдельной
строгой проверки TypeScript и переиспользует domain-схемы.
Сайт пока использует IndexedDB; дальнейшие этапы —
[SERVER_STORAGE.md](docs/SERVER_STORAGE.md).

1. Заполни профиль и первое измерение веса.
2. В питании добавь собственный продукт или явно загрузи учебные примеры,
   затем внеси порцию. Отметка полноты дня нужна для оценки суточного баланса.
3. Добавь шаги, тренировки и при необходимости цель/оценку расхода в настройках.
   Шаги и тренировки повторно не прибавляются к общему расходу.
4. Фото и документы добавляются с устройства. Показатели бланка вводятся вручную.
5. В настройках скачай полную резервную копию для переноса всех записей и файлов.
   Текстовая копия переносит журналы и планы без вложений и показателей документов.

Хранилище зависит от профиля браузера, протокола, хоста и порта: адреса dev и
preview используют разные базы. Очистка данных сайта может удалить дневник.
Скрытие разделов не защищает записи паролем; база и копии не шифруются приложением.
Для повторного открытия нужен работающий сервер: PWA и автономная загрузка
не реализованы. Подробности — [PRIVACY_SECURITY.md](docs/PRIVACY_SECURITY.md).

## Проверки в браузере

Аккаунты создаёт администратор: `npm run account:create` с серверными
MIGRATION_DATABASE_URL, ADMIN_LOGIN, ADMIN_PASSWORD, ADMIN_TIMEZONE.
Для закрытого файла: `npm run build:api`, затем
`node --env-file=/закрытый/путь/account.env build-api/createAccount.js`.
Файл должен иметь права 600; не храните его в Git и не включайте в окружение
обычного API. Пароль 15–1024 символа, пробелы сохраняются; timezone, например,
Europe/Moscow. Команда не печатает пароль или хеш. Повторный логин отклоняется
без смены прежнего пароля. Публичной регистрации пока нет.

Демонстрация: после миграций `npm run db:seed` читает настройки из закрытого
`.env`; для отдельного файла выполните `npm run build:api`, затем
`node --env-file=/закрытый/путь/demo.env build-api/seedDemo.js`.
Нужны MIGRATION_DATABASE_URL, DATABASE_URL ограниченной роли, ADMIN_LOGIN,
ADMIN_TIMEZONE и ADMIN_PASSWORD (пароль обязателен только при создании аккаунта).
Файл с правами 600 держите вне Git и окружения обычного API. Используйте отдельный
демологин. Seed создаёт 90 дней вымышленных наблюдений, геометрические JPEG,
учебные PDF и показатели; повтор не меняет записи и пароль. Непустой дневник без
маркера демонстрации отклоняется. После ошибки заполнения аккаунт может уже
существовать, но частичные записи откатываются; ту же команду можно повторить.
Период определяется днём первого успешного запуска в часовом поясе аккаунта.

Для маршрутов авторизации задайте DATABASE_URL ограниченной роли и APP_ORIGIN
(точный origin frontend, без завершающего `/`). Production требует HTTPS origin
и отклоняет административные переменные MIGRATION_DATABASE_URL/ADMIN_PASSWORD.
Маршруты: POST `/api/v1/auth/login`, GET `/api/v1/auth/session`, POST
`/api/v1/auth/logout`. Вход получает JSON login/password и правильный Origin;
ответ возвращает аккаунт и CSRF, cookie — Secure/HttpOnly/SameSite=Lax.
Для последующих изменений нужны Origin и X-CSRF-Token из ответа сессии.
Срок сессии 7 суток, idle 24 часа. Пока интерфейс входа не подключён.
Лимит попыток находится в памяти одного API и сбрасывается при перезапуске;
X-Forwarded-For не доверяется, поэтому за proxy лимит IP общий.

Экспорт: GET `/api/v1/backup/text` скачивает текстовую v1-копию владельца,
GET `/api/v1/backup/full` — полную, с исходными вложениями и метаданными,
включая скрытые разделы. Один согласованный снимок PostgreSQL, без generation
и данных авторизации. Лимиты 20/200 MiB соответственно; превышение — 413,
вторая параллельная операция копии — 429. Ответы имеют no-store/attachment.
Восстановление: POST `/api/v1/backup/text`, Content-Type
`application/vnd.health-diary+json`, тело — UTF-8 JSON v1 до 20 MiB. Обязательны
Idempotency-Key, X-Diary-Generation и X-Diary-Revision из актуального GET
/diary-state. X-Import-Mode: empty по умолчанию; replace используется только
после подтверждения замены. Текстовое восстановление сохраняет вложения и
видимость, меняет generation; повтор использует прежние заголовки и тело.
POST `/api/v1/backup/full` принимает полную v1-копию до 200 MiB с теми же
заголовками. Перед транзакцией проверяются файлы; подтверждённая замена меняет
все разделы/вложения и метаданные. Учётные данные и сессии не импортируются.

Настройки: GET `/api/v1/diary-state` возвращает generation, value (видимость),
revision, changeRevision и catalogSeeded. Первое чтение создаёт начальные настройки аккаунта.
PUT `/api/v1/settings` принимает `{ value, revision }` с защитой от конфликтов.
Все изменяющие запросы дневника, включая загрузки файлов,
требуют X-Diary-Generation из GET. Необязательный
Idempotency-Key (новый UUID для каждого действия, тот же для повтора) сохраняет
ответ атомарно; другое тело с тем же ключом возвращает 409. Для файлов ключ
учитывает метаданные и SHA256 содержимого. Ключ действия должен отличаться
от UUID сущности и вложенной команды копирования еды.
changeRevision — общий счётчик успешных изменений дневника. X-Diary-Revision
позволяет требовать совпадения этого счётчика перед командой; конфликт — 409.
Повтор с тем же ключом не увеличивает счётчик повторно.

Очистка: DELETE `/api/v1/diary` с JSON `{ "confirm": "delete-diary" }`
требует Idempotency-Key, X-Diary-Generation и X-Diary-Revision, полученные
для подтверждаемого состояния. Удаляет все записи и вложения владельца,
сбрасывает настройки и возвращает новую generation; аккаунт/сессии сохраняются.
Новая запись после открытия подтверждения приводит к 409 вместо удаления.

Показатели: GET `/api/v1/lab-results` принимает documentId/after/limit и возвращает
историю с документами-источниками. POST принимает `{ value, revision: null }`,
PUT/DELETE `/:id` требуют revision. Значение — число с оператором либо текст;
источник неизменяемый. Изменение показателя повышает также revision документа.

Документы: POST `/api/v1/documents` использует тот же бинарный транспорт и
X-Record `id, fileId, date, title, kind, note, mime`. GET поддерживает список
after/limit, `/:id` и `/:id/results-count`. PUT `/:id` принимает изменяемые поля
и revision; DELETE — `{ revision, expectedResults }`, где null разрешён лишь
без показателей, иначе требуется их текущее количество.

Файлы: GET `/api/v1/files/:id` возвращает исходные байты только владельцу сессии,
с no-store/nosniff, attachment и sandbox CSP. Для бинарных загрузок подготовлен
транспорт application/octet-stream: X-Record содержит UTF-8 JSON в base64url
без padding, до 4096 символов. Сессия проверяется до тела, одновременно до двух
загрузок. POST `/api/v1/photos` принимает подготовленный JPEG и X-Record с
`id, fileId, date, title, note, mime`. Размеры определяет сервер. GET `/photos`
использует after/limit; PUT `/:id` принимает `{ value: { date, title, note }, revision }`,
DELETE `/:id` — `{ revision }`. Карточка и файл создаются/удаляются атомарно.

Планы: GET `/api/v1/energy-plans?before=REVISION&limit=100` возвращает страницы
по убыванию revision; GET `/effective/:date` — действующую версию либо null.
POST принимает `{ id, value: EnergyPlanInput, expectedRevision }` (null для первой).
Снимок и номер версии создаёт сервер. Повтор id возвращает прежний результат,
другие параметры того же id или устаревшая expectedRevision дают 409.

Тренировки: GET `/api/v1/workouts?date=YYYY-MM-DD&after=UUID&limit=100`
возвращает `{ items, nextAfter }`. POST принимает `{ value: Workout, revision: null }`,
PUT `/:id` — полный Workout и текущую revision; DELETE `/:id` — `{ revision }`.

Шаги: GET `/api/v1/steps?from=YYYY-MM-DD&to=YYYY-MM-DD&before=YYYY-MM-DD&limit=100`
возвращает `{ items, nextBefore }`. GET `/:date` возвращает null либо запись;
PUT `/:date` принимает `{ value: { date, count }, revision }` (null при создании),
DELETE `/:date` — `{ revision }`.

Полнота: GET `/api/v1/nutrition-days/:date` возвращает null либо запись с revision;
PUT принимает `{ value: { date, complete }, revision }` (null при создании).
POST `/api/v1/food/copy` принимает `{ commandId, source, meal, target }`,
возвращает `{ count }`. Повтор commandId с теми же параметрами не создаёт копии;
смена параметров даёт 409. Команды хранятся в БД, лимит 100000 на аккаунт.

Питание: GET `/api/v1/food?date=YYYY-MM-DD&after=UUID&limit=100` возвращает
`{ items, nextAfter }`. POST принимает `{ value: { id, date, meal, productId,
grams, note }, revision: null }`; снимок формирует сервер. PUT `/:id` принимает
текущую revision и value без productId; DELETE `/:id` — `{ revision }`.

Каталог: GET `/api/v1/products?archived=true&after=UUID&limit=100` возвращает
`{ items, nextAfter }`; без archived показывает активные продукты. GET `/:id`
возвращает `{ value, revision }`. POST принимает полный продукт с revision=null,
PUT `/:id` — полный продукт и текущую revision, включая флаг archived.

Вес: GET `/api/v1/weights?asOf=YYYY-MM-DD&before=YYYY-MM-DD&limit=100`
возвращает `{ items: [{ value, revision }], nextBefore }`; параметры необязательны.
POST принимает `{ value: { id, date, kg }, revision: null }`, PUT `/:id` —
тот же value с текущей revision, DELETE `/:id` — `{ revision }`.
Конфликт даты/ревизии возвращает 409; чужая запись недоступна.

Профиль: GET `/api/v1/profile` возвращает null либо `{ value, revision }`.
POST принимает `{ profile, weight }` и атомарно создаёт профиль с первым весом;
PUT принимает `{ value, revision }`. Устаревшая правка возвращает 409, неверный
ввод — 400. Владельца определяет сессия, поле user_id в запросе не принимается.

SQL-тестам нужна отдельная локальная PostgreSQL 18.3:

```bash
docker run -d --name health-diary-test-db \
  -e POSTGRES_DB=health_test -e POSTGRES_PASSWORD=synthetic-local-only \
  -p 127.0.0.1:55432:5432 postgres:18.3
export TEST_DATABASE_URL=postgresql://postgres:synthetic-local-only@127.0.0.1:55432/health_test
```

Это вымышленные реквизиты исключительно тестового контейнера. Повторно
существующий контейнер запускается командой `docker start health-diary-test-db`.
Тесты создают/удаляют собственные временные БД; пользователь тестов должен иметь
CREATEDB/CREATEROLE в выделенном тестовом контейнере. Рабочий DATABASE_URL никогда не используется вместо TEST_DATABASE_URL.
При запуске обычного приложения эта переменная не нужна.

Перед первыми миграциями администратор выполняет `deploy/database-roles.sql`
через psql с `ON_ERROR_STOP=1`, создаёт отдельную БД `health` с владельцем
`health_migrator` и задаёт пароли через закрытый канал (например, `\password`
в административном psql). Роли не имеют SUPERUSER/CREATEDB/CREATEROLE/BYPASSRLS.
`health_app` наследует только права `health_runtime`, схемой не владеет.

Миграции: задайте MIGRATION_DATABASE_URL в закрытом `.env` и выполните
`npm run db:migrate` из корня проекта. SQL-файлы находятся в `migrations/`;
применённые файлы нельзя редактировать или удалять — добавляйте новый файл.
Повтор безопасен, ошибка откатывает весь новый набор, параллельные запуски
сериализованы. Созданы служебная история, users, sessions, profiles, weights,
products, food_entries, nutrition_days, commands, steps, workouts, energy_plans,
files, photos, documents и lab_results;
остальные таблицы дневника добавляются следующими задачами.
Профиль и вес защищены RLS; без транзакционного владельца строки недоступны.
Перед миграциями рабочей БД нужна резервная копия.

После `npm ci` установи Chromium для тестов:

```bash
npx playwright install chromium
npm run test:browser
```

Открой адрес Vitest UI из терминала (обычно
[http://localhost:51204/__vitest__/](http://localhost:51204/__vitest__/)).
Можно выбрать файл и тест, запустить проверку, открыть Report и Console.
Тесты используют синтетические данные и отдельную базу.

Для просмотра сквозных сценариев с действиями пользователя:

```bash
npm run build
npm run test:e2e:ui
```

Полная автоматическая проверка: `npm run check`. Она включает документацию,
ESLint, TypeScript, unit-тесты с покрытием, тесты в настоящем браузере, сборку
и production-сценарии Desktop Chrome / Pixel 7. Те же проверки запускаются в CI.
Linux-зависимости браузера, отдельные команды и системный Chromium описаны в
[TESTING.md](docs/TESTING.md). В разработке и тестах используются только
синтетические данные.

## Документы

- [MVP.md](docs/MVP.md) — реализованный объём и принятые решения.
- [AGENTS.md](AGENTS.md) и [WORKFLOW.md](docs/WORKFLOW.md) — порядок задач и Git.
- [CODING_STANDARDS.md](docs/CODING_STANDARDS.md) — структура и правила кода.
- [TESTING.md](docs/TESTING.md) и [TEST_CASES.md](docs/TEST_CASES.md) — проверки.
- [PRIVACY_SECURITY.md](docs/PRIVACY_SECURITY.md) — данные и ограничения.
- [CALCULATIONS.md](docs/CALCULATIONS.md) — формулы, источники и границы.
- [DEPENDENCIES.md](docs/DEPENDENCIES.md) — закреплённые версии инструментов.
- [START_ONE_TASK.md](START_ONE_TASK.md) — запрос для отдельной новой задачи.
- [IDEAS.md](IDEAS.md) — возможности за пределами локального MVP.
