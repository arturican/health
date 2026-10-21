# Карта проекта

Дневник личных записей: восемь разделов, email-вход/регистрация/восстановление,
CRUD, графики, фото/документы, ручные показатели, копии. Без AI и совместного доступа.
Карта помогает найти код; проверяй текущие реализации и импорты перед изменением.

## Где искать изменение

| Область | Точки входа и связи |
|---|---|
| Запуск и навигация | [main.tsx](../src/main.tsx) → AuthBoundary → [App.tsx](../src/App.tsx); hash-маршруты — [Navigation.tsx](../src/ui/Navigation.tsx), выбранный день — DayContext |
| Экраны и оформление | [src/pages](../src/pages), общие компоненты [src/ui](../src/ui); CSS в src, общие styles.css/shell.css; локальные эталоны — [design/desktop](../design/desktop/README.md), ресурсы — public/assets |
| Данные UI | [dataAccess.ts](../src/dataAccess.ts) экспортирует API-репозитории из [src/client](../src/client); загрузка — useDiaryQuery/useDiaryQueryState (current для действий с ревизией), инвалидация — queries, сессия в памяти — session, повторы команд — commands, транспорт — http |
| Авторизация | client/AuthBoundary, auth, emailRecovery и формы; server/auth, sessions, emailAuth, emailBinding, accountMail, authRateLimit; граница — Zod-схемы в domain |
| Вычисления и валидация | [src/domain](../src/domain): чистые функции и Zod-схемы; [src/media](../src/media): подготовка файлов/копий до отправки |
| HTTP API | [server/main.ts](../src/server/main.ts) → runtime (конфигурация, pool, регистрация маршрутов); app — Fastify factory/liveness/ошибки, [readiness](../src/server/readiness.ts) — SQL-проба; тематические *Routes/*Records; базовый путь /api/v1 |
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
| Перед push после изменений приложения | `npm run check`: docs → lint → typecheck → coverage → browser → build → E2E. Нужны выделенная TEST_DATABASE_URL и Chromium; подробности — TESTING |
| Целевая проверка в ходе работы | `npm test -- src/domain/bmi.test.ts`; `npm run test:browser:run -- src/App.browser.test.tsx`; `npm run build` и `npm run test:e2e -- profile-weight.spec.ts`. Не заменяют обязательный check |
| Сборки | `npm run build` → dist; `npm run build:api` → build-api (проверка серверных типов и сборка API); `npm run preview` — просмотр frontend |
| Deploy/упаковка | `python3 -B -m unittest discover -s deploy -p 'test_*.py' -v`; после актуального build — `python3 -B deploy/verify_build.py dist` |
| API unit/journal policy | `python3 -B deploy/verify_api_units.py`; positive/negative cases включены в Python deploy tests; parser использует временный executable, фактические namespace/Node проверяются при релизе |
| Nginx static compression | На native Nginx: python3 -B deploy/verify_static_compression.py --config deploy/nginx.conf; isolated synthetic process, manual deployment gate, не unittest/CI |
| Backup monitor units | `systemd-analyze verify deploy/health-backup-monitor.service deploy/health-backup-monitor.timer deploy/health-watchdog.service deploy/health-watchdog.timer deploy/health-offsite-monitor.service deploy/health-offsite-monitor.timer`; подготовка установки/отката — BACKUPS/BACKUP_CONTROL |

CI выполняет все фазы check параллельными jobs: static, coverage/API, browser,
build с Python deploy-тестами/verify_build/monitor units; два E2E jobs проверяют
один dist по ID артефакта в изолированных PostgreSQL/API (desktop/mobile).
Итоговый check требует успеха всех gates для push/PR dev/master и ручного workflow.
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
  актуальный [API_REFERENCE](API_REFERENCE.md) и [BACKEND_PLAN](BACKEND_PLAN.md).
  [DATABASE](DATABASE.md), [SERVER_STORAGE](SERVER_STORAGE.md) и
  [SERVER_COMPLETION](SERVER_COMPLETION.md) — схема и исторические решения перехода;
  текущие маршруты проверяй по контракту и коду.
- Доставка/копии/почта: [DEPLOYMENT](DEPLOYMENT.md), [BACKUPS](BACKUPS.md),
  [MAIL_DNS](MAIL_DNS.md), [MAIL_MONITOR](MAIL_MONITOR.md) по изменяемому контуру. Зависимости — [DEPENDENCIES](DEPENDENCIES.md).
- Идеи: [IDEAS](../IDEAS.md). Старые review/журнал — только по связанному вопросу.

## Codex и инструменты

Общие правила — [корневой AGENTS](../AGENTS.md), особенности экранов —
[src/pages/AGENTS](../src/pages/AGENTS.md), API —
[src/server/AGENTS](../src/server/AGENTS.md). Проектных .codex/config.toml,
профилей агентов и MCP-конфигураций нет; личные настройки не изменяются.
Сверяйте появляющуюся конфигурацию с установленной версией CLI
и официальной документацией, а инструкции — с актуальным кодом.

Для обычных задач достаточно локального shell/Git. Доступные в сессии Figma нужны
для явной работы с макетом, Sites — для отдельного сайта/хостинга, Pages — для
работы со Space, Pets — для питомцев; календарь и внешние документы не нужны
для локального кода. GitHub полезен для удалённых issues/CI/PR, Security — для
отдельного security-review, imagegen — для растровых ресурсов. При редком
использовании можно вручную отключить лишние подключения/плагины в настройках
Codex; здесь они не изменяются. Их наличие не доказывает фактический расход токенов.
