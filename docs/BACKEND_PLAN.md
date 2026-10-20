# Backend текущего дневника — обзор T211

20.10.2026, основа 18309bb. Объём: восемь существующих экранов, аккаунты,
серверное хранение, вложения, копии и эксплуатационная проверяемость.
Запрос пользователя разрешает последовательные T211–T214 с отдельными
проверками и локальными коммитами; новые продуктовые функции IDEAS не включены.

## Реализованные области и доказательства

Проверены runtime/регистрация маршрутов, тематические Routes/Records,
границы ввода и клиентский транспорт. Ниже точки входа и подходящие тесты;
наличие теста не подменяет успешный прогон. Это обзор текущего кода,
не обещание отсутствия всех ошибок или новый production security scan.

| Область | Реализация | Проверки в репозитории |
|---|---|---|
| Запуск/закрытие | server/runtime, main, app, config, database | runtime.test.ts, app.test.ts, config.test.ts |
| Вход/сессии/CSRF | auth, sessions, httpSecurity, authRateLimit | auth.test.ts, sessions.test.ts, authRateLimit.test.ts, proxyIp.test.ts |
| Регистрация/email/сброс | emailAuth, emailBinding, accountMail, migrations 011–015 | emailAuth.test.ts, emailLoginBinding.test.ts, accountMail.test.ts, email-recovery E2E |
| Профиль/вес | profileRoutes/Records, weightRoutes/Records | profileRoutes.test.ts, weightRoutes.test.ts, profile-weight E2E |
| Продукты/питание | product/food/nutrition Routes/Records, seedProducts | productRoutes.test.ts, foodRoutes.test.ts, nutritionRoutes.test.ts, nutrition-day E2E |
| Шаги/тренировки/план | steps/workout/plan Routes/Records | stepsRoutes.test.ts, workoutRoutes.test.ts, planRoutes.test.ts, activity-plan E2E |
| Фото/документы/анализы | uploadTransport, fileRecords, photo/document/lab Routes/Records | fileRecords.test.ts, attachmentCommands.test.ts, labRoutes.test.ts, media/lab E2E |
| Настройки/очистка | settingsRoutes, diaryState, clearRoutes | settingsRoutes.test.ts, clearRoutes.test.ts, generationAssertions |
| Импорт/экспорт | backupRoutes/Transport, prepareFullImport, restoreText/Full | backupRoutes.test.ts, restoreText.test.ts, restoreFull.test.ts, full/text/invalid backup E2E |
| Изоляция/повторы | userTransaction, writeCommand, commands, FORCE RLS | userTransaction.test.ts, writeCommand.test.ts, journalCommands.test.ts, activityCommands.test.ts |
| Серверные копии/восстановление | deploy/backup_*.py, backupRestore.test.ts, SQL T203 | 38 Python deploy, backupRestore.test.ts, restoredAccess.test.ts, T210 |

Матрица описывает уже реализованный backend: CRUD заново не создаётся.
Коллекции ограничены страницами до 100 элементов, изменяющие операции проверяют
generation/revision, пользовательские транзакции изолированы RLS. Вложения
ограничены типом/байтами/декодированием и квотой, импорт валидируется до записи.
Расчёты и справочные медицинские границы остаются в domain/CALCULATIONS.

## Очередь завершения

Статусы — только [TASKS](../TASKS.md).

| ID | Наблюдаемый результат | Основание |
|---|---|---|
| [T211](tasks/T211.md) | Полная карта текущих функций и карточки оставшихся работ | Запрос пользователя; очередь прежде описывала преимущественно резервирование |
| [T212](tasks/T212.md) | Проверка четырёх одновременных verifier без случайного тайминга | auth.test.ts: общий итог HTTP 200 не измеряет одновременность; отказ в T206 |
| [T213](tasks/T213.md) | Readiness 200/503 в зависимости от БД | app.ts /health проверяет только процесс; отдельной проверки БД нет |
| [T214](tasks/T214.md) | Контракт API и итоговая приёмка текущего объёма | SERVER_COMPLETION/DATABASE содержат исторические снимки; отдельного актуального API_REFERENCE нет |

Каждый этап укладывается в 5 файлов приложения / 250 строк реализации.
Для изменений кода обязательны полный npm run check и соответствующие gates;
для итоговой документации — check:docs/diff check. Новых зависимостей нет.

## Итоговая приёмка T214

Очередь T211–T214 завершена локально. Существующий функциональный backend
проверен для восьми экранов; T212 сделал regression лимита паролей
детерминированным, T213 добавил SQL readiness, T214 оформил
[контракт API](API_REFERENCE.md). Все 62 явно зарегистрированные пары
метод/путь сопоставлены с таблицами контракта, включая четыре backup-маршрута,
создаваемых циклом. Отдельные DTO определены текущими domain/Records.

Последний полный прогон неизменённого кода T213: npm run check PASS
(1626 unit/API, 91 Browser, 80 E2E; lint/types/coverage/build),
build:api и 12 целевых readiness/runtime-тестов PASS. Дополнительные gates:
38 Python deploy-тестов, verify_build и systemd-analyze verify PASS.
T214 меняет только документацию; check:docs и diff --check проверены отдельно.
Данные тестов синтетические, внешние запросы/письма не нужны.

Подтверждена локальная готовность согласованного MVP, а не новый релиз VPS.
Следующий возможный этап — отдельный выпуск API с проверкой readiness
на установленной версии; в этой очереди он не начинается.

## Границы готовности

В текущий backend не входят AI/распознавание, совместный доступ, биллинг,
устройства/штрихкоды, новые дневники воды/сна/давления: это отдельные продукты
и карточки из IDEAS. Независимый внешний watchdog требует своего места запуска
и границ доступа; работающий локальный монитор T210 не заменяет его.
Дополнительное шифрование/PDF-антивирус/изменение retention требуют ранее
описанных продуктовых и операционных решений, не выбираются молча.

Локальный код и production различаются: T210 внедрён, изменения после него
не считаются установленными без отдельной задачи выпуска. Push, SQL production,
реальные письма и деплой этот запрос на завершение кода не разрешает.
