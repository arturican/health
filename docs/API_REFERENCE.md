# Контракт текущего API

Сверено с локальным runtime после T213, 20.10.2026. Базовый путь `/api/v1`.
Ниже 62 явно зарегистрированные пары метод/путь; автоматические HEAD не перечислены.
Точки входа: [runtime](../src/server/runtime.ts), [app](../src/server/app.ts),
тематические Routes/Records в [server](../src/server), транспорт в [client](../src/client).
Объём и приёмка — [BACKEND_PLAN](BACKEND_PLAN.md), запуск — [README](../README.md).
Это контракт локального кода; установленная версия VPS проверяется отдельно.

## Доступ и общие правила

Все ответы API имеют Cache-Control: no-store и X-Content-Type-Options: nosniff.
В production обязательны конфигурация БД и HTTPS. Без БД в режиме разработки
регистрируются только health/readiness. Обычный JSON ограничен 16 KiB.

Все изменяющие запросы требуют Origin, точно совпадающий с APP_ORIGIN, включая
публичные login/email/logout. Приватные маршруты требуют cookie
`__Host-health_session` (Secure, HttpOnly, SameSite=Lax), приватные записи также
`X-CSRF-Token` из результата login/session. Account ID возвращается в
`X-Account-Id`; авторизация и изоляция данных выполняются сервером/RLS.
Чужие объекты недоступны. Детальные ограничения — [PRIVACY_SECURITY](PRIVACY_SECURITY.md).

Для команд дневника нужен `X-Diary-Generation` из GET diary-state.
`Idempotency-Key` поддерживает повтор команды: тот же ключ и запрос возвращают
сохранённый результат, изменённый запрос с тем же ключом даёт 409.
Предел журнала100000 записей даёт409 с JSON error.code=command_capacity и
заголовком X-Health-Error-Code=command_capacity. Клиент показывает только своё
allowlisted сообщение для этой пары status/code; тело ошибки не выводится.
Новая запись откатывается целиком, replay сохранённого ключа, чтение и
text/full export доступны. Удаление дневника не является способом обслуживания.

Клиент посылает ключ для записей; сервер для большинства обычных команд допускает
его отсутствие. `X-Diary-Revision` передаёт changeRevision из diary-state:
для обычных команд необязателен, для импорта/очистки обязателен вместе с ключом
и generation. Generation — UUID; changeRevision — безопасное неотрицательное
целое, ревизия записи — положительное безопасное целое.

В таблицах `R` означает `{value: DTO, revision: n}`, `C` — тело
`{value: DTO, revision: null}`, `U` — `{value: DTO, revision: n}`,
`D` — `{revision: n}`. ID нового объекта — UUID, генерируемый клиентом.
При редактировании ID тела соответствует ID пути. Stale revision/generation
даёт 409. Обычное создание возвращает 201 R, изменение — 200 R,
удаление — 204; исключения указаны ниже. DTO и runtime-валидация определены
схемами [domain](../src/domain), ответы собираются тематическими Records.

## Процесс и аккаунт

Публичные маршруты отмечены явно; остальные требуют сессии.
Пароли и одноразовые токены не сохраняются в клиентском состоянии дневника.

| Метод | Путь | Доступ, запрос и результат |
|---|---|---|
| GET | `/health` | Публичный liveness: 200 `{status:'ok'}` |
| GET | `/readiness` | Публичный: SELECT 1 через runtime pool; 200 `{status:'ready'}`, иначе 503 `{status:'unavailable'}` |
| POST | `/auth/login` | Публичный `{login,password}`; 200 account/csrf, cookie; email и legacy login |
| GET | `/auth/session` | Сессия; 200 account/csrf; просроченная сессия 401 |
| POST | `/auth/logout` | Origin и CSRF при наличии cookie; 204 и очистка cookie, допускает отсутствие сессии |
| POST | `/auth/email/register` | Публичный `{email,timezone}`; 202 accepted без раскрытия существования аккаунта |
| POST | `/auth/email/request` | Публичный `{email,purpose}`; purpose verify_email/reset_password; 202 accepted |
| POST | `/auth/email/complete` | Публичный `{token,purpose,password}`; token 64 hex; 200 accepted, cookie очищается, затем нужен login |
| GET | `/auth/email` | Сессия; `{email: string или null, verified: boolean}` |
| POST | `/auth/email/bind` | Сессия/CSRF, `{email,password}` с текущим паролем; 202 accepted |

Схемы email — [emailAccount](../src/domain/emailAccount.ts).
Неверная/просроченная ссылка даёт 400. Отключённая почта — 503.
Ошибка фактической доставки не раскрывается в публичном ответе accepted.
Парольные проверки ограничены четырьмя одновременными операциями; auth/email
имеют сохраняемые в PostgreSQL rate limits. SMTP не проверяется readiness.
Проба SQL использует acquire timeout 5 секунд и query timeout 1 секунду;
она не проверяет миграции, доставку почты или внешние резервные копии.

## Записи дневника

Все маршруты этой группы приватные. Даты — календарные строки YYYY-MM-DD;
значения по умолчанию «сегодня» вычисляются в timezone пользователя.
Для email-регистрации timezone привязан к выданной ссылке подтверждения
(migration016). Повтор после cooldown может выбрать другой пояс; обычный
resend сохраняет пояс ссылки. Подтверждение применяет его только к новому
email_required аккаунту. Legacy, verified и reset сохраняют пояс; старые
ссылки без token zone используют прежний пояс аккаунта.

Формулы и смысл данных — [CALCULATIONS](CALCULATIONS.md).

| Метод | Путь | Тело / результат |
|---|---|---|
| GET | `/profile` | R или null при отсутствии профиля |
| POST | `/profile` | `{profile,weight}`; атомарно профиль и первый вес |
| PUT | `/profile` | U профиля |
| GET | `/weights` | Страница, asOf/before |
| POST | `/weights` | C измерения веса |
| PUT | `/weights/:id` | U измерения веса |
| DELETE | `/weights/:id` | D |
| GET | `/products` | Страница, after/archived |
| GET | `/products/:id` | R продукта |
| POST | `/products` | C продукта |
| PUT | `/products/:id` | U, включая archived; отдельного DELETE нет |
| POST | `/products/seed` | `{}`; 200 `{added}`; однократное заполнение исходного каталога |
| GET | `/food` | Страница, date/after |
| POST | `/food` | C с id/date/meal/grams/note/productId; сервер сохраняет снимок продукта |
| PUT | `/food/:id` | U: id/date/meal/grams/note; снимок пищевой ценности не заменяется |
| DELETE | `/food/:id` | D |
| POST | `/food/copy` | `{commandId,source,meal,target}`; 200 `{count}`, копирование приёма пищи |
| GET | `/nutrition-days/:date` | R дневной настройки или null |
| PUT | `/nutrition-days/:date` | `{value,revision:null или n}`; создание/изменение настройки |
| GET | `/steps` | Страница, from/to/before |
| GET | `/steps/:date` | R или null |
| PUT | `/steps/:date` | `{value,revision:null или n}` |
| DELETE | `/steps/:date` | D |
| GET | `/workouts` | Страница, date/after |
| POST | `/workouts` | C тренировки |
| PUT | `/workouts/:id` | U тренировки |
| DELETE | `/workouts/:id` | D |
| GET | `/energy-plans` | Страница версий, before |
| GET | `/energy-plans/effective/:date` | Действующая версия с effectiveFrom ≤ date либо null |
| POST | `/energy-plans` | `{id,value,expectedRevision}`; новая версия, история append-only |
| GET | `/photos` | Страница, after |
| POST | `/photos` | Бинарная загрузка, см. ниже |
| PUT | `/photos/:id` | U метаданных |
| DELETE | `/photos/:id` | D |
| GET | `/documents` | Страница, after |
| GET | `/documents/:id` | R документа |
| POST | `/documents` | Бинарная загрузка |
| PUT | `/documents/:id` | U метаданных |
| GET | `/documents/:id/results-count` | `{count,revision}` для безопасного удаления |
| DELETE | `/documents/:id` | `{revision,expectedResults:null или n}`; null только без результатов, иначе точное число |
| GET | `/lab-results` | Страница, documentId/after |
| POST | `/lab-results` | C ручного результата |
| PUT | `/lab-results/:id` | U ручного результата |
| DELETE | `/lab-results/:id` | D |
| GET | `/files/:id` | Авторизованная бинарная выдача вложения |
| GET | `/diary-state` | `{generation,value,revision,changeRevision,catalogSeeded}`, value — видимость разделов |
| PUT | `/settings` | U, value `{version:1,showPhotos,showDocuments}`; возвращает diary-state |
| DELETE | `/diary` | `{confirm:'delete-diary'}` плюс обязательные заголовки команды; 200 `{generation}` |

GET diary-state лениво создаёт пустые настройки. Очистка удаляет дневник,
сбрасывает настройки и меняет generation; аккаунт и сессии сохраняются.
Изменение результатов анализа обновляет ревизию документа, чтобы удаление
не потеряло добавленные после подтверждения результаты.

## Пагинация и согласованность

Коллекции возвращают `{items,nextAfter}` или `{items,nextBefore}`.
limit — 1..100, по умолчанию 100, неизвестные параметры коллекций дают 400.
Конечный курсор равен null; курсор следующей страницы передаётся без изменения.

| Коллекция | Параметры и порядок |
|---|---|
| products | after UUID; archived=true включает архивные, по умолчанию исключает |
| weights | asOf (сегодня по умолчанию), before дата; убывание даты |
| steps | from (0001-01-01), to (сегодня), before дата; убывание даты |
| food/workouts | date (сегодня), after UUID |
| photos/documents | after UUID |
| lab-results | documentId необязателен, after UUID; чужой/несуществующий документ 404 |
| energy-plans | before — числовая ревизия; убывание ревизии, nextBefore число |

Один GET использует свою транзакцию чтения. Несколько страниц не составляют
одну транзакцию. [readState](../src/client/readState.ts) сравнивает changeRevision
до/после набора чтений и повторяет его до трёх попыток при конкурентной записи.

## Файлы и копии

POST photos/documents принимает application/octet-stream и заголовок X-Record:
канонический base64url без padding, UTF-8 JSON метаданных (до 4096 символов),
включая id/fileId/mime и поля записи. Сессионные/командные заголовки обязательны
как для других записей. Фото — подготовленный JPEG до 10 MiB, стороны до 2048;
клиент удаляет EXIF. Документы — PDF/JPEG/PNG/WebP до 20 MiB, оригинал сохраняется.
Сервер проверяет содержимое и декодирование изображений; общая квота файлов
100 MiB. Одновременно допускаются две загрузки и одна операция backup.

GET files выдаёт Content-Type, Content-Disposition attachment с UUID-именем,
X-File-Purpose photo/document и CSP `default-src 'none'; sandbox`.
Публичных ссылок на вложения нет. Коллекции ограничены 100000 записями.

| Метод | Путь | Формат и результат |
|---|---|---|
| GET | `/backup/text` | JSON attachment, текстовый дневник без бинарных вложений |
| GET | `/backup/full` | JSON attachment, включая файлы base64 и скрытые разделы |
| POST | `/backup/text` | application/vnd.health-diary+json, UTF-8 bytes до 20 MiB; 200 `{generation}` |
| POST | `/backup/full` | Тот же тип, до 200 MiB; 200 `{generation}` |

Импорт: X-Import-Mode empty (по умолчанию) или replace; обязательны
Idempotency-Key, X-Diary-Generation, X-Diary-Revision и обычные Origin/CSRF.
Валидация выполняется до атомарного изменения данных; текстовый импорт
сохраняет вложения. После импорта обновить контекст через GET diary-state.
Схемы — [backup](../src/domain/backup.ts), [fullBackup](../src/domain/fullBackup.ts).
Экспорт не содержит паролей/сессий; JSON не зашифрован. Серверные GPG/SQL-копии
и восстановление описаны отдельно в [BACKUPS](BACKUPS.md).

## Ошибки

Обычная ошибка: `{error:{code,message}}`, без SQL/секретов/stack trace.
Health/readiness возвращают собственное тело status.

| HTTP | Значение |
|---|---|
| 400 | Неверные поля, параметры, токен ссылки или подтверждение; U+0000 в тексте дневника/импорта/метаданных |
| 401 | Нет действующей сессии / неверные реквизиты входа |
| 403 | Неверный Origin или CSRF |
| 404 | Объект не найден или принадлежит другому аккаунту |
| 409 | Ревизия/generation/повтор команды/состояние импорта конфликтуют |
| 413 | Превышение размера |
| 415 | Неподдерживаемый формат тела/файла |
| 429 | Лимит запросов или параллельной работы |
| 500 | Безопасная внутренняя ошибка |
| 503 | SQL readiness недоступен или почтовый сервис отключён/недоступен |

Не интерпретировать отсутствие записи как ноль. API хранит наблюдения и
справочные значения; диагнозы, распознавание и совместный доступ отсутствуют.
