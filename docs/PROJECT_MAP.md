# Карта проекта

Дневник личных записей: восемь разделов, email-вход/регистрация/восстановление,
CRUD, графики, фото/документы, ручные показатели, копии. Без AI и совместного доступа.
Карта помогает найти код; проверяй текущие реализации и импорты перед изменением.

## Где искать изменение

| Область | Точки входа и связи |
|---|---|
| Запуск и навигация | [main.tsx](../src/main.tsx) → AuthBoundary → [App.tsx](../src/App.tsx); hash-маршруты — [Navigation.tsx](../src/ui/Navigation.tsx), выбранный день — DayContext |
| Экраны и оформление | [src/pages](../src/pages), общие компоненты [src/ui](../src/ui); CSS в src, общие styles.css/shell.css; локальные эталоны — [design/desktop](../design/desktop/README.md), ресурсы — public/assets |
| Данные UI | [dataAccess.ts](../src/dataAccess.ts) экспортирует API-репозитории из [src/client](../src/client); формы/локальное состояние — React, загрузка — useDiaryQuery, инвалидация — queries, сессия в памяти — session, повторы команд — commands, транспорт — http |
| Авторизация | client/AuthBoundary, auth, emailRecovery и формы; server/auth, sessions, registration, emailAuth, emailBinding, accountMail, authRateLimit; граница — Zod-схемы в domain |
| Вычисления и валидация | [src/domain](../src/domain): чистые функции и Zod-схемы; [src/media](../src/media): подготовка файлов/копий до отправки |
| HTTP API | [server/main.ts](../src/server/main.ts) → runtime (конфигурация, pool, регистрация маршрутов); app — Fastify factory/liveness/ошибки; тематические *Routes/*Records; базовый путь /api/v1 |
| PostgreSQL | [migrations](../migrations), server/migrations и migrate; database — pool, userTransaction — транзакция владельца/RLS, writeCommand — защита повторов, revision/generation — согласованность; файлы также в БД |
| Прежний браузерный дневник | [src/legacy](../src/legacy), [src/data](../src/data) (Dexie); явный экспорт через BrowserDiaryExport. Это не рабочий слой данных восьми экранов; тесты переключают слой явно |
| Тесты | *.test.ts(x) рядом с кодом; *.browser.test.tsx — настоящий Chromium; [tests](../tests) — setup/фикстуры, e2e — локальный API + PostgreSQL, deployed — отдельные проверки HTTPS |
| Доставка | [.github/workflows/check.yml](../.github/workflows/check.yml), [deploy](../deploy): nginx/systemd, установщик frontend, SQL-роли, копии, SMTP; build-api и dist — результаты сборки |

## Команды и условия

В WSL/Linux: `nvm use` (Node 24.22.0), npm 11.19.1; `npm ci` при первичной
установке или изменении lock-файла. Версии — .nvmrc/package.json.
В PowerShell запускай команды через WSL в /home/artur/health; при отсутствии
node подключи nvm в Linux shell (`. ~/.nvm/nvm.sh`), затем `nvm use`.

| Когда | Команда / условия |
|---|---|
| Разработка UI/API | `npm run dev` и в другом терминале `npm run dev:api`; Vite проксирует /api/ на 127.0.0.1:3001. БД/роли/миграции/аккаунт — раздел «Первое использование» README |
| Только документация | `npm run check:docs` + `git diff --check`; тесты приложения не нужны |
| Изменение приложения | `npm run check`: docs → lint → typecheck → coverage → browser → build → E2E. Нужны выделенная TEST_DATABASE_URL и Chromium; подробности — TESTING |
| Целевая проверка в ходе работы | `npm test -- src/domain/bmi.test.ts`; `npm run test:browser:run -- src/App.browser.test.tsx`; `npm run build` и `npm run test:e2e -- profile-weight.spec.ts`. Не заменяют обязательный check |
| Сборки | `npm run build` → dist; `npm run build:api` → build-api (проверка серверных типов и сборка API); `npm run preview` — просмотр frontend |
| Deploy/упаковка | `python3 -B -m unittest discover -s deploy -p 'test_*.py' -v`; после актуального build — `python3 -B deploy/verify_build.py dist` |

CI выполняет полный check, Python deploy-тесты и verify_build для push/PR dev/master.
После успешного push или ручного workflow на dev отдельный job публикует frontend
и проверяет release.txt; PR/master не публикуются. API/БД и SMTP обновляются
отдельно по DEPLOYMENT. Локальный check не подтверждает удалённый CI или VPS.
Для правок CI/deploy выполняй относящиеся проверки этого контура; публикация
требует отдельного разрешения.

## Что читать по задаче

- Всегда: [AGENTS](../AGENTS.md), [WORKFLOW](WORKFLOW.md), карточка и относящиеся
  статусы/записи TASKS/PROGRESS. [README](../README.md) — запуск/первое использование,
  а не обязательное полное чтение.
- Код/UI: [CODING_STANDARDS](CODING_STANDARDS.md); дизайн — [DESIGN](DESIGN.md).
  Проверки кода — нужные разделы [TESTING](TESTING.md)/[TEST_CASES](TEST_CASES.md).
- Формулы/даты/границы: [CALCULATIONS](CALCULATIONS.md). Объём продукта: [MVP](MVP.md).
- Данные/API/auth/вложения: [PRIVACY_SECURITY](PRIVACY_SECURITY.md),
  [DATABASE](DATABASE.md); решения перехода — [SERVER_STORAGE](SERVER_STORAGE.md),
  фактический результат — [SERVER_COMPLETION](SERVER_COMPLETION.md).
- Доставка/копии/почта: [DEPLOYMENT](DEPLOYMENT.md), [BACKUPS](BACKUPS.md),
  [MAIL_DNS](MAIL_DNS.md) по изменяемому контуру. Зависимости — [DEPENDENCIES](DEPENDENCIES.md).
- Идеи: [IDEAS](../IDEAS.md). Старые review/журнал — только по связанному вопросу.

## Codex и инструменты

На момент T197 проектных .codex/config.toml, skills и MCP-конфигураций нет;
действует один корневой AGENTS.md. Области не требуют вложенных инструкций.
Проверен установленный Windows CLI `0.162.0-alpha.17.2`; параметры конфигурации
не добавлялись. При появлении проектной конфигурации сверяй её с установленной
версией и [официальным справочником](https://developers.openai.com/codex/config-reference).
Механизм инструкций — [AGENTS.md](https://developers.openai.com/codex/guides/agents-md).

Для обычных задач достаточно локального shell/Git. Доступные в сессии Figma нужны
для явной работы с макетом, Sites — для отдельного сайта/хостинга, Pages — для
работы со Space, Pets — для питомцев; календарь и внешние документы не нужны
для локального кода. GitHub полезен для удалённых issues/CI/PR, Security — для
отдельного security-review, imagegen — для растровых ресурсов. При редком
использовании можно вручную отключить лишние подключения/плагины в настройках
Codex; здесь они не изменяются. Их наличие не доказывает фактический расход токенов.
