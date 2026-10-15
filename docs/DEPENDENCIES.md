# Версии и совместимость T001

## Хеширование, T162

argon2 0.45.1, Node >=16.17; npm metadata и Linux prebuilt проверены
на Node 24.22.0. Argon2id использует 19 MiB, t=2, p=1 и случайную соль.
Источники: [node-argon2](https://github.com/ranisalt/node-argon2),
[OWASP Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).
Это серверная зависимость, в frontend она не импортируется.

## Серверный PostgreSQL, T160

15 октября 2026 проверены npm metadata: pg 8.23.1 (Node >=16),
@types/pg 8.23.1. Версии закреплены точно, установка на Node 24.22.0 /
npm 11.19.1 прошла; npm audit сообщил 0 известных уязвимостей.
Настоящие SQL-тесты используют PostgreSQL 18.3, совпадающий с обследованным VPS.
Драйвер не требует ORM; транзакции используют одно соединение.
Источники: [pg](https://www.npmjs.com/package/pg),
[node-postgres transactions](https://node-postgres.com/features/transactions).

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

## T008–T011: локальные данные

Dexie 4.4.6, fake-indexeddb 6.2.5, Zod 4.6.7. dexie-react-hooks 1.1.7
поддерживает React >=16 и Dexie ^3.2 || ^4.0.1-alpha. Его декларации проходят
полную проверку типов с выбранным стеком. Ветка hooks 4 экспортирует декларации
неустановленных y-dexie/yjs; для локального приложения выбран совместимый 1.1.7,
без добавления ненужных зависимостей синхронизации и без отключения проверки типов.

## T018: GitHub Actions

Официальные refs/tags/v6 проверены через git ls-remote 14 октября 2026:
actions/checkout d23441a48e516b6c34aea4fa41551a30e30af803,
actions/setup-node 249970729cb0ef3589644e2896645e5dc5ba9c38,
actions/upload-artifact b7c566a772e6b6bfb58ed0dc250532a479d7789f.
Workflow использует SHA вместо изменяемого тега.

## T130: серверный API factory

Fastify 5.12.7 — точная стабильная версия из официального registry.npmjs.org,
проверенная 15 октября 2026 года через npm view (version, engines,
peerDependencies, dist.integrity, repository). Метаданные этой версии не содержат
отдельных engines/peerDependencies; npm repository указывает fastify/fastify.
[Официальная LTS-политика](https://github.com/fastify/fastify/blob/v5.12.7/docs/Reference/LTS.md)
предусматривает поддерживаемые Node LTS; совместимость конкретного Node 24.22.0
проверяется установкой, строгими типами и HTTP-тестами. Native addons не нужны.
Транзитивные версии закреплены lock-файлом. Пакет нужен для изолированного
backend factory, frontend не импортирует его. Новые PostgreSQL/auth-пакеты
будут проверяться в соответствующих задачах.

## T171a: серверное декодирование изображений

sharp 0.35.5 закреплён точно; npm view подтвердил engines Node >=20.9.0.
Node 24.22.0 поддерживается, prebuilt Linux-библиотеки установились локально.
Нужен для реального декодирования JPEG/PNG/WebP перед записью байтов в БД.
Клиент его не импортирует. Используются failOn=warning и существующий предел
64 млн пикселей; отключения safety limits нет.
[Установка](https://sharp.pixelplumbing.com/install/),
[параметры декодера](https://sharp.pixelplumbing.com/api-constructor/).
