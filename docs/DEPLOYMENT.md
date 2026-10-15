# Размещение на VPS

Адрес приложения: <https://dev.arturican.com>. Сервер: `159.194.208.200`,
Ubuntu 24.04, существующий Nginx. На VPS передаются только файлы production-сборки.
Node, исходники и база дневника для работы сайта серверу не нужны.

## Данные

Каждый браузер хранит собственный дневник. Данные с localhost автоматически
не переносятся: экспортируйте полную копию в прежнем адресе и восстановите её
через настройки нового сайта. Не присылайте копию в чат и не кладите её на VPS.
Домен и HTTPS входят в адрес хранилища; смена адреса открывает другую базу.
Резервная копия VPS сохраняет код сайта, но не дневники пользователей.

## Сервер

- `/etc/nginx/sites-available/health-diary.conf` — копия [nginx.conf](../deploy/nginx.conf),
  подключённая отдельной ссылкой в `sites-enabled`.
- `/var/www/health/releases/<git-sha>` — неизменяемые версии сборки.
- `/var/www/health/current` и `previous` — текущая и предыдущая версии.
- `/var/www/health/assets` — файлы с хешами в именах, доступные и старым вкладкам.
- `/usr/local/libexec/health-deploy` — root-owned копия
  [install_release.py](../deploy/install_release.py), запускаемая как `health-deploy`.
- Сертификат Let's Encrypt: `/etc/letsencrypt/live/dev.arturican.com/`.
  Продление: существующий `certbot.timer`; deploy hook проверяет и перезагружает
  Nginx после обновления сертификата. HTTP используется для ACME и редиректа HTTPS.

Приложение использует hash-маршруты (`/#weight`), поэтому неизвестные серверные
пути возвращают 404. HTML проверяется на актуальность, assets кешируются на год.
Nginx запрещает встраивание страницы и индексацию поисковиками.
Последнее не является защитой доступа: сам сайт доступен публично.

## Доставка и откат

Перед упаковкой выполните `npm run check` и тесты установщика:

```bash
python3 -B -m unittest discover -s deploy -p 'test_*.py' -v
tar -czf /tmp/health-dist.tar.gz -C dist .
```

Установщик принимает в stdin gzip tar до 20 MiB, максимум 1000 записей и 50 MiB
файлов. Разрешены только `index.html`, `favicon.svg` и файлы `assets/`; ссылки,
переходы за каталог и замена существующего релиза иным содержимым отклоняются.
Новый `current` устанавливается атомарно после проверки и записи всего релиза.
Предыдущие релизы и assets автоматически не удаляются: следите за местом на диске.

Для административного отката на VPS:

```bash
cd /var/www/health
target=$(readlink previous)
test -f "$target/index.html" && test ! -e rollback.next &&
  ln -s "$target" rollback.next && mv -Tf rollback.next current
curl --fail https://dev.arturican.com/release.txt
```

Откат кода не откатывает IndexedDB. Перед версиями с изменением схемы учитывайте
совместимость базы; старый frontend может не поддерживать новую схему.

Проверки после публикации: действительный HTTPS, редирект HTTP, `/release.txt`
с нужным SHA, загрузка JS/CSS, профиль и вес с синтетическими данными после reload.
Браузерные проверки запускаются в отдельном контексте без личной базы.

Автоматизация из `dev` оформляется отдельной задачей T126.

Источники: [Nginx try_files](https://nginx.org/en/docs/http/ngx_http_core_module.html#try_files),
[GitHub Actions secrets](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets).
