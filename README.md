# Дневник здоровья

Развёрнутое приложение: <https://dev.arturican.com>.
Развёртывание и перенос прежнего дневника: [DEPLOYMENT.md](docs/DEPLOYMENT.md).

Для знакомства с кодом: [как устроено приложение](docs/ARCHITECTURE.md),
[технический аудит T231](docs/AUDIT.md), [план улучшений](docs/IMPROVEMENTS.md)
и [файловый охват аудита](docs/AUDIT_SCOPE.md). Исходный срез 20.10.2026 —
9718e60; AUDIT содержит актуальную матрицу исправлений, ARCHITECTURE описывает
код после очереди T232–T260. Установленные SHA и приёмка — в DEPLOYMENT/PROGRESS.
[Измерения чтений](docs/READ_PERFORMANCE.md),
[ёмкость копий](docs/BACKUP_CAPACITY.md),
[холодная загрузка](docs/COLD_LOAD.md) и
[независимый контроль копий](docs/BACKUP_CONTROL.md) объясняют оставшиеся границы.

Приложение для личных записей на React и TypeScript. Готовый MVP
содержит восемь разделов: «Сегодня», профиль, вес с графиком и справочным ИМТ,
питание, активность, фото, документы с ручными показателями и настройки.
Можно редактировать записи, сравнивать фото по датам, сохранять версии цели и
оценки расхода, экспортировать и восстанавливать резервные копии.

Текущий код хранит данные и файлы в PostgreSQL через авторизованный Fastify API.
Все восемь экранов используют сервер; браузер не хранит копию дневника.
Эта версия развёрнута на VPS: API/БД 2.26.54.81, frontend 159.194.208.200.
Критерии рабочей версии — [REFACTORING_PLAN.md](REFACTORING_PLAN.md),
статусы — [TASKS.md](TASKS.md), результаты проверок — [PROGRESS.md](docs/PROGRESS.md).
История серверного перехода и состав демонстрации — [SERVER_COMPLETION.md](docs/SERVER_COMPLETION.md).
Совместного доступа и AI нет. Приложение не даёт медицинских рекомендаций.

Демонстрационный логин: health-demo. Пароль находится в закрытом локальном
~/.config/health-diary/demo-credentials.json исходного компьютера (WSL, права 600), не в Git.
После входа доступны 90 дней вымышленных записей, графики и учебные вложения.

Сервер ежедневно создаёт зашифрованную копию на втором VPS.
[BACKUPS.md](docs/BACKUPS.md) описывает расписание, ручной запуск и восстановление;
реальное восстановление в отдельную БД проверено. Recovery key находится в
~/.config/health-diary/recovery-secret.asc исходного компьютера: сохраните защищённую
офлайн-копию, не передавайте ключ на VPS или в чат.

## Запуск в WSL / Linux

Поддерживается Ubuntu 24.04 x86_64; на Windows нужен WSL2, проект храните
в Linux home. Node 24.22.0, npm 11.19.1, PostgreSQL 18.3, Docker Engine,
Git, GPG, SOPS 3.13.3 и age 1.3.2. Подготовка инструментов, перенос ключа,
обновления и данные — [DEVELOPMENT.md](docs/DEVELOPMENT.md).

## Первый запуск на новом компьютере

После установки инструментов и переноса age-ключа по DEVELOPMENT:

```bash
git clone --branch chore/portable-development git@github.com:arturican/health.git
cd health
source ~/.nvm/nvm.sh
nvm install
nvm use
npm ci
export PATH="$PATH:$HOME/.local/bin"
npm run secrets:restore
docker pull postgres:18.3
npm run local:doctor
npm run local:setup
npx playwright install --with-deps chromium
npm run local:check
npm run local:api
# Во втором терминале, из той же папки после nvm use:
npm run local:ui
```

Нужен установленный nvm. Версия Node закреплена в [.nvmrc](.nvmrc): **24.22.0**,
npm — **11.19.1**. Если nvm отсутствует, установи эти версии своим менеджером Node.
Проверь их командами `node -v` и `npm -v`. Ошибка `EBADENGINE` на Node 22 означает,
что сначала нужно переключить Node/npm и повторить `npm ci`; без успешной установки
зависимостей команда запуска не найдёт Vite. Проверку engines отключать не нужно.

Setup создаёт отдельный локальный контейнер/том, роли, БД health/health_test,
применяет миграции и заполняет синтетический local-demo; повтор сохраняет данные.
Войти можно логином local-demo и значением DEV_DEMO_PASSWORD из приватного .env.
Секреты не печатайте в терминал/чат. Открой
[http://127.0.0.1:5173](http://127.0.0.1:5173).
Оставь терминал работающим. Для просмотра production-сборки выполни
`npm run build`, затем `npm run preview` и открой напечатанный адрес
(обычно `http://localhost:4173`).

## Первое использование

API после создания ролей/БД, миграций и аккаунта: `npm run dev:api`.
Для production: `npm run build:api`, затем `npm run start:api`.
Для нового компьютера используйте local:* выше. [.env.example](.env.example)
описывает четыре общих DEV_* секрета; .env восстанавливается через SOPS.
[.env.local.example](.env.local.example) описывает необязательные машинные порты.
Прямые dev:api/db:migrate/db:seed команды ниже — ручной серверный режим:
они требуют полного закрытого env из DEPLOYMENT, не DEV_* шаблон.
Секреты никогда не задаются через VITE_*. По умолчанию API слушает `127.0.0.1:3001`;
`GET /api/v1/health` возвращает liveness, без проверки БД.
SIGINT/SIGTERM корректно закрывают listener. Неверные настройки и занятый порт
завершают процесс с кодом 1. Серверная сборка находится в `build-api`, отдельно
от frontend `dist`; Node-bundle собирает установленный Vite после отдельной
строгой проверки TypeScript и переиспользует domain-схемы.
Задай DATABASE_URL ограниченной роли и APP_ORIGIN=http://127.0.0.1:5173.
Vite направляет /api на loopback 3001; нестандартный адрес задаётся серверной
переменной HEALTH_API_PROXY при запуске Vite. Для preview укажи точный origin
с его портом в APP_ORIGIN. На HTTP используй loopback 127.0.0.1; для внешнего
адреса нужен HTTPS. Модель — [SERVER_STORAGE.md](docs/SERVER_STORAGE.md).

1. При включённой почте зарегистрируй email, подтверди ссылку и войди.
   Локально без SMTP используй созданный CLI аккаунт; прежние логины также
   поддерживаются. Заполни профиль и первое измерение веса.
2. В питании добавь собственный продукт или явно загрузи учебные примеры,
   затем внеси порцию. Отметка полноты дня нужна для оценки суточного баланса.
3. Добавь шаги, тренировки и при необходимости цель/оценку расхода в настройках.
   Шаги и тренировки повторно не прибавляются к общему расходу.
4. Фото и документы добавляются с устройства. Показатели бланка вводятся вручную.
5. В настройках скачай полную резервную копию для переноса всех записей и файлов.
   Текстовая копия переносит журналы и планы без вложений и показателей документов.

Один аккаунт открывает тот же дневник в разных браузерах. Вход хранится в
Secure/HttpOnly cookie. Скрытие разделов — только настройка интерфейса;
авторизацию проверяет сервер. Скачанные JSON-копии не зашифрованы.
Для работы нужен доступный backend: автономная загрузка и очередь изменений
не реализованы. Прежняя IndexedDB не импортируется и не удаляется автоматически.
В настройках кнопка «Скачать прежний дневник из браузера» читает её только
по вашему действию и сохраняет полную JSON-копию на устройство. Откройте прежний
браузер и тот же адрес сайта. Для переноса выберите копию в полном восстановлении,
проверьте предпросмотр и подтвердите замену серверного дневника.

## Аккаунты и синтетическая демонстрация

При MAIL_ENABLED=true доступна email-регистрация с подтверждением, вход
и восстановление. Служебный SMTP настраивается по [MAIL_DNS](docs/MAIL_DNS.md);
независимый SMTP второго VPS и ожидающий PTR — [MAIL_MONITOR](docs/MAIL_MONITOR.md);
локально без SMTP можно создать синтетический аккаунт CLI. Никакие настоящие
письма для автоматических тестов не нужны.

Административное создание отдельного аккаунта: `npm run account:create` с серверными
MIGRATION_DATABASE_URL, ADMIN_LOGIN, ADMIN_PASSWORD, ADMIN_TIMEZONE.
Для закрытого файла: `npm run build:api`, затем
`node --env-file=/закрытый/путь/account.env build-api/createAccount.js`.
Файл должен иметь права 600; не храните его в Git и не включайте в окружение
обычного API. Пароль 15–1024 символа, пробелы сохраняются; timezone, например,
Europe/Moscow. Команда не печатает пароль или хеш. Повторный логин отклоняется
без смены прежнего пароля. CLI не заменяет обычную email-регистрацию.

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

## Контракт и границы API

Для авторизации нужны DATABASE_URL ограниченной роли и точный APP_ORIGIN.
Production требует HTTPS и отдельный административный env. Сессия — защищённая
cookie, изменяющие запросы — Origin/CSRF; клиент сверяет владельца ответа.
Лимиты входа/email хранятся в PostgreSQL и переживают перезапуск; исходному IP
доверяют только через настроенный loopback proxy по DEPLOYMENT.
Рабочий API не имеет тестовых mailbox/clock-маршрутов.

Методы, DTO, ошибки, пагинация, generation/revision/idempotency, файлы и копии —
в едином [API_REFERENCE](docs/API_REFERENCE.md). Liveness /api/v1/health проверяет
процесс, readiness /api/v1/readiness — подключение runtime-БД.
Схема и роли — [DATABASE](docs/DATABASE.md), текущие точки входа — PROJECT_MAP.

## Проверки в браузере и с БД

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
Production E2E тоже создают случайную БД: API на loopback 4181, frontend 4173,
новый синтетический аккаунт каждого теста. Время фиксирует только тестовая
фабрика. Unit/browser компоненты явно используют legacy-фикстуры; это не
замена сквозным проверкам PostgreSQL. Один E2E worker учитывает лимит больших копий.
При запуске обычного приложения эта переменная не нужна.

Перед первыми миграциями администратор выполняет `deploy/database-roles.sql`
через psql с `ON_ERROR_STOP=1`, создаёт отдельную БД `health` с владельцем
`health_migrator` и запрещает общий доступ: REVOKE ALL ON DATABASE health FROM PUBLIC;
GRANT CONNECT ON DATABASE health TO health_app, health_migrator.
Локальная БД должна быть отдельной от health_test; нельзя использовать рабочие
данные для тестов. Затем администратор задаёт пароли через закрытый канал (например, `\password`
в административном psql). Роли не имеют SUPERUSER/CREATEDB/CREATEROLE/BYPASSRLS.
`health_app` наследует только права `health_runtime`, схемой не владеет.

Миграции: задайте MIGRATION_DATABASE_URL в закрытом `.env` и выполните
`npm run db:migrate` из корня проекта. SQL-файлы находятся в `migrations/`;
применённые файлы нельзя редактировать или удалять — добавляйте новый файл.
Повтор безопасен, ошибка откатывает весь новый набор, параллельные запуски
сериализованы. Созданы служебная история, users, sessions, profiles, weights,
products, food_entries, nutrition_days, commands, steps, workouts, energy_plans,
files, photos, documents, lab_results, settings и legacy_metadata.
Личные таблицы защищены FORCE ROW LEVEL SECURITY; без транзакционного владельца строки недоступны.
Перед миграциями рабочей БД нужна резервная копия. На VPS миграции запускаются
с отдельным admin.env, runtime API использует только api.env. Настройка
журналирования ролей описана в [DEPLOYMENT.md](docs/DEPLOYMENT.md).

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

- [DEVELOPMENT.md](docs/DEVELOPMENT.md) — перенос разработки, ключа и локальных данных.
- [MVP.md](docs/MVP.md) — реализованный объём и принятые решения.
- [AGENTS.md](AGENTS.md) и [WORKFLOW.md](docs/WORKFLOW.md) — порядок задач и Git.
- [PROJECT_MAP.md](docs/PROJECT_MAP.md) — точки входа, маршруты поиска и проверки по типу изменения.
- [CODING_STANDARDS.md](docs/CODING_STANDARDS.md) — структура и правила кода.
- [TESTING.md](docs/TESTING.md) и [TEST_CASES.md](docs/TEST_CASES.md) — проверки.
- [DEPLOYMENT.md](docs/DEPLOYMENT.md), [BACKUPS.md](docs/BACKUPS.md) — VPS и восстановление.
- [SERVER_COMPLETION.md](docs/SERVER_COMPLETION.md) — фактический результат перехода.
- [PRIVACY_SECURITY.md](docs/PRIVACY_SECURITY.md) — данные и ограничения.
- [CALCULATIONS.md](docs/CALCULATIONS.md) — формулы, источники и границы.
- [DEPENDENCIES.md](docs/DEPENDENCIES.md) — закреплённые версии инструментов.
- [START_ONE_TASK.md](START_ONE_TASK.md) — запрос для отдельной новой задачи.
- [IDEAS.md](IDEAS.md) — возможности за пределами локального MVP.
