# Версии и совместимость T001

Проверено 14 октября 2026 года по официальной документации и метаданным npm
из registry.npmjs.org. Выбраны стабильные версии, без beta/rc/canary; Vitest
использует стабильную ветку 4 из-за конфликта типов ветки 5 с jest-dom.

| Инструмент | Версия | Основание совместимости |
|---|---|---|
| Node LTS | 24.22.0 | Официальный список релизов; зафиксирован в .nvmrc |
| npm | 11.19.1 | Поставляется с выбранным Node; packageManager и engines |
| React / React DOM | 19.3.1 | React DOM требует React ^19.3.1 |
| Vite | 8.3.4 | Node ^20.19.0 или >=22.12.0 |
| @vitejs/plugin-react | 6.1.2 | Vite ^8.0.0; дополнительные компиляторы optional |
| TypeScript | 6.0.3 | Совместим с typescript-eslint 8.71.2 (>=4.8.4 <6.1) |
| Vitest | 4.1.11 | Vite ^6 / ^7 / ^8; Node ^20 / ^22 / >=24 |
| Testing Library React / DOM | 16.3.3 / 10.4.2 | React и его типы ^18 или ^19; DOM ^10 |
| jest-dom | 7.0.1 | Node >=22; доступен экспорт ./vitest |
| jsdom | 30.1.2 | Node ^22.22.2 / ^24.15.0 / >=26 |
| Playwright | 1.64.1 | Node >=20 |
| @types/react / react-dom | 19.3.0 / 19.3.0 | Типы для выбранной ветки React |
| @types/node | 24.19.2 | Типы ветки Node 24 |

Все прямые версии точные, транзитивные закреплены в lock-файле. `engine-strict`
помогает обнаружить несовместимое окружение до запуска. Отсутствие конфликта
метаданных подтверждается установкой и фактическими проверками; метаданные сами
по себе не гарантируют корректность приложения.

При первичной проверке Vitest 5.0.4 и jest-dom 7.0.1 дали TS2428: различные
значения по умолчанию параметра `Assertion<T>`. Выбрана совместимая стабильная
ветка Vitest 4.1.11; проверки библиотечных деклараций и strict не отключаются.

## Источники

- [Релизы Node](https://nodejs.org/dist/index.json) и
  [SHA-256 Node 24.22.0](https://nodejs.org/dist/v24.22.0/SHASUMS256.txt).
- [Начало работы с Vite](https://vite.dev/guide/).
- [Начало работы с Vitest](https://vitest.dev/guide/).
- [React changelog](https://github.com/facebook/react/blob/main/CHANGELOG.md).
- [Testing Library React](https://testing-library.com/docs/react-testing-library/intro/).
- [Playwright](https://playwright.dev/docs/intro).
- [Метаданные npm](https://docs.npmjs.com/cli/v11/commands/npm-view): проверены
  `dist-tags`, `engines`, `peerDependencies` и `peerDependenciesMeta`
  для конкретных версий таблицы.

## T002: lint

ESLint/@eslint/js 9.39.5, typescript-eslint 8.71.2, react-hooks 7.1.1,
jsx-a11y 6.10.2 и globals 17.13.0. Проверены npm peerDependencies. Ветка ESLint 9
выбрана для jsx-a11y, TypeScript 6.0.3 — для parser; строгие проверки сохранены.
