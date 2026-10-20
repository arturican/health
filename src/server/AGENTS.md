# API и серверные данные

Общие правила — [корневой AGENTS](../../AGENTS.md).
Контракт — [API_REFERENCE](../../docs/API_REFERENCE.md).

- runtime/config/main отвечают за сборку приложения и lifecycle;
  Routes — HTTP, Records — данные. Валидация — domain и inputValue:
  внешний ввод unknown, безопасный 400, без деталей SQL/секретов в ответах.
- Приватные маршруты проверяют сессию; изменяющие запросы — Origin/CSRF согласно
  контракту. Файлы авторизуются до тела.
  Владельца берёт сервер из сессии. Транзакции через withUser/RLS,
  изменения дневника — через withCommand с generation/revision/idempotency.
- Не смешивай runtime и migrator-роли. Миграции неизменяемы после применения;
  изменение схемы — новый файл и отдельная задача совместимости/отката.
- Копии и вложения: лимиты/тип/связи проверяются до записи; ошибка откатывает
  всю операцию. Нельзя добавлять production test-mode/mailbox/clock маршруты.
- Auth budgets — PostgreSQL authRateLimit; новые Map-лимитеры не заменяют его.
  Хеши паролей/токены/строки подключения не логируются.
- Regression API — Fastify inject + выделенная PostgreSQL из testDatabase/testApi;
  test env не подменяется production URL. Для lifecycle — собранный runtime.
  Проверки: связанные unit/SQL, build:api; итоговый полный check перед push.
