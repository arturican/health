# Mermaid: решение о проверке схем

T256, 20.10.2026. До этого Mermaid/parser/CLI в node_modules не обнаружены;
аудит T231 не заявлял успешный parse или render.

## Выбор

Для T256a выбран официальный mermaid **12.2.0**, dev dependency с exact version
и lockfile. npm metadata на дату проверки: engines Node >=22.12.0
(проект 24.22.0), 23 прямые зависимости пакета. Это заметное добавление tooling,
но оно обеспечивает тот же parser, который понимает flowchart, ER и sequence.
Не импортировать пакет из src, он не нужен runtime/frontend bundle.
DOM при необходимости предоставляет уже установленный jsdom30.1.2.
Синтаксис проверяется локально без remote API/CDN и отправки документации.

Официальный [mermaid.parse](https://mermaid.js.org/config/usage#syntax-validation-without-rendering)
проверяет синтаксис без rendering; false/throw означает ошибку, не успех.
T256a проверит API на valid/invalid fixtures и реальных блоках прежде чем
объявлять gate работающим. Exact dependency tree отдельно проверяется npm audit.

## Рассмотренные альтернативы

@mermaid-js/parser **2.0.1** имеет engines >=22.12.0 и одну прямую dependency
@chevrotain/types. Это меньшее дерево, но актуальный npm tarball/exported parse
overloads не содержит flowchart, erDiagram или sequenceDiagram. Проверен именно
tarball2.0.1, не только старое обсуждение unsupported. Поэтому для текущих схем
он не подходит. Metadata/tarball сохранены только в /tmp/health-T256-*.

mermaid-cli не установлен. Он добавляет browser/download lifecycle, который
для syntax gate не нужен: Playwright/browser проекта уже есть. Собственный
regex parser не заменит grammar Mermaid, а внешний render API нарушит
offline/private workflow. Эти варианты не выбраны.

## Граница доказательства

Parse — проверка grammar. Он не доказывает соответствие стрелок реализации,
отсутствие перегруженного layout или правильность данных. Schema review по коду
и локальный render/визуальная проверка фиксируются отдельно. На момент решения
T256 пакет ещё не установлен и успешный Mermaid parse не заявлен.

Источники:
[официальный usage](https://mermaid.js.org/config/usage),
[API parse](https://mermaid.js.org/config/setup/mermaid/interfaces/Mermaid.html#parse),
[официальный parser package](https://github.com/mermaid-js/mermaid/tree/develop/packages/parser).
Точные версии и engines сверены npm view и содержимым официального tarball.

## Проверка T256a

mermaid12.2.0 установлен exact dev-only; исходные прямые версии не изменены.
Сравнение lock packages с предыдущим commit: ни одна версия существующего пути
не изменилась, удалённых путей нет. npm ci успешно воспроизвёл lock; npm audit
20.10.2026 сообщил 0 известных уязвимостей в metadata tree из 632 зависимостей
(включая optional). Это результат registry audit на эту дату, не гарантия безопасности.

Quoted labels потребовали DOMPurify DOM: перед dynamic import Mermaid
создаётся JSDOM из существующего jsdom, без включения scripts/resources.
Одиннадцать node tests (7 links и 4 Mermaid cases), 344 Markdown/1534 локальные
ссылки и все 11 реальных Mermaid-блоков прошли после npm ci. Gate входит в
check:docs, поэтому применяется текущим CI без ослабления проверок.

Отдельный одноразовый browser render: Playwright Chromium, 1360×1000,
mermaid12.2.0 browser dist с локального HTTP 127.0.0.1. Все внешние запросы
блокировались; фактически external requests=0 и page errors=0. Получены и
осмотрены 11 изображений в /tmp/health-T256a-render: подписи/стрелки читаемы,
обрезаний или наложений, мешающих чтению, не обнаружено. Sequence имеют
4 участника, flowcharts идут сверху вниз, ER разбиты на небольшие схемы.
Это локальный renderer этой версии, не проверка рендера GitHub.

Frontend build прошёл: chunk 521.84 kB / gzip149.41 kB, Mermaid не попал
в приложение. Остался прежний warning >500 kB; его оценка — отдельная T258.
Syntax gate не измеряет layout и не гарантирует соответствие схем коду:
это остаётся обязанностью review при изменениях архитектуры.
