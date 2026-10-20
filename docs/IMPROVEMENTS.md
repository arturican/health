# Приоритетный backlog по аудиту T231

Основание: [AUDIT](AUDIT.md), код `9718e60423c28bbc708db95bf045db6403575769`,
20.10.2026. Существующая архитектура — [ARCHITECTURE](ARCHITECTURE.md).
Исходно это были рекомендации. Следующим запросом 20.10.2026 пользователь
разрешил необходимые исправления, последовательные коммиты/push/деплой. Очередь
T232–T260 и статусы — в [TASKS](../TASKS.md); карточки привязаны к IMP/AUD.
Условные оптимизации принимаются по измерениям. Завершённые прежние T-задачи
не переоткрываются; отчёт AUDIT остаётся исходным срезом.

P0/P1 в этом аудите не подтверждены. Первыми идут достижимые сбои обычной работы
и граница безопасности тестов, затем ресурсные риски и измеряемые оптимизации.
При равном P2 порядок учитывает вероятность, ущерб и стоимость проверки.
S — небольшой локальный шаг; M — несколько взаимодействующих мест; L потребовал
бы отдельного разбиения и здесь не выдаётся за один исполнимый коммит.

Один implementation step должен укладываться в≤5 файлов приложения и≤250
добавленных/удалённых строк реализации, тесты/документы отдельно. Если выбранное
решение превышает бюджет, перед правками создать подкарточки; не ужимать код.
Decision/measurement steps имеют самостоятельный проверяемый результат и не
разрешают автоматически следующую реализацию/инфраструктуру.

## Пять наиболее полезных следующих действий

1. **IMP-001:** исключить рабочие DB/mail env из runtime smoke и замечать crash.
2. **IMP-002:** сохранить черновики фото/документов при failed visibility refresh.
3. **IMP-003:** вернуть Cancel при устаревшем чтении, сохранив pending-защиту.
4. **IMP-004:** дать явное восстановление настроек/плана после конфликта409.
5. **IMP-005:** подтверждать выбранный timezone безопасно при повторной регистрации.

Каждый пункт имеет воспроизведение в аудите и может стать отдельной задачей.
IMP-006 (deploy metadata cap) также разумно выполнить до следующей доставки;
его эксплуатационный риск ниже публичного upload, поскольку нужен deploy key.

## Ближайшие исправления

| Порядок / ID / приоритет | Находки и цель | Модули, зависимости | Размер / риск | Проверяемая приёмка |
|---|---|---|---|---|
| 1 / IMP-001 / P2 | AUD-005: изолировать env дочерних smoke | runtime.test, при необходимости tests helper; нет | S / низкий | Synthetic DATABASE_URL/MAIL_* parent не вызываются no-DB child; readiness503 и signals; production DB case берёт только testDatabase; early exit завершается понятной ошибкой без ожидания stdout timeout |
| 2 / IMP-002 / P2 | AUD-001: transient failure не уничтожает media draft | useVisibility, App, при необходимости media page; нет | M / средний | Обе страницы сохраняют введённые поля/выбранный файл после failed GET и retry; неизвестный initial state скрыт; explicit hide/logout работают; данные другого владельца не видны |
| 3 / IMP-003 / P2 | AUD-002: отделить Cancel от read-current | ProductForm, FoodForm, WorkoutForm, LabForm; нет | S / низкий | При failed reread Save disabled, Cancel enabled для четырёх редакторов; Lab проверен при сбое documents; фокус осмысленный; pending write/конфликтующее удаление по-прежнему защищены |
| 4 / IMP-004 / P2 | AUD-003: восстановить snapshot по явному выбору | PrivacySettings, EnergyPlanForm, при необходимости EnergyPlanSettings; нет | M / средний | Draft R → чужой R+1 →409 → свежий GET; до выбора draft прежний; discard/reload получает R+1, следующий save успешен; автоматического rebase/перезаписи нет, pending не сбрасывается |
| 5 / IMP-005 / P2 | AUD-004: связать timezone с подтверждаемым выбором | новая SQL migration, emailAuth/контракт при необходимости, RegistrationForm; нет | M / высокий, auth+данные | Две pending регистрации с разными zone, конкретный действующий token подтверждает выбранную zone; чужая гонка не меняет verified/legacy аккаунт; login/day boundary согласованы; прежние migrations неизменны. Если SQL-функции превышают бюджет — разделить совместимое хранение token zone и применение при complete до реализации |
| 6 / IMP-006 / P2 | AUD-008: ограничить все decompressed bytes до tar parse | deploy/install_release.py; нет | M / средний | Бounded PAX/GNU/repeated metadata выше явного total limit отвергаются до большого выделения памяти; current/assets неизменны; настоящий dist/verify_build, repeat/collision/previous проходят; лимит защищён regression |

Регрессии IMP-002…004 должны проходить через настоящие API hooks. Alias на
legacy можно сохранить в тестах layout/валидации; он не подтверждает HTTP
revision/refetch. Для IMP-005 нужен новый SQL/HTTP integration test; реальные
письма не нужны. IMP-006 проверяется только synthetic архивом с ограниченными
ресурсами, не exhaustion на VPS.

## Жизненный цикл данных и диагностика

| ID / приоритет | Находки и цель | Модули, зависимости | Размер / риск | Проверяемая приёмка |
|---|---|---|---|---|
| IMP-007 / P2 | AUD-006: объяснимое исчерпание command capacity | commands, httpErrors/app и client/http при необходимости; нет | S / средний | Граница100000 возвращает отдельный безопасный код/понятное сообщение, revisions не меняются, чтение/экспорт доступны, прежний ключ повторяется; не предлагать удалить дневник как обычное решение |
| IMP-008 / P2 | AUD-006: определить протокол ротации журнала | API_REFERENCE/карточка решения, commands/writeCommand review; IMP-007 | S / низкий, документация | Явно выбран replay window, поведение старого key и generation, online/offline вкладок, nested commands и concurrent maintenance; угрозы дубликата описаны; постоянные regression cases и малые следующие карточки перечислены |
| IMP-009 / P2 | AUD-006: внедрить выбранную bounded maintenance | commands, writeCommand, diaryState, новая migration при необходимости; IMP-008 | M / высокий | Старый запрос не исполняется повторно вне разрешённого протокола, порог не блокирует новый дневник навсегда; concurrent writes/cleanup/rollback и owner isolation; ни одна пользовательская запись не удаляется. При необходимости отдельные compatible migration и включение maintenance |
| IMP-010 / P2 | AUD-009: allowlisted диагностические события | app, accountMail, emailAuth, emailBinding; нет | M / средний, privacy | Synthetic500/SMTP failure дают один код/счётчик с ограниченной частотой/retention; нет адреса/account/IP/URL/body/token/SQL/raw error; публичный accepted/500 прежний; success без ложных событий; без внешней аналитики |
| IMP-011 / P2 | AUD-010: проверить поверхность собранного runtime | runtime.test и isolated fixtures; IMP-001 | S / низкий | Smoke реального bundle обнаруживает отсутствие любой группы62 routes; auth-required отказы ожидаемы, production test-mail/test-auth-window404; тест fails при намеренной пропущенной регистрации, test hooks не добавлены в runtime |
| IMP-012 / P2 | AUD-014: определить поддерживаемую экспортную ёмкость | backup/text/full snapshots и docs, только измерение; нет | S / низкий | Synthetic data boundary для text/full, max-field/mixed files, bytes/peak memory/time; отдельный вывод про text20MiB/full200MiB; выбрать поддерживаемый объём и документировать доступный путь копии без прочтения реальных данных |
| IMP-013 / P2 | AUD-014: понятный отказ и проверенная альтернатива копии | SettingsPage, FullBackupExport, client/http/backupRepository; IMP-012 | M / средний | При text413 пользователь понимает причину и может явно выбрать full, если она поддерживает этот объём; full failure объясним и данные/slot неизменны; UI не обещает экспорт любого объёма; все успешные копии восстанавливаются |

Если IMP-012 покажет, что полный JSON не покрывает согласованный рабочий объём,
нужна отдельная очередь изменения формата: спецификация совместимости/квот →
ограниченный exporter → совместимый importer → UI/restore regression. Эти шаги
зависят от выбранного объёма/формата и не подменены бездоказательным требованием
добавить ZIP-библиотеку или увеличить лимит. До этого защитный413 сохраняется.

## Производительность по измерениям

| ID / приоритет | Находки и цель | Модули, зависимости | Размер / риск | Проверяемая приёмка |
|---|---|---|---|---|
| IMP-014 / P2 | AUD-007: один проверенный Blob для preview документа | DocumentFile, FileImage либо небольшой локальный renderer; нет | S / низкий | Один PNG/JPEG/WebP документ =1 files GET; те же bytes для download; URL cleanup при unmount/delete/logout, MIME/purpose проверка прежняя |
| IMP-015 / P2 | AUD-007: bytes вложения только по явному открытию | DocumentFile, fileRepository при необходимости; IMP-014 | S / низкий | До открытия/download нет запроса bytes вложения, явный click даёт исходный файл/preview; pending/error/retry и expired session доступны, повтор не создаёт лишних simultaneous loads. Текущий document DTO не содержит MIME: откладывается любое вложение; выборочное auto-preview потребует отдельного metadata-контракта |
| IMP-016 / P2 | AUD-007: ограничить монтирование галереи | PhotoGallery, PhotoComparison, при необходимости photoRepository; нет | M / средний | Synthetic100MiB медиатека не загружается целиком при входе; keyboard/scroll/выбор двух фото/удаление доступны, выбранное фото не пропадает; missing/error/loading различимы; без новой зависимости |
| IMP-017 / P2 | AUD-007: зафиксировать waterfall и budget | TodayPage/summaries/readState/pages, measurement/regression; нет | S / низкий | Воспроизводимая synthetic дата/session и список GET до/после focus/mutation; исходные30/20 не принимаются за latency; согласованы измеренный budget и конкретные дубли для следующего шага |
| IMP-018 / P2 | AUD-007: убрать вложенные consistency fences | readState, pages, summaries; IMP-017 | M / высокий, согласованность | Меньше redundant diary-state по выбранному budget; запись между страницами не смешивает поколения/ревизии; трёхкратный retry/409, owner swap/abort/курсор-loop тесты проходят |
| IMP-019 / P2 | AUD-007: совместное чтение дня в одном view | TodayPage, NutritionSummary, EnergySummary, summaries; IMP-017/018 | M / средний | Food/nutrition-days не дублируются независимыми карточками выбранного view; ошибка/загрузка/день/полнота/null не меняются; нет persistent data вне памяти, нет stale action |
| IMP-020 / P2, условно | AUD-007: инвалидация/дедуп файлов только при доказанной цене | queries, fileRepository, FileImage, session; IMP-014…019 и повторный замер | M / высокий, privacy | Metadata mutation не перекачивает посторонние immutable files; cache identity содержит owner+generation+fileID, logout/replace/delete очищают данные и URL; если замер не оправдывает сложность — закрыть решением без кода |

Объединять следует чтения с общей ответственностью «согласованный snapshot
одного владельца/дня», а не все внешне похожие репозитории. Общий UI-form
framework, новый state manager, microservices и переписывание сервера для этих
находок не нужны. Цена ошибок согласованности выше экономии нескольких GET.

## Эксплуатация и необязательные улучшения

| ID / приоритет | Находки и цель | Модули, зависимости | Размер / риск | Проверяемая приёмка |
|---|---|---|---|---|
| IMP-021 / P2 | AUD-011: определить независимый контроль копий | BACKUPS, инвентаризация существующего monitoring; нет | S / низкий, docs-only | Установлено, что уже покрывает провайдер; выбран владелец/канал/пороги outage/offsite/drill и необходимые доступы, без передачи реальных документов; отдельно разрешена инфраструктура |
| IMP-022 / P2 | AUD-011: внешний watchdog | конкретные monitor config/script и runbook после IMP-021; требуется отдельное разрешение | M / высокий, инфраструктура | Synthetic host-unreachable замечается вне data-host, независимая доставка/возврат healthy/dedup; нет секретов/данных в payload, проверен rollback; не добавлять SaaS без выбора пользователем |
| IMP-023 / P2 | AUD-011: независимая offsite проверка и restore drill | backup-check tooling/runbook, отдельные configs≤5; IMP-021, отдельное разрешение | M / высокий, данные/доступ | Synthetic missing/corrupt ciphertext и restore проверены отдельно; private key не устанавливается на VPS, restored auth отозвана; режим read-only и безопасные пути, current7/14retention прежняя |
| IMP-024 / P3 | AUD-012: проверять anchors и design docs | scripts/check-docs.mjs + synthetic fixtures; нет | S / низкий | Ложный fragment/путь ломает gate, русские headings/URL encoding/дубли headings корректны; полный own docs scope без node_modules/network |
| IMP-025 / P3 | AUD-012: выбрать Mermaid validation | docs tooling/config только после отдельного решения о зависимости; нет | S / низкий, сначала docs | Зафиксирован доступный offline parser/renderer и версия; затем отдельная малая карточка gate с valid/invalid flow/ER/sequence fixtures; отсутствие parser не выдаётся за успешный parse |
| IMP-026 / P3 | AUD-013: cleanup частичного SQL fixture setup | tests/serverDatabase.ts; нет | S / низкий | Fault после CREATE ROLE не оставляет свою роль; teardown сохраняет исходную ошибку и безопасно пытается очистить независимые ресурсы; чужие имена никогда не удаляются |
| IMP-027 / P3 | AUD-015: измерить cold load | build stats и синтетический browser measurement, без source refactor; нет | S / низкий | Одинаковый device/network профиль, compressed transfer/parse/FCP и переходы зафиксированы; решение split/no-split обосновано, chunk warning не объявлен дефектом UX |
| IMP-028 / P3, условно | AUD-015: lazy-load тяжёлых маршрутов | App и доступный fallback/error boundary; IMP-027 | M / средний | Измеренное улучшение initial load, все8hash routes/keyboard/retry; chunk failure объясним, старая открытая вкладка после release продолжает работать; warning limit не повышен как «исправление» |

Для IMP-022/023 сначала согласуются конкретные разрешения и доступы. Они
включены в план из-за установленного ограничения локального мониторинга;
план не утверждает, что сторонний monitoring сейчас отсутствует.

## Проверки и завершение будущих задач

Баг начинается с постоянной регрессии, воспроизводящей условие AUD. Не копировать
реализацию в тест: проверять действие/видимый результат/данные и отказ. Временные
аудитные assertions о наличии бага не являются проверкой исправления.

В ходе работы — связанные unit/API/Browser тесты, только synthetic isolated DB.
Для самостоятельной задачи приложения — полный check; build:api для серверной
области, Python/verify_build для deploy. Перед разрешённым push — gates карты
после последних изменений; не повторять успешные неизменённые проверки.
Не ослаблять lint/типы/coverage/CSP/RLS/байтовые лимиты ради зелёного результата.
Документальная задача — check:docs и diff --check. Отдельный коммит подтверждает
done, push/деплой требуют своего разрешения. Итог выпуска подтверждается точным
SHA, CI и live-проверками; локальный аудит этого не заменяет.

## Дополнение по измерению T258

| ID / приоритет | Связь и цель | Модули / зависимости | Сложность / риск | Приёмка |
|---|---|---|---|---|
| IMP-029 / P2 | AUD-016: сократить передачу публичной статики | deploy/nginx.conf, native verify/runbook; IMP-027/T258 | S / средний: webserver config | gzip/identity negotiation для JS/CSS/TTF, decoded bytes прежние, API явно identity, CSP/cache и health сохранены; nginx -t, rollback, live metadata после T260 |

Это измеренное уточнение порядка: сначала T258a (не требует изменения UI),
затем решение T259 по условному IMP-028. См. [COLD_LOAD](COLD_LOAD.md).
