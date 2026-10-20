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
