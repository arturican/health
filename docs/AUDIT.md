# Технический аудит T231

Дата: **20.10.2026**, Europe/Moscow. Исходное состояние: ветка `dev`,
`9718e60423c28bbc708db95bf045db6403575769`, `dev...origin/dev`, рабочая копия и
индекс чистые. Проверены status, diff, cached diff и последние пять коммитов.
Результаты относятся к этому коду. После начала аудита менялась только
документация; незакоммиченных изменений реализации не было. На этапе аудита
коммит, push, production и исправления кода были исключены прямым запросом.
Следующим запросом пользователь разрешил коммит и штатную доставку документации;
результаты ниже остаются срезом аудита, не результатом последующего выпуска.

Читайте вместе: [ARCHITECTURE](ARCHITECTURE.md) — фактическое устройство,
[IMPROVEMENTS](IMPROVEMENTS.md) — очередь рекомендаций,
[AUDIT_SCOPE](AUDIT_SCOPE.md) — полный файловый реестр охвата,
[API_REFERENCE](API_REFERENCE.md) — существующий контракт.

## Состояние после исправлений и доставки T232–T260

Код/конфигурация сверены с dev b58094a 20.10.2026; T260a свела документы,
T260b исправила тестовые зависимости. Код доставлен в T260. Ниже приведён результат очереди, а исходные доказательства
AUD-001…015 и таблицы проверок дальше сохранены для baseline 9718e60. Их старые
номера строк/«не проверено» не описывают автоматически нынешний код.
AUD-016 — отдельное позднее уточнение измерением. Полный повторный аудит
каждой строки после исправлений не выполнялся: изменённые цепочки проверены
регрессиями карточек, review и полным release check T260. CI и live proof —
[DEPLOYMENT](DEPLOYMENT.md#приёмка-t260-20102026). Production CRUD не тестировался:
на VPS проверены публичные страницы/API и закрытое сравнение данных при доставке.

| ID | Состояние кода / доказательство | Что остаётся |
|---|---|---|
| AUD-001 | Исправлено T233: same-epoch visibility и сохранение media drafts; unit + real E2E | Доставлено T260; поведение подтверждено synthetic E2E |
| AUD-002 | Исправлено T234: Cancel четырёх форм независим от stale read, pending защита сохранена | Доставлено T260; production CRUD не запускался |
| AUD-003 | Исправлено T235: явный discard/load текущего snapshot, без auto-rebase | Доставлено T260; production CRUD не запускался |
| AUD-004 | Исправлено T236: migration016, подтверждаемый timezone в verify token; SQL/HTTP regressions | 016 применена; 16 checksum/schema/ACL gates PASS |
| AUD-005 | Исправлено T232: очистка app env дочернего процесса и early-exit handling; poisoned-parent regression | Не подставлять рабочую БД в другие тестовые процессы |
| AUD-006 | T238–T240a: отдельные capacity/rotation ошибки, owner-locked ротация без удаления записей | Смена generation намеренно сбрасывает старые формы; автоматического повтора команды нет |
| AUD-007 | T245–T251b: один Blob/явное открытие/6 gallery viewers, ReadScope/общий Today, mounted cache/delete invalidation; real request budgets | Полное чтение metadata и глобальная инвалидация остаются; production heap/p95 не измерены |
| AUD-008 | Исправлено T237: общий 51 MiB expanded cap до tar parser, PAX/GNU regressions | Receiver установлен до push, bytes сверены |
| AUD-009 | Код T241 и namespace/retention policy T241a установлены; synthetic error/SMTP/sink tests | Namespace active, точная diagnostic function проверена transient unit; реальный API failure не индуцирован |
| AUD-010 | Исправлено T242/c322f45: 62 операций настоящего built runtime, negative registration mutants | Отдельный test API остаётся, surface gate обнаруживает пропуск/переименование маршрутов |
| AUD-011 | Частично: T252 inventory, T253/b probe/state, T254/a/b SHA/integrity/synthetic restore готовы | OPEN: канал выбран T252a; T262 local SMTP gates PASS; T262a A/SPF/DKIM/data DNS PASS, внешняя доставка blocked: отказ провайдера в PTR (T262b), выбран внешний SMTP (T262c), его параметры/доставка/receipt не подтверждены; T253a/T254c не активированы; 7 архивов verified после trusted source replay, 7 старых unattested; общий integrity status unhealthy |
| AUD-012 | T255 anchors/design + T256/a official parser; 11 схем parsed и однократно rendered локально | Используемый Markdown subset, не полный CommonMark; GitHub renderer не проверен; changed diagrams требуют нового render |
| AUD-013 | Исправлено T257: 7 fault tests + 6 real SQL/restore, inventory до/после совпал | Старый остаток 16.10 сохранён; не заявляется пустой общий кластер |
| AUD-014 | T243 measured capacity, T244 понятные413 и явная альтернатива | OPEN LIMIT: text 20 MiB / full 200 MiB не покрывают любое допустимое сочетание; большие browser imports/production peak не проверены |
| AUD-015 | T258 measurement и T259 decision; lazy loading отложен | Static imports/warning остаются; бесполезность lazy не доказана, отдельного сравнения не было |
| AUD-016 | T258a public gzip установлен T260: native и live bytes/encoding/header proof | JS 521845→149835 bytes; production latency/p95 не измерены |

Полные условия отдельных проверок — [PROGRESS](PROGRESS.md) и карточки
[TASKS](../TASKS.md), измерения — [READ_PERFORMANCE](READ_PERFORMANCE.md),
[BACKUP_CAPACITY](BACKUP_CAPACITY.md), [COLD_LOAD](COLD_LOAD.md).
Новые инструменты/скрипты проверены в своих задачах; исходный файловый реестр
[AUDIT_SCOPE](AUDIT_SCOPE.md) остаётся реестром T231, не фиктивным повторным
аудитом всех добавленных файлов.

Код b58094a доставлен: frontend через успешный CI, API отдельным проверенным
артефактом, migration016/unit/receiver/Nginx прошли отдельную приёмку T260.
Channel choice и alert activation не становятся зелёными от app deploy.
Синтетические тесты не доказывают полную безопасность, отсутствие иных ошибок
или восстановимость каждого рабочего архива.

Следующие разделы до позднего AUD-016 — **исходный аудит T231**, включая
ограничения и точные неуспешные запуски на тот момент.

## Общая оценка

Рабочее приложение с последовательными границами UI/client/domain/server,
реальной PostgreSQL, изоляцией владельцев и сильной регрессионной защитой.
Ключевые локальные сценарии проходят; новый backend или архитектурный слой
не обоснован. Вместе с тем зелёные тесты не покрывают все отказы фоновых
чтений/конкурентные настройки, безопасное окружение smoke-процессов и скрытые
метаданные deploy-архива. Найдены шесть подтверждённых дефектов P2, шесть рисков
P2 и три улучшения P3; ниже тип каждого указан отдельно. P0/P1 по имеющимся
доказательствам не установлены. Это не заключение об отсутствии иных ошибок.

Наиболее близкий пользовательский ущерб — потеря несохранённого ввода и
невозможность восстановить форму без ухода со страницы. Сохранённые серверные
данные в воспроизведениях не терялись; обход авторизации не подтверждён.
Риски масштаба/доступности отделены от измеренных задержек: production latency,
память приложения и нагрузка БД не профилировались.

## Объём и метод

Исследовано одно приложение, не монорепозиторий: React 19.3.1 / TypeScript 6.0.3 /
Vite 8.3.4 → Fastify 5.12.7 → pg 8.23.1 / PostgreSQL 18.3. Точные версии, engines,
lockfile v3, 516 npm-пакетов, собственные конфигурации и генераторы учтены.
Прочитаны корневой/pages/server AGENTS, WORKFLOW, карта, текущая матрица
REFACTORING_PLAN, исторический MVP, CALCULATIONS, TESTING/TEST_CASES,
PRIVACY_SECURITY, API_REFERENCE и runbooks. Исторические карточки/журнал
проверялись по относящимся ID; старые разрешения на выпуск не использовались.

Три независимых read-only review текущей задачи охватили UI/domain/client/media/
legacy, сервер/SQL и config/tests/CI/deploy. Итоговые существенные цепочки
перепроверены по исходникам и изолированным воспроизведениям. Нет оценок
«мёртвого кода» только по отсутствию прямого импорта: проверены dataAccess,
тестовые alias, runtime-регистрация, CLI entries и browser-export.

| Область | Основные файлы | Проверка / статус | Проблемы и пределы |
|---|---|---|---|
| Вход и оболочка | main, App, Navigation, DayContext, AuthBoundary | проверено: код/вызовы, unit, Chromium E2E | AUD-001; live отдельно |
| Восемь экранов и формы | pages, ui, CSS | проверено: логика и автоматические сценарии; визуально частично | AUD-001…003,007; без ручного pixel/screen reader review |
| Контракты и состояние клиента | dataAccess, client/* | проверено: runtime-схемы/сессия/epoch/retry/пагинация | AUD-007,010; нет persistent query cache |
| Расчёты/валидация/файлы | domain, media | проверено: исходники, границы/null, unit/native codecs | нет нового подтверждённого дефекта формул; PDF не полный malware scan |
| Legacy | data, legacy | проверено: собственные адаптеры/схемы/экспорт и тесты | не fallback рабочего приложения, удалять целиком нельзя |
| API/auth/email | server lifecycle/auth/email/*Routes/*Records | проверено: все группы кода, inject+SQL+runtime | AUD-004…006,009,014 |
| Миграции/целостность | migrations/001…015, migrations, userTransaction | проверено: FK/RLS/grants/checksum/конкурентность | состояние ролей/схемы production не инспектировалось |
| Тесты | соседние tests, tests/e2e, fixtures | проверено исполнением; ручной разбор частичный | AUD-005,010,013; selected assertions, не каждая строка |
| Deploy/backup/mail | все 29 файлов deploy | проверено статически и 38 Python tests; units verify | AUD-008,009,011; реальная отправка/SSH не выполнялись |
| Конфигурация/CI | package/lock, TS/Vite/Vitest/Playwright/ESLint, workflow | проверено статически + локальные сборки | AUD-015; удалённый CI не запускался |
| Документация/агенты | README, AGENTS, docs, TASKS | проверено частично: текущие правила и связанные исторические записи | AUD-012; все старые карточки не переаудированы |
| Design tooling | design/desktop/*.cjs и gallery template | проверено статически, генератор не запускался | перезаписывает tracked SVG/PNG/JSON/HTML; архивные тексты уточнены |
| Deployed tests и VPS | tests/deployed, runbooks | проверено частично: код/config, без удалённого запуска | меняющие demo-сценарии не разрешены этим аудитом |

В реестре охвата каждому исходному tracked-файлу дан статус и метод, включая
исключения. `node_modules`, dist/build-api/coverage, traces/reports, generated
SVG/PNG/validation JSON и сторонний шрифт/иконографика исключены из ручного
разбора реализации. Собственные wrappers/генераторы/лицензии учтены. На старте
914 tracked-файлов; новые документы не подменяют исходный реестр.

## Окружение и фактические проверки

WSL Ubuntu 24.04, cwd `/home/artur/health`, `. ~/.nvm/nvm.sh; nvm use`:
Node **24.22.0**, npm **11.19.1**. Имеющиеся node_modules и lock использованы
без npm ci/обновлений. Выделенный контейнер `health-diary-test-db`, образ
`postgres:18.3`, loopback `55432`, БД `health_test`, только синтетические данные.
testDatabase создаёт случайные БД/роли и удаляет их; TEST_DATABASE_URL не заменяет
рабочую DATABASE_URL. Прикладные DATABASE_URL/APP_ORIGIN/MAIL_*/ADMIN_* в исходном
окружении отсутствовали. Перед продолжением фаз они дополнительно удалены из shell.

| Команда / действие | Фактический результат | Ограничение / побочный эффект |
|---|---|---|
| `npm run check` | docs/lint/types/coverage PASS; остановка на Browser | первая попытка Chromium: exit127, libnspr4.so отсутствует; это окружение, тесты не исполнились |
| `npm run test:coverage` внутри check | **167 файлов / 1633 теста PASS**; statements 95.29%, branches 92.95%, functions 96.92%, lines 97.37% | реальные SQL/Argon2/синтетический dump→GPG→restore и runtime; успешную фазу не повторяли |
| `npm run test:browser:run` после настройки библиотек | **37 файлов / 91 PASS** | существующий кеш библиотек через LD_LIBRARY_PATH, не новая установка |
| `npm run build` | PASS; JS **513.68 kB**, gzip **146.92 kB** | предупреждение chunk >500kB, не ошибка сборки |
| `npm run test:e2e` | **88 PASS**, 44 desktop +44 mobile Chromium, около 2.9 min | реальный local API+PostgreSQL, preview CSP, synthetic accounts/SMTP; не production |
| `npm run build:api` | PASS | отдельный tsc+SSR bundle; также уже выполнялся runtime-тестом |
| `python3 -B -m unittest discover -s deploy -p 'test_*.py' -v` | **38 PASS** | временные каталоги/синтетические копии, без настоящей доставки |
| `python3 -B deploy/verify_build.py dist` | PASS, 6 файлов, лицензия сохранена | archive allowlist проверена; не исправляет AUD-008 |
| `systemd-analyze verify deploy/health-backup-monitor.service deploy/health-backup-monitor.timer` | PASS | синтаксис/связи units, не факт их включения на VPS |
| `npm audit --json` | exit0, **0 известных advisories**, 516 packages | registry.npmjs.org, 20.10.2026; не статический анализ и не гарантия безопасности |
| Сверка API_REFERENCE ↔ регистрация | **62/62**, missing/extra отсутствуют | явные method/path, автоматические HEAD исключены |
| Внешний временный UI harness | **6/6 PASS**, jsdom, real client hooks, mock fetch, явная дата | assertions подтверждают существующие дефекты/число запросов; это не Browser Mode |
| Отдельные SQL/HTTP repro | threshold commands и pending timezone подтверждены | уникальные testDatabase, без рабочей БД/SMTP |
| Отдельные bounded deploy/runtime repro | PAX cap bypass и inherited env подтверждены | root повторно запустил; без установки release и обращения к настоящей БД |
| Документы и diff | check:docs PASS (298 файлов, 1460 локальных ссылок), diff --check PASS; scope/ID/структура 11 схем PASS | Существование путей и структурная сверка, не полный parse/render Mermaid |

Все фазы полного check в итоге выполнены успешно по отдельности; исходный
единый `npm run check` вернул **1**, и его нельзя записывать как успешный единый
запуск. Продолжение Browser/build/E2E прошло с
`LD_LIBRARY_PATH=/home/artur/.cache/health-browser-deps/root/usr/lib/x86_64-linux-gnu`.
Результат установки с нуля не проверялся, потому что зависимости уже имелись.
Отдельной команды форматирования в package.json нет: lint и diff --check имеют
свои ограниченные обязанности.

Автоматические Chromium-сценарии проверили вход/регистрацию/reset, CRUD всех
журналов, reload, файлы/байты, копии/очистку, ошибки/устаревшие ревизии, клавиатуру,
axe, CSP и ширины 320/375/768/1024/1440. Это реальная браузерная автоматизация,
но не ручной визуальный аудит и не тестирование Safari/Firefox/реального телефона.
Ключевые E2E явно проверяют отсутствие неожиданных ошибок страницы/консоли
и внешних HTTP-запросов; общего observer для каждого теста нет.

Полные логи вне Git: `/tmp/health-T231-check.log`, `-browser.log`, `-build.log`,
`-e2e.log`, `-build-api.log`, `-deploy.log`, `-systemd.log`, `-verify-build.log`,
`-npm-audit.json`. Временные review/repro — `/tmp/health-T231-{ui,api,ops}.md`,
`/tmp/health-T231-ui/`, `-command-cap.mjs/.log`, `-pending-timezone.mjs/.log`,
`-pax-repro.py`, `-runtime-env-repro.mjs`. Они могут исчезнуть; ниже сохранены
условия и ожидаемые результаты, необходимые для создания постоянных регрессий.

## Находки

P0 — немедленный серьёзный ущерб; P1 — ключевой сценарий/существенная безопасность
или сохранённые данные; P2 — значимая надёжность/производительность/сопровождение;
P3 — необязательное улучшение. Приоритет учитывает условия и вероятность,
а не только техническую возможность. Общие первопричины объединены.

### AUD-001 — Сбой видимости уничтожает черновик медиа

- **Тип/приоритет:** подтверждённый дефект, **P2**: обычный кратковременный отказ
  чтения теряет несохранённый ввод; сохранённые данные не затронуты.
- **Место:** `src/ui/useVisibility.ts:5–10`, `src/App.tsx:23,54–58`;
  PhotosPage/PhotoForm, DocumentsPage/DocumentForm/LabSection.
- **Условия/последствие:** открыт редактор фото/документа; focus/online/действие
  инвалидирует запросы; GET diary-state падает. Hook возвращает hidden как
  успешный result; App меняет key StorageBoundary, размонтирует страницу и
  пишет «Раздел скрыт». После восстановления формы нет прежнего ввода.
- **Доказательство:** real App+API hooks в jsdom: ввести синтетическую подпись
  на #photos → reject GET diary-state → hidden → успешный повтор → подпись пустая.
  Для документов доказана та же ветка App статически, отдельный runtime repro не делался.
- **Решение/компромисс:** различать ошибку и настоящую смену visibility, сохранять
  черновик при временном сокрытии/повторе. Начальная неизвестная видимость и
  выход должны оставаться безопасными; права API не меняются.
- **Проверка исправления:** обе media-страницы, текст/выбранный файл, error→retry,
  explicit hide и logout; без потери draft и показа данных другого аккаунта.
- **Неизвестно:** частота на VPS, сохранение File конкретным браузером отдельно.

### AUD-002 — Cancel блокируется устаревшим чтением

- **Тип/приоритет:** подтверждённый дефект, **P2**: выход из редактора зависит от сети.
- **Место:** `ProductCatalog.tsx:22` → `ProductForm.tsx:21,64`,
  `FoodForm.tsx:17–22,88`, `WorkoutJournal.tsx:19` → `WorkoutForm.tsx:18,75`,
  `LabSection.tsx:38` → `LabForm.tsx:71` (все в src/pages);
  `src/client/useDiaryQuery.ts:31–41`.
- **Условия/последствие:** после открытия edit фоновый reread падает, старые
  данные сохраняются, current=false. Cancel использует busy/disabled сохранения.
  Пользователь ждёт сеть или уходит с потерей draft; контракт pages/AGENTS
  «Cancel доступен при устаревании» нарушен. Profile/Weight этим не затронуты.
- **Доказательство:** ProductCatalog repro: draft сохранён, Save и Cancel disabled
  после reject products. Остальные подтверждены одинаковой цепочкой props;
  Lab требует сбоя чтения документов, не только lab-results.
- **Решение:** отделить pending записи/конфликтующее удаление от свежести чтения;
  разрешать отмену без активной записи. Не повышать ревизию snapshot автоматически.
- **Проверка:** failed reread с открытой формой каждого вида, доступный Cancel,
  возврат фокуса; во время POST/PUT Cancel по-прежнему блокирует размонтирование.
- **Пробел:** legacy alias в PendingEditors не моделирует реальный current;
  stale E2E сейчас задерживают GET после save, когда редактор уже закрывается.

### AUD-003 — Настройки и план не восстанавливаются после 409

- **Тип/приоритет:** подтверждённый дефект, **P2**: повтор сохранения остаётся невозможным.
- **Место:** `src/pages/PrivacySettings.tsx:17–18,32–37,45–46`,
  `EnergyPlanForm.tsx:46–50,58,73`, `EnergyPlanSettings.tsx:12–18`.
- **Условия/последствие:** другая вкладка меняет настройки/план после начала
  draft. Сервер правильно даёт 409; GET уже свежий, но ref хранит старый original.
  Нет явного discard/reload; снова Save отправляет ту же устаревшую ревизию.
- **Доказательство:** два real-client jsdom repro: visibility PUT revisions
  `[1,1]` при свежем server revision2; plan POST expectedRevision `[null,null]`
  после появления plan1. Кнопка retry visibility доступна только при GET failure,
  успешный GET её убирает. Данные защищены от перезаписи сервером.
- **Решение:** явное действие «Загрузить сохранённое/отменить черновик» с новым
  snapshot после выбора пользователя; автоматический rebase скрыл бы конфликт.
- **Проверка:** две вкладки/409 → свежий GET → выбор discard → новый save успешен;
  до выбора введённые значения остаются; pending нельзя сбросить.
- **Неизвестно:** отдельного реального browser repro этого случая не выполнялось.

### AUD-004 — Исправленный timezone повторной регистрации игнорируется

- **Тип/приоритет:** подтверждённый дефект, **P2**: неверный «сегодня» и границы дат.
- **Место:** `migrations/013_email_operations.sql:26–37`,
  `014_email_binding.sql:43–44`, `src/client/RegistrationForm.tsx:40–42`,
  `src/server/recordValidation.ts:7–12`.
- **Условия/последствие:** первая неподтверждённая регистрация сохранила timezone;
  повторная с тем же email предлагает его исправить, но INSERT ON CONFLICT DO
  NOTHING оставляет прежний. Новый token подтверждается; способа изменить timezone
  через текущие API/настройки нет. Это не захват аккаунта: письмо/пароль обязательны.
- **Доказательство:** unique SQL testDatabase: Pacific/Kiritimati → через минуту
  Europe/Moscow → погашение второго token=true → stored=Pacific/Kiritimati.
  На `2026-10-20T19:00Z` дата 21 октября вместо выбранного 20 октября.
- **Решение/компромисс:** связать timezone с подтверждаемым token/проверенным
  потоком либо дать владельцу безопасную явную коррекцию. Нельзя просто разрешить
  anonymous last-writer update: чужой повтор может изменить выбор. Только новая миграция.
- **Проверка:** исправление pending, гонка разных signup, конкретный token,
  неизменность verified/legacy account от анонимного запроса, login и граница суток.
- **Неизвестно:** распространённость; SQL repro не выполнял реальную отправку/логин.

### AUD-005 — Runtime smoke наследует рабочее окружение

- **Тип/приоритет:** подтверждённый дефект, **P2**: нарушает границу изоляции тестов.
- **Место:** `src/server/runtime.test.ts:38–67`, особенно env spread `:42,65`
  и ожидание stdout `:46`; `runtime.ts`, `auth.ts` потребляют DATABASE_URL.
- **Условия/последствие:** shell экспортировал DATABASE_URL/APP_ORIGIN/NODE_ENV/
  MAIL_*. Дочерний main.js получает их вне guard testDatabase; может соединиться
  с рабочей БД, не стартовать либо дать readiness200 вместо ожидаемого503.
  Read startup query проверяет права роли; реальная отправка/потеря данных не доказана.
- **Доказательство:** root повторил bounded child repro: чистый env → health,
  readiness503, exit0; синтетический env на временный fake PostgreSQL loopback
  → **1 TCP connection**, exit1 до stdout. Никакой рабочий endpoint не использовался.
- **Решение:** явный очищенный application env для каждого child, сохранив
  системные PATH/library env; отдельно задать production testDatabase case.
  Ожидание startup должно замечать ранний exit/error, а не висеть до timeout.
- **Проверка:** parent env с synthetic DB/mail sentinels не вызывается no-DB
  smoke; signals/occupied port/ошибки/production DB case проходят; crash fail-fast.
- **Неизвестно:** какие env обычно экспортируют разработчики; .env сам этот child не читает.

### AUD-006 — Журнал команд исчерпывает возможность записи

- **Тип/приоритет:** риск жизненного цикла, **P2**, поведение подтверждено; порог высок.
- **Место:** `src/server/commands.ts:18–23`, `writeCommand.ts:18–36`,
  `src/domain/backup.ts` BACKUP_MAX_RECORDS, `migrations/005_commands.sql`.
- **Условия/последствие:** после 100000 ключей новый UI mutation исполняет work,
  затем возвращает400 и откатывается. Retention нет. Ряд операций пишет вложенные
  command records, поэтому число действий и строк не всегда совпадает.
- **Доказательство:** isolated generate_series + PUT settings: 400 invalid_data,
  revisions неизменны; export200, согласованный full replace200 освобождает
  историю до1, новая запись200. Импорт меняет generation/revisions и не является
  прозрачным обслуживанием. Clear тоже освобождает журнал ценой удаления дневника.
- **Решение:** определить срок гарантии повтора и безопасную ротацию/поколения;
  простое TTL-удаление может повторно исполнить старый запрос. Отдельно сообщать
  пользователю исчерпание ёмкости, не предлагать удалить данные как routine fix.
- **Проверка:** границы/повтор старого ключа/новая команда/nested commands,
  параллельная очистка, rollback/owner isolation; без потери записей.
- **Неизвестно:** текущая production ёмкость и срок до порога; пользовательские данные не читались.

### AUD-007 — Лишние чтения и полная загрузка медиа

- **Тип/приоритет:** риск, **P2**: число операций измерено, пользовательская медлительность не доказана.
- **Место:** `src/client/readState.ts:13–25`, `pages.ts:8–10`, `summaries.ts:11–18`,
  queries; `src/pages/TodayPage.tsx`, `PhotoGallery.tsx:25–31`,
  `DocumentFile.tsx:10–19`, `DocumentList.tsx:37–41`, `src/ui/FileImage.tsx:8–10`.
- **Условия/доказательство:** пустой #today с synthetic session без AuthBoundary/
  StrictMode даёт **30 GET**, из них20 diary-state,3 food,2 nutrition-days.
  consistentRead вложен в summaries/readPages, независимые компоненты повторяют
  один день. Один PNG DocumentFile даёт **2 GET files/:id** до preview.
  Галерея монтирует все фото, PDF загружается до клика; глобальная инвалидация
  повторяет проверку неизменяемых bytes. API pagination есть, UI исчерпывает все страницы.
- **Последствия:** лишний трафик/Blob/decode/SQL round trips, особенно при focus,
  редактировании метаданных и долгой истории. Все файлы ограничены суммарно100MiB;
  нельзя умножать 100000 записей на20MiB. Утечка object URL не установлена: cleanup есть.
- **Решение:** отдельными маленькими задачами переиспользовать проверенный Blob,
  загружать PDF по действию, ограничить активную галерею; измерить waterfall и
  убрать вложенные fences/дубли дня, сохранив coherent read. Scoped cache вводить
  лишь при необходимости, с owner/generation и очисткой при смене сессии.
- **Проверка:** request-count + Chromium waterfall; preview один fetch, скрытый
  PDF без bytes; реальные delete/logout/abort, coherent read при параллельной записи.
- **Неизвестно:** latency/heap/production pool pressure; численный SLO не выдумывается.

### AUD-008 — PAX metadata обходят лимит deploy-архива

- **Тип/приоритет:** подтверждённый дефект, **P2**: ресурсный риск, нужен deploy SSH key.
- **Место:** `deploy/install_release.py:18–40`, tarfile iteration `:24–25`,
  счётчик member.size `:34`; существующие тесты не проверяют extension metadata.
- **Условия/последствие:** разрешённый deploy-источник присылает сжатый tar с
  огромным PAX comment и корректными index/assets. Python раскрывает скрытый
  metadata до yield, а MAX_CONTENT считает только полезные files. Возможен рост
  памяти/CPU frontend host. Это не публичная web-загрузка и не произвольная запись пути.
- **Доказательство:** повторённый root repro с RLIMIT_AS512MiB: gzip **52227 bytes**,
  PAX comment **51MiB**, разрешённые file bytes37 → accepted, max RSS около269MiB.
  Только read_build, current/assets не устанавливались, exhaustion не проводился.
- **Решение:** ограничить общий распакованный gzip-поток до tarfile metadata parse,
  сохранив allowlist/число файлов/полезный размер и совместимость штатного GNU tar.
  Компромисс — ограниченный буфер/временный staging; не снимать проверки.
- **Проверка:** PAX/GNU/repeated metadata, explicit total cap, неизменность current
  при отказе; реальные dist, collision/repeat/rollback tests проходят.
- **Неизвестно:** installed parser/version и ресурсные лимиты VPS не инспектировались.

### AUD-009 — Недостаточный безопасный сигнал внутренних ошибок

- **Тип/приоритет:** риск, **P2**: отказ может быть виден пользователю без причины оператору.
- **Место:** `src/server/app.ts:5–6,22–30`, `emailAuth.ts:20–30`,
  `emailBinding.ts:41–45`, `accountMail.ts:31–34,52`, `runtime.ts:56–59`.
- **Доказательство/условия:** logger=false; unexpected500 отдаёт общую ошибку;
  SMTP catch сохраняет одинаковый accepted и полностью отбрасывает сигнал сбоя.
  Readiness проверяет только SELECT1. Политика privacy намеренная и обоснованная;
  нельзя включать raw Fastify/SMTP/SQL logging ради диагностики.
- **Решение/компромисс:** allowlist событий/счётчиков (класс операции, статус,
  случайный correlation ID), без account/email/IP/URL/body/SQL/exception.message/
  stack/секретов; определить rate/retention. Публичные ответы/защита enumeration прежние.
- **Проверка:** synthetic SQL/SMTP ошибки дают безопасный сигнал; sentinel
  токены/адреса не попадают в логи, accepted/500 контракт не изменён.
- **Неизвестно:** внешний мониторинг/Postfix/journal на production; нельзя утверждать,
  что во всей эксплуатации диагностики вообще нет.

### AUD-010 — E2E регистрируют API отдельно от production runtime

- **Тип/приоритет:** риск регрессии, **P2**: будущая пропущенная регистрация может остаться зелёной.
- **Место:** `tests/e2e/setup.ts:42–58` и `src/server/runtime.ts:35–52`;
  `runtime.test.ts:38–95` проверяет bundle health/readiness.
- **Доказательство:** сейчас обе рабочие поверхности совпадают; локальные E2E
  собирают factory вручную, добавляя synthetic clock/mailbox hooks. Проверка
  bundle не подтверждает наличие всех feature routes. Текущей отсутствующей route нет.
- **Решение:** небольшой surface/parity smoke собранного runtime на isolated DB;
  необязательно объединять factories или переносить test hooks в production.
- **Проверка:** намеренно пропущенная регистрация обнаруживается smoke;
  production не содержит test-mail/test-auth-window; все62 пары доступны как ожидается.
- **Неизвестно:** реального пропуска регистрации в истории не установлено.

### AUD-011 — Локальный монитор не видит исчезнувший VPS и offsite-порчу

- **Тип/приоритет:** известный архитектурный риск, **P2**, не дефект обещанного local monitor.
- **Место:** `deploy/backup_check.py`, `backup_monitor.py`, monitor units,
  ограничения в [BACKUPS](BACKUPS.md).
- **Условия/последствие:** data-host целиком выключен или уже подтверждённый
  ciphertext на втором VPS позднее потерян/повреждён. Локальная проверка/SMTP
  на том же host не сработает в первом случае и не перечитает offsite во втором.
- **Доказательство:** monitor читает локальный архив/status/systemd; ack проверяется
  в момент передачи, а не независимо в следующие дни. Реальный outage не создавался.
- **Решение/компромисс:** сначала определить владельца/канал/пороги и имеющийся
  внешний monitoring; затем отдельная разрешённая карточка на independent probe
  и периодическую synthetic offsite/restore проверку. Не добавлять сервис наугад.
- **Проверка:** безопасные drills host-unreachable/remote-missing/corrupt, независимое
  оповещение/восстановление/дедупликация без медицинских данных; retention7/14 прежняя.
- **Неизвестно:** мониторинг провайдера вне Git; аудит не доказывает его отсутствие.

### AUD-012 — Docs gate проверяет только существование файлов

- **Тип/приоритет:** улучшение, **P3**, текущая сломанная ссылка с anchor не доказана.
- **Место:** `scripts/check-docs.mjs:19–35`: fragment удаляется, вызывается access;
  design docs не входят в root/docs/src область обхода.
- **Последствие/доказательство:** зелёный check:docs не гарантирует якоря/синтаксис
  Mermaid/полную навигацию. Это ограничение gate, не доказательство неверных схем.
- **Решение:** отдельно расширить проверку собственных docs/anchors; Mermaid
  parser только после выбора существующего tooling либо отдельного решения о зависимости.
- **Проверка:** broken path/fragment и валидные русские anchors, invalid diagram
  при выбранном renderer; offline без внешней отправки документов.
- **Неизвестно:** renderer приложения просмотра Markdown может отличаться от локального.

### AUD-013 — Частично созданная тестовая БД оставляет роль

- **Тип/приоритет:** улучшение, **P3**, редкий test-only cleanup path.
- **Место:** `tests/serverDatabase.ts:18–22,28–32`.
- **Условия/доказательство:** CREATE ROLE успешен, CREATE DATABASE падает; catch
  только закрывает admin. При DROP DATABASE error DROP ROLE не достигается.
  Следствие — synthetic мусор выделенного кластера, не потеря production данных.
- **Решение:** учёт только созданных этой попыткой ресурсов и независимый best-effort
  cleanup с сохранением первичной ошибки; нельзя удалять чужие БД/роли.
- **Проверка:** fault injection после CREATE ROLE и при teardown, success-case
  без изменений. Реальный disk-full/сбой кластера здесь не создавался.

### AUD-014 — Число записей и размер JSON-копии не дают общей ёмкости

- **Тип/приоритет:** риск, **P2**: на больших валидных наборах часть экспорта недоступна.
- **Место:** `src/server/backupRoutes.ts:24–27`, `textSnapshot.ts`,
  `backupRoutes.test.ts:97–104`; domain backup/fullBackup limits.
- **Доказательство:** штатный пройденный тест создаёт80000 продуктов с name120/
  source160; text export возвращает413, записи80000 сохранены и слот освобождён.
  Collection cap100000 и text20MiB независимы; full200MiB здесь не опровергнут.
- **Последствие:** пользователь не может получить текстовую JSON-копию, хотя
  каждое поле/число записей допустимо. Серверный pg_dump — отдельная защита.
- **Решение/компромисс:** определить поддерживаемый объём и понятный ранний budget/
  альтернативу; только затем streaming/archive либо совместимые квоты. Простое
  увеличение JSON-лимита увеличит peak memory. Атомарный импорт сохранить.
- **Проверка:** supported-boundary export→restore и замеры памяти/времени;
  объяснимый отказ/альтернатива до потери возможности копии.
- **Неизвестно:** full export для этого набора, реальная ёмкость пользователя/память.

### AUD-015 — Весь интерфейс загружается одним крупным JS chunk

- **Тип/приоритет:** необязательное улучшение, **P3**, доказанной плохой скорости нет.
- **Место:** статические импорты `src/App.tsx`, отчёт `npm run build`.
- **Доказательство:** main JS513.68kB, gzip146.92kB, предупреждение Vite >500kB.
  На входе загружаются и экраны медиа/настроек; FCP/INP/parse time не измерялись.
- **Решение:** сначала измерить cold-load на целевом слабом устройстве; при
  заметной цене — lazy routes с доступным loading/error/retry. Не поднимать
  warning limit только ради отсутствия предупреждения, не менять сборщик.
- **Проверка:** сравнение transfers/parse и первого перехода по всем hash routes,
  chunk-load error/retry и открытая старая вкладка после frontend release.
- **Неизвестно:** экономический эффект split и фактические браузеры пользователей.

## Безопасность, данные и удачные решения

Сохранить при улучшениях:

- Авторизация до загрузки тела; session/Origin/CSRF, владелец только из сессии,
  параметризованный SQL, FORCE RLS и FK с user_id; runtime/migrator разделены.
- Argon2id, хеши случайных session/email token, атомарное одноразовое погашение,
  отзыв сессий и блокировка аккаунта против гонки старого пароля со reset.
- Сохраняемые auth budgets, ограничения hash/upload/backup slots; quota и
  malicious MIME/bytes/geometry проверяются на сервере, не только UI.
- Generation/revision/changeRevision/idempotency с записью результата в одной
  транзакции; противоречивый импорт полностью откатывается.
- Снимки пищи и append-only планы, явные null/ноль/полнота, календарь аккаунта,
  расчёты вне JSX; нет медицинской оценки фото или двойного учёта активности.
- Приватные attachment ответы no-store/nosniff/CSP, временные URL с cleanup;
  исходные документы сохраняются, фото подготавливаются без EXIF.
- CSP E2E использует политику настоящего Nginx; один dist artifact ID для обеих
  E2E платформ и frontend deploy, атомарный current/previous и immutable assets.
- Реальные isolated SQL, runtime build/start/signals, dump/GPG/restore/ACL/revoke,
  Chromium keyboard/axe/responsive/byte tests; недоступные SQL/browser не skip.
- Нет внешней аналитики/шрифтов/AI/общего доступа, production test endpoints;
  demo/макеты синтетические. Архитектурные слои уже соответствуют масштабу.

Статический поиск ключей/credential URLs в tracked text не обнаружил реального
секрета: URL — примеры и test sentinels; похожие на AWS ID совпадения внутри
сгенерированных font/base64 SVG — false positives. Проверялись типы/пути без
вывода значений. История всех Git-объектов и локальные закрытые файлы не
сканировались заново; прежнее history-review описано в SECURITY_RELEASE.
PDF container-check не обещает отсутствие вредоносного содержимого. Сервер
не шифрует рабочую БД at rest; администратор VPS остаётся доверенной стороной.

Npm audit относится к точному manifest/lock на дату проверки, источник —
[npm registry](https://registry.npmjs.org/), команда и итог сохранены выше.
Нулевой advisory result не распространяется на ОС/Docker/Python/Postfix/Nginx,
неизвестные уязвимости или корректность собственного кода.

## Согласованность документов и схем

README/PROJECT_MAP/API_REFERENCE соответствуют API-only runtime и62 операциям.
MVP, DATABASE/SERVER_STORAGE и старые review/task notes описывают исторические
этапы: при конфликте текущий runtime/миграции и API_REFERENCE являются источником
фактов. REFACTORING_PLAN — приёмка прежнего выпуска, не доказательство отсутствия
новых edge cases. Разрешения на push в истории не распространялись на T231.

Уточнены архивные тексты design/desktop/README: прежние фразы о неподключённых
графиках/браузерном хранении относятся к концептам; работающие графики питания
и ручных показателей уже есть, OCR остаётся будущим. Макеты не исполняемый UI.
AGENTS не изменены. Требование локального коммита уступило прямому запрету
пользователя на этапе аудита. Следующий явный запрос разрешил коммит/push/деплой
документации; done T231 подтверждается коммитом, факты доставки сообщаются отдельно.

Схемы ARCHITECTURE сверены с main/App/runtime, всеми migrations и deploy.
Sequence diagrams имеют≤4 участников, ER разбиты на группы≤5 сущностей,
flowchart направлены сверху вниз. Синтаксис проверен структурно и по
[официальной справке Mermaid](https://mermaid.js.org/syntax/entityRelationshipDiagram.html).
Установленных Mermaid/mmdc/offline bundle нет; **полный parse/render и визуальная
геометрия Mermaid не проверены**. Браузер сам не умеет исполнять Mermaid без
этой библиотеки; новая зависимость и внешняя отправка документа не добавлялись.

## Непроверенное и границы вывода

Не выполнены production SQL/SSH/SMTP, remote CI/deploy и deployed smoke;
live SHA, DNS/TLS, offsite freshness/доступность recovery key не подтверждены
этим аудитом. Исторические доказательства не выданы за нынешнюю проверку.
Не выполнялись нагрузка/пентест/полный malware scan, EXPLAIN больших выборок,
реальные устройства/Safari/Firefox/screen reader, clean-install и повторный
генератор дизайна. Сторонняя реализация исключена, конфигурация учтена.
Проверка всех старых карточек/строк assertions была выборочной, что отмечено
в файловом реестре. Эти ограничения не блокировали локальные документы и backlog.

## Уточнение после исходного аудита: AUD-016

**Тип:** риск. **Приоритет:** P2 — крупные публичные assets передаются без сжатия,
что существенно увеличивает ожидание при ограниченном канале. Нет установленного
продуктового SLA, поэтому это не объявлено нарушением функционального требования.

**Место:** deploy/nginx.conf, HTTPS server location /assets/ (около строки43);
фактический frontend VPS Nginx global gzip. **Условия:** холодный cache,
ограниченная сеть, клиент принимает gzip. **Последствие:** лишние bytes и задержка
первого видимого содержимого/полезного действия.

**Доказательство20.10.2026:** read-only GET live JS release792e0b0 с
Accept-Encoding:gzip вернул identity/513682bytes; nginx -T показал gzip on
без типов JS/CSS/TTF. На текущем dist с тем же модельным сценарием identity
1045464→gzip440551bytes assets, median FCP3476→1500ms. Это локальная модель,
а не измерение live latency. Полные условия/точки: [COLD_LOAD](COLD_LOAD.md).

**Решение:** T258a/IMP-029 — gzip только публичных /assets/ с явным API gzip off;
не менять личные ответы и не добавлять chunking без отдельного доказательства.
Компромисс: немного CPU на compression, управляемый level5; hash assets cache
сохраняется. **Приёмка:** native Nginx negotiated gzip/identity, совпадение
декодированных bytes, API identity, CSP/cache/health без регрессии; live после
установки и rollback. **Не подтверждено:** production CPU/p95, mobile hardware
и фактический эффект после внедрения. На момент T258 config ещё не изменён.
