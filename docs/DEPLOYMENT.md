# Размещение на VPS

Адрес приложения: <https://dev.arturican.com>. Frontend/Nginx находятся на
159.194.208.200; PostgreSQL 18.3 и API — на 2.26.54.81, Ubuntu 24.04.
Серверная версия опубликована в T178a; frontend release:
5551c0f180176938731ade285abcb7ea687983fa.

## Сервер данных

Используется существующий Docker remnawave-db, без замены контейнера/volumes.
Новая БД health принадлежит health_migrator; health_app наследует ограниченную
health_runtime. API не имеет superuser/BYPASSRLS/CREATE и прямой записи в users.
Миграция 011 разрешает регистрацию только через фиксированную SECURITY DEFINER
функцию с закрытым search_path и без PUBLIC EXECUTE. Миграция аддитивна:
прежний backend продолжает работать, runtime-права на таблицу не расширяются.
CONNECT PUBLIC отозван только у новой БД. Прежние базы и сервисы не изменяются.

- PostgreSQL: 127.0.0.1:6767; постоянный volume remnawave-db-data,
  /var/lib/docker/volumes/remnawave-db-data/_data → /var/lib/postgresql.
- API: 127.0.0.1:3101, systemd health-api, отдельный OS user health-api.
- /opt/health-api/releases/<artifact-id> — закрытый от записи приложения релиз;
  /opt/health-api/current — ссылка на текущий. Первый: T177-8936dd25b053.
- /opt/health-node/node-v24.22.0-linux-x64 — официальный Node с проверенным SHA256.
  npm 11.19.1: /opt/health-node/npm-tools/node_modules/npm/bin/npm-cli.js.
- /etc/health-diary/api.env (root 0600) — только runtime URL, origin и порт.
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

## Обновление и проверки

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

    export EXPECTED_RELEASE=5551c0f180176938731ade285abcb7ea687983fa
    export HEALTH_DEMO_CREDENTIALS=/home/artur/.config/health-diary/demo-credentials.json
    npx playwright test --config tests/deployed/playwright.config.ts

Ожидаемый SHA берите из выбранного артефакта доставки, а не из ответа сайта.
Тест читает закрытый JSON с login/password; не передавайте пароль аргументом.
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
