# Резервные копии PostgreSQL

Отправитель [backup_send.py](../deploy/backup_send.py) установлен на 2.26.54.81
в /usr/local/libexec. Закрытая конфигурация /etc/health-diary/backup.json
соответствует [примеру](../deploy/backup.example.json); SSH key и known_hosts
лежат рядом. Никакие пароли БД не нужны: root использует локальный Docker exec
и административное соединение внутри существующего remnawave-db.

Поток pg_dump -Fc шифруется GPG до записи на диск. Только ciphertext попадает
в /var/backups/health-diary и через отдельный ограниченный SSH key — в
/var/backups/health-diary/offsite на 159.194.208.200. Приёмник принимает только
заранее определённое имя и SHA256, не предоставляет shell/forwarding.
Секретного ключа GPG на VPS нет; публичный keyring — /var/lib/health-backup/gnupg.

Сохраняются 7 последних локальных и 14 внешних копий приложения (число копий,
не дней); исходные снимки health-cluster не удаляются. Удаление дневника не
удаляет прежние архивы немедленно. Перед передачей нового сервера другому
владельцу отдельно согласуйте судьбу архивов и recovery key.

## Управление

[Service](../deploy/health-backup.service) и [timer](../deploy/health-backup.timer)
устанавливаются на сервер БД. Расписание: ежедневно 03:30 UTC, случайная задержка
до 20 минут, пропущенный запуск выполняется после старта. Timer включается только
после создания базы health. Команды администратора:

    systemctl enable --now health-backup.timer
    systemctl start health-backup.service
    systemctl status health-backup.service health-backup.timer
    systemctl list-timers health-backup.timer
    journalctl -u health-backup.service --since yesterday
    python3 -B /usr/local/libexec/backup_send.py --retry ИМЯ_ГОТОВОЙ_КОПИИ

Неуспех приводит к failed service; автоматических внешних уведомлений нет.
Проверяйте журнал и свежесть копий на ОБОИХ VPS. Сбой сети не удаляет локальную
копию и не запускает retention. Лимит файла 2 GiB, резерв места 512 MiB,
общий тайм-аут 20 минут. По мере роста базы пересмотрите эти пределы.
Не публикуйте архивы и не выводите расшифрованный SQL в журнал/чат.

## Ключ восстановления

Локально в WSL: /home/artur/.config/health-diary/recovery-gnupg (0700),
переносимый recovery-secret.asc (0600) рядом. Он создан без парольной фразы,
поэтому конфиденциальность зависит от прав и безопасности устройства.
Сохраните этот файл в защищённом офлайн-хранилище: потеря ключа делает копии
непригодными. Не копируйте приватный ключ на VPS и не коммитьте его.
recovery-public.asc и recovery-fingerprint можно использовать при переустановке
отправителя; сверяйте fingerprint, не получайте ключ с произвольного keyserver.

## Восстановление

Сначала скачайте зашифрованную копию по доверенному SSH, сравните SHA256
с сервером, проверьте расшифровку в /dev/null. Секретный ключ остаётся локально:

    gpg --homedir ~/.config/health-diary/recovery-gnupg --batch --decrypt COPY.dump.gpg > /dev/null

Восстанавливайте сначала в НОВУЮ изолированную БД, созданную администратором,
с существующими ролями из [database-roles.sql](../deploy/database-roles.sql).
Создайте её с владельцем health_migrator, запретите CONNECT PUBLIC, не направляйте
на неё API. Передавайте расшифрованный поток напрямую в Docker pg_restore:

    set -o pipefail
    gpg --homedir ~/.config/health-diary/recovery-gnupg --batch --decrypt COPY.dump.gpg |
      ssh -o StrictHostKeyChecking=yes root@2.26.54.81 \
      'docker exec -i remnawave-db pg_restore -U postgres --exit-on-error --single-transaction --dbname=health_restore_UNIQUE'

Не используйте --clean против рабочей БД. Проверьте число записей, хеши файлов,
связи, миграции и RLS; только затем планируйте отдельное переключение API.
Сессии и хеши паролей тоже входят в копию: после аварийного восстановления
отзовите восстановленные сессии. Старый архив может возвращать удалённые записи.

Исходный health-cluster содержит pg_dumpall существовавшего кластера, сжатый gzip,
и предназначен только для административного аварийного восстановления.
Его нельзя автоматически применять поверх действующих БД. Он не заменяет
резервирование Docker-конфигурации и серверных настроек.

В T176b подтверждены создание, повторная доставка и независимое совпадение
SHA256 исходного архива на двух VPS; данные другого приложения не расшифровывались.
GPG roundtrip проверен локально на синтетических байтах. Проверка восстановления
самой базы health выполняется отдельно в T178.

Основания: [pg_dump](https://www.postgresql.org/docs/18/app-pgdump.html),
[pg_dumpall](https://www.postgresql.org/docs/18/app-pg-dumpall.html),
[GPG key management](https://www.gnupg.org/documentation/manuals/gnupg/OpenPGP-Key-Management.html).
