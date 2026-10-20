# Холодная загрузка: измерение T258

20.10.2026, исходный HEAD7d6b155; незакоммичены только benchmark и документы.
Приложение/dist не менялись при сравнении. Это локальный эксперимент,
а не production p95 и не заданный продуктом норматив времени.

## Окружение и повтор

Node24.22.0/npm11.19.1, PostgreSQL18.3 в изолированном health_test,
Playwright1.64.1/Chromium156.0.8078.4. Новый context на точку, один browser process,
cache disabled и clearBrowserCache до goto. Viewport1360×900, DPR1; CPU throttling4x,
minimum request latency150ms, aggregated download200000B/s (1.6Mbps),
upload93750B/s (750kbps). Это параметры эмуляции, не характеристики телефона.

Собранный dist обслуживает tests/performance/server.mjs на loopback4173,
настоящий Fastify тестов — loopback4181, UUID SQL fixtures из e2e/setup.ts.
API clock14.10.2026, пустой собственный аккаунт; browser date20.10.2026.
Фото/документы разрешены synthetic settings. Реальных данных/внешних операций нет.
Ни backend, ни frontend production в этом benchmark не используются.

    source ~/.nvm/nvm.sh
    nvm use
    npm run build
    export TEST_DATABASE_URL=postgresql://postgres:synthetic-local-only@127.0.0.1:55432/health_test
    HEALTH_BENCH_ENCODING=identity npx --no-install playwright test --config tests/performance/playwright.config.ts
    HEALTH_BENCH_ENCODING=gzip npx --no-install playwright test --config tests/performance/playwright.config.ts

Системные browser/SQL prerequisites — [TESTING](TESTING.md). В текущем WSL
дополнительно применялся уже установленный LD_LIBRARY_PATH из browser-deps cache.
Тесты/performance не входят в обычный CI/E2E; это ручной измерительный запуск
без latency thresholds. Валидность метрик, работоспособность UI, отсутствие
pageerror/requestfailed/HTTP>=400/alert проверяются. Артефакты — /tmp вне Git.

## Что именно измерено

FCP (First Contentful Paint) — первое видимое содержимое; это может быть
Auth/loading shell, а не полностью готовый дневник. readyMs — момент, когда
Playwright увидел enabled checkbox «За этот день внесена вся еда». Это
наблюдение одного полезного действия, не все возможные состояния интерфейса.
lastApiMs — responseEnd последнего начального API запроса.

Bytes — encodedBodySize трёх assets (JS/CSS/локальный TTF), без HTML/API/headers/TLS.
Resource transferSize отдельно содержит browser estimate headers; он не равен
всем bytes сети. ScriptDuration — CDP runtime metric за initial interval до
networkidle, включая инструментирование. Trace V8 compile/parse durations —
inclusive, nested/parallel events нельзя суммировать как CPU приложения.
Особенно background parsing/waiting охватывает streaming/network wait.

Identity передаёт assets без сжатия. Gzip использует level5 только для публичных
JS/CSS/SVG/TTF с Accept-Encoding:gzip, API остаётся identity. CSP взята из Nginx.
Это model Node HTTP/1, без production TLS/HTTP2/server costs, с no-store вместо
production immutable cache. CPU4x и свежий context не означают cold OS/process.

## Все пять точек финального запуска

| Режим / run | Assets bytes | FCP ms | readyMs | lastApiMs | ScriptDuration ms |
|---|---:|---:|---:|---:|---:|
| identity / 1 | 1045464 | 3492.0 | 5614.3 | 5500.0 | 339.1 |
| identity / 2 | 1045464 | 3464.0 | 5585.1 | 5471.1 | 338.8 |
| identity / 3 | 1045464 | 3476.0 | 5597.9 | 5497.1 | 333.3 |
| identity / 4 | 1045464 | 3496.0 | 5616.2 | 5508.6 | 352.9 |
| identity / 5 | 1045464 | 3468.0 | 5552.7 | 5450.2 | 322.3 |
| gzip / 1 | 440551 | 1520.0 | 3629.0 | 3526.3 | 376.5 |
| gzip / 2 | 440551 | 1544.0 | 3661.3 | 3546.2 | 390.1 |
| gzip / 3 | 440551 | 1448.0 | 3589.6 | 3460.3 | 315.1 |
| gzip / 4 | 440551 | 1500.0 | 3636.2 | 3509.0 | 365.1 |
| gzip / 5 | 440551 | 1492.0 | 3628.4 | 3505.1 | 350.1 |

| Median | FCP ms | readyMs | ScriptDuration ms | V8.CompileCode ms | V8.ParseProgram ms | Documents observed ms | Settings observed ms |
|---|---:|---:|---:|---:|---:|---:|---:|
| identity | 3476.0 | 5597.9 | 338.8 | 178.5 | 94.1 | 1491.9 | 969.3 |
| gzip | 1500.0 | 3629.0 | 365.1 | 181.0 | 99.6 | 1482.8 | 956.9 |

Переходы измерены после начального посещения Today до heading+окончания loading;
проверка networkidle/ошибок идёт после timestamp и не прибавляет 500ms к метрике.

| Публичный asset | Identity body bytes | Gzip body bytes |
|---|---:|---:|
| /assets/index-xtnK7BnB.js | 521845 | 149360 |
| /assets/index-CIyl1pgz.css | 35035 | 7348 |
| /assets/Roboto-B3covOPw.ttf | 488584 | 283843 |

Assets суммарно 1045464→440551 bytes (−57.9%). Median FCP3476→1500ms,
observed ready5597.9→3629ms. CPU/compile не показали улучшения: эффект —
передача данных, а не ускорение JavaScript. Переходы практически не изменились.
Пять точек не дают доверительного интервала или production percentile.

Пилоты: page.clock подменял Performance и давал пустые entries/FCP; такие
измерения отброшены, фиксация Date удалена, добавлены assertions валидности.
В следующем трёхточечном пилоте был gzip outlier FCP2392/ready4502.9ms и
ScriptDuration1258.2ms; причину host/runtime variance не установили. Поэтому
финальный запуск расширен до пяти точек с guards сетевых ошибок. Выброс не
выдаётся за дефект приложения и не скрывается ради оценки.

## Вывод и следующий шаг

Read-only live проверка20.10.2026: JS текущего release792e0b0 передан identity,
513682bytes при Accept-Encoding:gzip. nginx -T подтвердил global gzip on, но
gzip_types для JS/CSS/TTF не настроены. Build gzip estimate не был live transfer.
Это новое уточнение AUD-016 к AUD-015, а не доказательство live latency из
локального эксперимента.

Конкретный первый шаг — T258a: сжимать только публичные assets в Nginx,
явно gzip off для API, сохранить CSP/cache/маршрутизацию и проверить negotiated
encoding+декодированные bytes на native Nginx. Изменения пока не внедрены.
T259 остаётся решением по необходимости lazy routes после этого малого шага:
один warning размера не оправдывает новые chunk/error/old-tab пути.

Источники смысла CDP параметров:
[Network](https://chromedevtools.github.io/devtools-protocol/tot/Network/),
[Performance](https://chromedevtools.github.io/devtools-protocol/tot/Performance/).
Сами числа получены из текущего приложения и synthetic run, не из документации.

## Решение T259

Lazy loading сейчас не добавляется. Подтверждённый эффект — public static gzip
(T258a); код приложения/граф загрузки не изменены. После сжатия runtime JS
составляет около149kB, ScriptDuration/переходы не дали отдельной причины для
refactor. У приложения не найден обязательный SLA cold load. Это решение
о достаточности имеющегося обоснования, а не доказательство, что lazy не поможет:
сравнения с lazy-вариантом не было.

IMP-028 остаётся условным предложением. Вернуться при измеренной проблеме
конкретного маршрута/профиля после live-проверки сжатия. Тогда сначала сравнить
варианты тем же benchmark, затем покрыть все8routes, keyboard/fallback/retry,
chunk failure и старую вкладку после release. Warning threshold не менялся.
T259 done означает документированное решение, не внедрение lazy loading.
