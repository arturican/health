# Размещение на VPS

Адрес приложения: <https://dev.arturican.com>. Frontend/Nginx находятся на
159.194.208.200; PostgreSQL 18.3 и API — на 2.26.54.81, Ubuntu 24.04.
Email-регистрация и восстановление опубликованы в T196. Frontend T222 проверен
на 279a3e2ca1747b1d0d8eb0121131024f67bc3cb2; API T222-1be2d33a2817.
Итоговый docs-коммит публикует тот же код через CI; точный frontend SHA
проверяется по release.txt и успешному CI выбранного коммита.

## Сервер данных

Используется существующий Docker remnawave-db, без замены контейнера/volumes.
Новая БД health принадлежит health_migrator; health_app наследует ограниченную
health_runtime. API не имеет superuser/BYPASSRLS/CREATE и прямой записи в users.
Миграции 012–014 добавили email, токены и ограниченные SECURITY DEFINER операции
с закрытым search_path/без PUBLIC EXECUTE. Прямые runtime-права на users/токены
не расширены. Старые аккаунты сохранены; прежний HTTP-маршрут регистрации закрыт.
CONNECT PUBLIC отозван только у новой БД. Прежние базы и сервисы не изменяются.

- PostgreSQL: 127.0.0.1:6767; постоянный volume remnawave-db-data,
  /var/lib/docker/volumes/remnawave-db-data/_data → /var/lib/postgresql.
- API: 127.0.0.1:3101, systemd health-api, отдельный OS user health-api.
- /opt/health-api/releases/<artifact-id> — закрытый от записи приложения релиз;
  /opt/health-api/current — ссылка на текущий. Первый: T177-8936dd25b053.
- /opt/health-node/node-v24.22.0-linux-x64 — официальный Node с проверенным SHA256.
  npm 11.19.1: /opt/health-node/npm-tools/node_modules/npm/bin/npm-cli.js.
- /etc/health-diary/api.env (root 0600, каталог 0700) — runtime URL, origin, порт,
  MAIL_ENABLED=true и MAIL_SMTP_PORT=25; SMTP без пароля только на loopback.
  /etc/health-diary/admin.env (root 0600) — отдельные migration/seed реквизиты,
  не передаются процессу API. Пароли не включаются в исходники/dist/артефакты.
- [health-api.service](../deploy/health-api.service): restart on failure,
  readonly filesystem, private tmp, без core dumps, максимум памяти 1536 MiB.
  Штатная остановка даёт активным запросам до 125 секунд; systemd ждёт 135.

Frontend VPS запускает [health-api-tunnel](../deploy/health-api-tunnel.service)
под health-tunnel. Он соединяет 127.0.0.1:53101 с API через SSH. Ключ привязан
к адресу frontend и единственному PermitOpen, без shell/PTY/remote forwarding.
Host key закреплён в /var/lib/health-tunnel/.ssh/known_hosts; не отключайте
StrictHostKeyChecking при проблемах. [Match-блок](../deploy/health-tunnel.sshd.conf)
добавлен в КОНЕЦ data VPS sshd_config; исходник сохранён в
/etc/health-diary/sshd_config.before-T177. Перед reload всегда sshd -t.

## Nginx и frontend

[nginx.conf](../deploy/nginx.conf) установлен в
/etc/nginx/sites-available/health-diary.conf, подключён sites-enabled.
API идёт через /api/ того же HTTPS origin к loopback-туннелю; публичные порты
БД/API не открываются, отдельный API-домен не нужен. Cookie Secure/HttpOnly,
проверка Origin/CSRF действует на backend. Буферизация request/response
выключена, предел тела 200 MiB, API access/body logging отключён.
Предыдущая конфигурация: /etc/health-diary/nginx.before-T177.conf на frontend VPS.
Перед reload выполняется nginx -t; существующие другие virtual hosts не меняются.

- /var/www/health/releases/<git-sha> — неизменяемые frontend-сборки.
- current/previous — текущая и предыдущая версии; assets — общие хешированные файлы.
- /usr/local/libexec/health-deploy — root-owned [установщик](../deploy/install_release.py),
  запускаемый как health-deploy.
- Let's Encrypt: /etc/letsencrypt/live/dev.arturican.com/, прежний certbot.timer
  и hook проверки/reload Nginx. HTTP — только ACME и редирект на HTTPS.

Hash-маршруты (/#weight); неизвестные серверные пути дают 404.
HTML перепроверяется, assets кешируются на год. Оболочка сайта публична,
личные данные выдаются только после входа. noindex не заменяет авторизацию.

## Граница proxy IP (T200, внедрена T205)

20.10.2026 сверено внедрение T205: конфигурация edge совпадает с deploy/nginx.conf,
API_TRUST_PROXY=true; поддельные forwarded-заголовки заменяются на edge.
По умолчанию API_TRUST_PROXY=false, исходное поведение сохранено.
Для раздельных IP-бюджетов сначала установите Nginx-конфигурацию, заменяющую
X-Forwarded-For и X-Real-IP на $remote_addr и удаляющую Forwarded, выполните
nginx -t и reload только целевого virtual host. Только затем добавьте
API_TRUST_PROXY=true в закрытый api.env и перезапустите API.

Доверяется только hop=0 от 127.0.0.1/::1/IPv4-mapped loopback; более длинная
цепочка не увеличивает доверие. Прямой запрос с другой сети не может задать IP.
Другие локальные процессы входят в доверенную границу: публичный доступ к
loopback API или SSH-туннелю недопустим. Перед добавлением CDN/внешнего proxy
нужна отдельная схема доверия; не включайте real_ip_recursive без её проверки.
При откате сначала выключите API_TRUST_PROXY, затем откатывайте Nginx.
Origin/CSRF и cookie не зависят от forwarded hostname/proto.

Основания: [Fastify trustProxy](https://fastify.dev/docs/latest/Reference/Server/#trustproxy),
[Nginx proxy_set_header](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_set_header).

## Постоянные лимиты (T201, внедрены T205)

До запуска нового API в целевой БД нужна миграция 015_auth_rate_limits.sql.
Используются существующие runtime/migrator-роли и PostgreSQL, дополнительных
сервисов нет. Runtime получает только EXECUTE ограниченной функции; таблица
не входит в пользовательские JSON-копии. В pg_dump она попадает вместе с БД.
Откат API не требует удаления таблицы; не откатывайте миграции вручную и не
очищайте счётчики ради обхода лимитов. Восстановленная старая БД до включения API
должна получить все актуальные миграции. Миграция 015 применена на VPS;
все 15 checksum сверены 20.10.2026.
Runtime EXECUTE разрешён, прямые права на таблицу отсутствуют; лимит
синтетического логина сохранился после перезапуска API и смены IP.

## CSP (T202, внедрена T205)

Nginx-конфигурация содержит Content-Security-Policy с always: скрипты/шрифты
только своего origin, inline-JavaScript/eval, объекты, фреймы и workers запрещены;
base-uri none, form-action self, frame-ancestors none. Локальные blob разрешены
для изображений и чтения их байтов. style-src unsafe-inline нужен существующим
динамическим стилям графиков/размеров; это не разрешение inline-JavaScript.
Внешних отчётов/телеметрии CSP нет. Политика усиливает защиту, но не обезвреживает PDF.

Vite preview читает точную строку из deploy/nginx.conf: весь production E2E
проверяет её, включая фото, документы, копии, графики и вход. Dev/HMR и
Vitest Browser — отдельные инструментированные серверы без этой политики.
Nginx -t и реальный локальный HTTP проверяются отдельно; конфигурация VPS
совпадает с репозиторием; nginx -t и опубликованный HTTPS проверены в T205.
При изменении политики повторите отрицательный CSP E2E
и полный check, не добавляйте unsafe-eval/unsafe-inline в script-src ради тестов.

Основания: [W3C CSP](https://www.w3.org/TR/CSP3/),
[Nginx add_header](https://nginx.org/en/docs/http/ngx_http_headers_module.html#add_header).

Порядок совместного внедрения T200–T203, контроль исходного IP/лимитов/CSP
и безопасный откат подготовлены в [SECURITY_RELEASE](SECURITY_RELEASE.md).
Этот локальный отчёт не подтверждает применение настроек на VPS.

## Обновление и проверки

T222 (20.10.2026): финальный локальный check PASS (1633 unit/API, 91 Browser,
86 E2E, lint/types/coverage/build), build:api, 38 Python deploy, verify_build
и systemd verify PASS. Итоговый review без блокеров. Dev до 1be2d33 отправлен;
CI 39415808015: check/deploy success, HTTPS release.txt точно совпал с SHA.
Новый API /opt/health-api/releases/T222-1be2d33a2817; SHA256 архива
5ddd41392b707591276cca563bccc6d5638e2484cbd56c573cb5c91bf52d69be.
27 файлов сверены до/после npm ci --omit=dev, pinned Node/npm, native imports,
root-owned/readonly права проверены. Все 15 миграций совпадают с прежним релизом;
SQL/роли/секреты/SMTP/retention не менялись. Штатная свежая GPG-копия успешна,
внешний SHA256 сверён независимым SSH; monitor dry-run healthy без письма.
После атомарного переключения health/readiness200, приватные данные401;
no-store/nosniff, отсутствие тестового mailbox, активные сервисы и monitor timer
проверены локально/HTTPS. В журнале API предупреждений за время выпуска нет.
nginx -t PASS; два прежних obsolete http2 warning принадлежат другому virtual host.
Согласованный откат: атомарно вернуть current на
/opt/health-api/releases/T215-2b719b599141 и перезапустить только health-api,
проверить health/readiness/auth. Схему и данные не откатывать.
Первая HTTPS-приёмка нашла старую клиентскую гонку ревизии (4 PASS/2 FAIL).
T223–T226a исправлены и отправлены в dev до 279a3e2; CI 39421683638
check/deploy success, release.txt совпал с полным SHA. Повторная HTTPS-приёмка:
6 PASS desktop/mobile, CRUD/pending/refetch, новый tab, восемь экранов,
приватные байты вложений, auth/400, консоль и внешняя сеть без ошибок.
Все исходные demo записи сохранены; синтетические скриншоты просмотрены.
Сервер/domain/миграции/dependencies после 1be2d33 не менялись: все 27 файлов
новой API-сборки и установленного API повторно совпали с manifest по SHA256,
проверены root-owned/readonly права. API повторно не переключался.
Свежая копия перед повторным выпуском:
health-diary-20261020T121708Z-71a0fb76.dump.gpg, SHA256
5691f85b80330d4193d6a17b8e7dc1c47200fc570e6db8bdb8b0b912a605e173;
независимое чтение на offsite совпало, monitor dry-run healthy без письма.
Итоговый docs-коммит публикует тот же код; его CI/SHA проверяются после push.
Фактический итог и границы проверки — запись T222 в PROGRESS.

T215 (20.10.2026): API выпущен из 2b719b59914136dca1fb8ec95e2317fa0814fca0
в /opt/health-api/releases/T215-2b719b599141. SHA256 архива:
44951b4c36d4264c73e25665c1dad33b5bf31d547e1dd80c72057afa8786805d.
Архив и 27 исходных файлов сверены до/после npm ci --omit=dev;
native/runtime imports и root-owned readonly для приложения права проверены.
Все 15 файлов миграций совпадают с прежним релизом; SQL не применялся.
Перед переключением выполнен штатный GPG backup с успешной внешней передачей.
current переключён атомарно, перезапущен только health-api. Локальный и
публичный health/readiness дают 200, приватные profile/diary-state — 401
без cookie; no-store/nosniff подтверждены. Backup/monitor timers активны.
Совместимый откат: атомарно вернуть current на
/opt/health-api/releases/T205-5af8a91 и перезапустить health-api;
предыдущий релиз сохранён. Миграции и данные при откате не изменять.
Первый CI/deploy T215: GitHub Actions run 39410436182 success,
frontend release.txt совпал с полным SHA 2b719b5. Deployed smoke desktop/mobile:
6 PASS, синтетические данные demo сохранены. Docs-коммит повторно публикует
тот же код; окончательный SHA брать из его успешного CI и release.txt.

T213 локально добавляет GET /api/v1/readiness: 200 {status:'ready'} после
SELECT 1 через runtime pool, 503 {status:'unavailable'} без БД/при ошибке.
Это доступность SQL-подключения; schema/SMTP/внешние копии проверяются своими
gates. /api/v1/health по-прежнему показывает liveness процесса.
Readiness не читает записи дневника и не меняет схему; подключение ограничено
существующим pool timeout 5 секунд, query deadline 1 секунда, повреждённый клиент
уничтожается. Ответы no-store/nosniff, без строк подключения и SQL-ошибок.
В T213 маршрут проверен локально, в T215 установлен на VPS; отказ SQL
проверен локальными тестами без отключения рабочей БД.

С T210 на data VPS установлен дополнительный health-backup-monitor.service/timer:
почасовая проверка свежести копий и результата backup.service, email через
существующий loopback SMTP. Источник файлов a1f47d5, SHA256 совпали; приватный
конфиг /etc/health-diary/backup-monitor.json (root 0600), state
/var/lib/health-backup-monitor (0700, state.json 0600). Service проверен
реальным запуском под sandbox, timer enabled/active. Получение двух тестовых
писем подтвердил пользователь. Отключение/повторное включение расписания
проверено с сохранением state; API и основной backup.timer не менялись.
Порядок установки/отката и ограничения — [BACKUPS](BACKUPS.md), раздел T210.

Исходящая почта приложения подготовлена отдельно: [DNS и SMTP](MAIL_DNS.md).
Postfix/OpenDKIM находятся на VPS БД и слушают только loopback. DNS/PTR и
соответствие DKIM-ключа повторно проверены в T196; приложение подключено к SMTP.
Штатный hostname сервера, порты API/БД
и конфигурация сайта сохранены.

До обновления: полный npm run check, npm run build:api, Python deploy tests,
успешная свежая внешняя копия по [BACKUPS.md](BACKUPS.md).

API artifact содержит build-api, migrations, package.json/package-lock.json,
.npmrc. Env и node_modules в архив не включаются. Проверить SHA256 после
передачи; распаковать в НОВЫЙ каталог releases, установить npm ci --omit=dev
зафиксированным Node/npm. Приложение не должно иметь права записи в релиз.
Из каталога нового релиза администратор запускает:

    /opt/health-node/node-v24.22.0-linux-x64/bin/node --env-file=/etc/health-diary/admin.env build-api/migrate.js

При первом заполнении: тот же Node с admin.env и build-api/seedDemo.js.
Seed повторяемый, не заменяет существующие данные/пароль.
Затем атомарно переключить current и systemctl restart health-api.
Совместимость новых миграций со старым кодом нужно оценить до обновления.

Frontend: npm run build; python3 -B deploy/verify_build.py dist; tar из dist.
Установщик принимает deploy <полный Git SHA> и gzip tar через stdin (до 20 MiB,
1000 файлов/50 MiB распакованных данных). Только index.html, favicon.svg,
assets; нет symlink/path traversal/перезаписи релиза иным содержимым.
Roboto-LICENSE.txt находится внутри assets. current переключается атомарно;
предыдущие релизы и assets не удаляются автоматически, следите за диском.

Диагностика (на соответствующем VPS):

    systemctl status health-api health-backup.timer
    systemctl status health-api-tunnel nginx
    journalctl -u health-api --since today
    curl --fail https://dev.arturican.com/api/v1/health
    curl -o /dev/null -w '%{http_code}' https://dev.arturican.com/api/v1/profile

Последняя команда без cookie должна вернуть 401. Не добавляйте секреты в curl
командную строку, журнал или сообщения. Входные данные demo находятся в закрытом
локальном /home/artur/.config/health-diary/demo-credentials.json, серверная копия
/etc/health-diary/demo-credentials.json. Не делайте аккаунт общедоступным.

Для отката frontend смените current на проверенный previous атомарной ссылкой;
релизы не удаляйте. Откат frontend НЕ откатывает PostgreSQL; версии до T175f
использовали отдельную IndexedDB. Для backend откатывается current к совместимому
релизу и перезапускается health-api. Не откатывайте схему уничтожающими командами.
Восстановление копии сначала выполняется в новой БД по BACKUPS.md.

## GitHub Actions

[check.yml](../.github/workflows/check.yml) проверяет проект и доставляет только dist
в dev по ограниченному health-deploy ключу. Backend, SSH, Nginx и systemd
обновляются отдельно администратором. Этот переход выполнен прямой доставкой
проверенного артефакта, без push/PR/merge.

Окружение health-dev: HEALTH_DEPLOY_KEY и HEALTH_KNOWN_HOSTS — secrets,
HEALTH_DEPLOY_HOST — variable; доступ ограничен dev. Ключ разрешает только
deploy <SHA>, без shell/forwarding/sudo. CI сверяет HTTPS/release.txt после
публикации; автоматического отката при ошибке проверки нет. Не запускайте
устаревший workflow поверх актуальной серверной версии без намерения отката.

Источники: [Nginx buffering](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_request_buffering),
[OpenSSH Match/PermitOpen](https://man.openbsd.org/sshd_config).

## Проверка опубликованного дневника

В отдельном контексте Desktop/Pixel 7, с вымышленным health-demo:

    export EXPECTED_RELEASE=$(git rev-parse HEAD)
    export HEALTH_DEMO_CREDENTIALS=/home/artur/.config/health-diary/demo-credentials.json
    npx playwright test --config tests/deployed/playwright.config.ts

Запускайте из checkout выбранного опубликованного коммита. Ожидаемый SHA берите
из выбранного артефакта доставки/локального Git, а не из ответа сайта.
Тест читает закрытый JSON с login/password; не передавайте пароль аргументом.
Формы регистрации/reset проверяются без отправки настоящих писем; тестовые
mailbox/clock маршруты должны возвращать 404. Полный email-путь через SMTP
проверяется локальными E2E на синтетическом сервере, реальный ящик не заявляется.
Trace/video/автоматические screenshots отключены, снимок после входа содержит
только синтетический дневник. Артефакты — tests/deployed/test-results (вне Git).
Тест добавляет измерение 02.01.2020 только если даты нет и удаляет только
созданный ID; существующий демонстрационный журнал должен быть неизменен.
Запускайте только на указанной демонстрации, не на реальных личных данных.

За один прогон выполняются два входа. Ограничение 5 входов на логин за 15 минут
учитывает и успешные входы; выдерживайте интервал между повторными сериями.
Автоматического обхода/сброса лимита в тестах нет.

## Журналирование ролей PostgreSQL

Для health_app и health_migrator администратор задаёт параметры ниже.
Они применены на VPS и проверены через новое настоящее runtime-соединение.
Глобальные настройки других приложений сохранены. Выполняйте после создания
ролей, также при восстановлении на новом кластере; затем перезапустите только API,
чтобы его pool переподключился.

    DO $$
    DECLARE account text;
    BEGIN
      FOREACH account IN ARRAY ARRAY['health_app','health_migrator'] LOOP
        EXECUTE format('ALTER ROLE %I SET log_statement = none', account);
        EXECUTE format('ALTER ROLE %I SET log_min_messages = fatal', account);
        EXECUTE format('ALTER ROLE %I SET log_min_error_statement = panic', account);
        EXECUTE format('ALTER ROLE %I SET log_error_verbosity = terse', account);
        EXECUTE format('ALTER ROLE %I SET log_parameter_max_length = 0', account);
        EXECUTE format('ALTER ROLE %I SET log_parameter_max_length_on_error = 0', account);
        EXECUTE format('ALTER ROLE %I SET log_min_duration_statement = -1', account);
        EXECUTE format('ALTER ROLE %I SET log_min_duration_sample = -1', account);
      END LOOP;
    END $$;

Это исключает обычные SQL-ошибки и их подробности из server log, уменьшая
диагностическую информацию. Подробное исследование выполняйте на изолированных
синтетических данных; не включайте body/query/parameter logging в production.
Системные fatal/panic сообщения не считаются конфиденциальным хранилищем.
Основания: [PostgreSQL logging](https://www.postgresql.org/docs/18/runtime-config-logging.html),
[ALTER ROLE](https://www.postgresql.org/docs/18/sql-alterrole.html).
