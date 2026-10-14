# Дневник здоровья

Учебное приложение для личных записей о самочувствии, весе, питании и активности.
Будущий MVP хранит данные локально в браузере. Синхронизация, совместный доступ,
сервер и медицинские рекомендации не входят в текущую очередь.

## Состояние

T000 восстановила документацию и правила тестирования. T001 добавила минимальную
оболочку React + TypeScript + Vite: русский стартовый экран с адаптивной вёрсткой
и рабочими переходами с клавиатуры. Запись и хранение данных появятся позже.
Актуальные статусы находятся в [TASKS.md](TASKS.md), результаты — в
[PROGRESS.md](docs/PROGRESS.md).

## Запуск

Используй Node 24.22.0 из `.nvmrc`, npm 11.19.1 и закоммиченный `package-lock.json`.
Если используешь nvm, установи закреплённую версию один раз через `nvm install`.

```bash
nvm use
npm ci
npm run dev
```

Открой адрес из вывода Vite. Для production-проверки: `npm run build`, затем
`npm run preview`. На первом этапе это стартовый экран без хранения данных.

## Проверки

```bash
npx playwright install chromium
npm run check
```

`check` проверяет Markdown-ссылки, типы, компонентные тесты, сборку и браузерные
сценарии. Команды по отдельности и требования к окружению описаны в
[TESTING.md](docs/TESTING.md). В управляемом окружении с системным Chromium можно
запустить `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run check`.
Данные для ручной проверки также должны быть синтетическими.

## Документы

- [AGENTS.md](AGENTS.md) — ограничения и правила работы с Git.
- [WORKFLOW.md](docs/WORKFLOW.md) — выбор задачи и Definition of Done.
- [CODING_STANDARDS.md](docs/CODING_STANDARDS.md) — структура и правила кода.
- [TESTING.md](docs/TESTING.md) и [TEST_CASES.md](docs/TEST_CASES.md) — проверки и сценарии.
- [PRIVACY_SECURITY.md](docs/PRIVACY_SECURITY.md) — данные и ограничения приватности.
- [CALCULATIONS.md](docs/CALCULATIONS.md) — требования к будущим вычислениям.
- [DEPENDENCIES.md](docs/DEPENDENCIES.md) — версии и проверенные источники совместимости.
- [START_ONE_TASK.md](START_ONE_TASK.md) — повторяемый запрос для одной задачи.
- [IDEAS.md](IDEAS.md) — несогласованные возможности за пределами MVP.

## Проверки в браузере

`npm run test:browser` — интерактивный Vitest Browser UI.
`npm run build`, затем `npm run test:e2e:ui` — Playwright с просмотром кликов.
Для автоматического прогона без графического окна: `npm run check`.
