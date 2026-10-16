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
до 20 минут, пропущенный запуск выполняется после старта. Timer включён после создания health; ручные запуски и внешние SHA проверены. Команды администратора:

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

16.10.2026 фактически восстановлена внешняя копия
health-diary-20261016T010329Z-40a17148.dump.gpg в новую
health_restore_f23b887a67b93d666c171ad6. SHA256 совпал, GPG проверен до
восстановления, pg_restore --single-transaction завершился успешно.
Совпали хеши строк всех 18 таблиц (включая байты файлов), индексы, ограничения
и эффективные ACL. При сравнении учтены только два эквивалентных представления:
скобки ассоциативного AND одного CHECK и неявные права владельца вместо явных.
На 15 личных таблицах проверены чтение владельца, пустой результат чужого/пустого
контекста и отказ записи с чужим владельцем. Runtime не получил CREATE/users INSERT.
Проверочная БД удалена по сохранённому случайному имени; рабочая health не заменялась.
Отчёт: /etc/health-diary/restore-verification.json и локально
/home/artur/.config/health-diary/restore-drill/verification.json.
Это проверка синтетического дневника данного объёма, не универсальная гарантия RTO.
Исходный cluster backup другого приложения не расшифровывался и не восстанавливался.

Роли, их пароли и role-level настройки не входят в отдельный pg_dump health.
На новом кластере создайте их заново, примените настройки журналирования из
[DEPLOYMENT.md](DEPLOYMENT.md), задайте новые закрытые env. Копия дневника
не заменяет резервирование конфигурации сервера или сохранность recovery key.

Основания: [pg_dump](https://www.postgresql.org/docs/18/app-pgdump.html),
[pg_dumpall](https://www.postgresql.org/docs/18/app-pg-dumpall.html),
[GPG key management](https://www.gnupg.org/documentation/manuals/gnupg/OpenPGP-Key-Management.html).
