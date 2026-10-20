# Независимый контроль копий

Решение T252 / AUD-011,20.10.2026, после19c389b.
Проверено readonlySSH с BatchMode/StrictHostKeyChecking; данные дневника,
секреты, расшифрованные архивы и адрес получателя не выводились.

## Что подтверждено

| Место | Работающие компоненты | Копии | Ограничение |
|---|---|---|---|
| Data VPS2.26.54.81 | health-api, health-backup.timer, health-backup-monitor.timer, Postfix; systemd255 |7local ciphertext| Monitor и его SMTP исчезают вместе с хостом |
| Frontend VPS159.194.208.200 | nginx, health-api-tunnel |14offsite ciphertext| Нет независимого монитора/SMTP |
| Provider/account внеVPS | Нет доступного описания/доказательства | Не проверено | Вопрос оператору ожидает ответа |

На frontend нет активных Postfix/Exim/sendmail/msmtp, sendmailbinary и listener
127.0.0.1:25. Это проверенные признаки отсутствия штатного локального mailpath;
они не доказывают отсутствие стороннего мониторинга у провайдера.
Data monitor dryrun: exit0/statushealthy, config0600, recipient задан,
max_age_hours30, SMTPport25. Значение адреса не включено в отчёт.
Последний offsite на момент inventory: health-diary-20261020T130459Z-d965350b.dump.gpg,
129180bytes; это metadata, содержимое не читалось/не расшифровывалось.

## Выбранное устройство

Независимый probe и проверка offsite выполняются на существующем frontendVPS.
Data availability: его фиксированные health/readiness через существующий
loopback tunnel53101. Probe не логинится и не пишет дневник. HTTPS/frontend
можно проверять отдельно; HTTP200 health не означает готовностьSQL.
При падении tunnel результат unhealthy/unknown, а не доказательство паденияБД.
Frontendhostdown остаётся blindspot этого probe; его отдельно покрывает provider
или другой внешний наблюдатель, если такой настроен.

Оператор приложения отвечает за реакцию, как в текущем BACKUPS runbook.
Для уведомлений сохраняется существующий выбранный получатель, но требуется
НЕЗАВИСИМЫЙ путь доставки. Relay через dataVPS не решает datahostoutage.
Выбор: отдельный SMTPнаfrontend либо существующий внешний SMTP/monitor
с явно предоставленным доступом. T252a ожидает этот выбор; никакого сервиса,
DNS/PTR, аккаунта или оплачиваемого SaaS по умолчанию не создано.

Новая предлагаемая policy (не описание уже включённого режима):
availabilityкаждые5min,2последовательных неуспеха/успеха доalert/recovery;
dailyarchivefreshness прежние30h; ciphertextintegrity hourly с boundeddeadline.
State приватный0700/0600, flock/atomicwrite, повтор ошибки дедуплицируется,
SMTPfailure не помечает уведомление доставленным. Payload только фиксированные
технические статусы, без filenames/hash/адресов/дневника. Точные протоколы и
deadline уточняются/тестируются вT253/T254, не объявляются внедрёнными здесь.

## Целостность offsite

Проверка ciphertexthash не требует GPGprivatekey и не доказывает восстановление.
Нужно сравнивать тот же basename с ранее подтверждённым expectedSHA, а не
latestlocal vs latestoffsite, которые могут различаться в процессе передачи.
На снимке T252 прежний backup_receive проверял SHA при приёме без manifest.
T254 добавила сохранение expectedSHA после проверки передачи; установка и
состояние T260 описаны в конце документа. Backfill
существующих копий разрешён только по совпавшему sourcehash для того же имени.
Самоподписанный hash старого offsite — TOFU и не доказывает отсутствие прежней
порчи. Старые архивы без sender/history остаются unattested; нельзя назвать
все14проверенными по результату latest.

При текущем объёме полный проход14архивов практичен; рост до2GiB/file требует
явного cap/deadline/расписания, чтобы не читать бесконтрольно28GiB каждыйчас.
Передача свежего архива допускает boundedpending, не бесконечныйhealthy.
Проверка выполняется read-only дляciphertext, retention7/14 не меняется.
GPGprivatekey остаётся внеVPS. Restore-drill использует только новую synthetic
DB/архив в изолированном окружении, не реальные plaintextкопии черезAI.

## Граница готовности

T252 inventory/decision завершены. T253 может подготовить testedprobe/runbook;
T253a activation и доказательство независимой доставки BLOCKED доT252a.
T254 может независимо подготовить/проверить integrity и syntheticdrill.
T260 не должен объявлять AUD-011 закрытым без доказательства доставки с хоста,
который остаётся доступным при отказе dataVPS. Остальные разрешённые исправления,
проверки и доставка приложения продолжаются по очереди; открытый пункт
мониторинга остаётся явным ограничением выпуска, а не зелёным тестом.

## Подготовленные артефакты T253b

watchdog_monitor.py использует probe T253 и существующие функции безопасного
чтения config/состояния из backup_monitor.py. Перед установкой нужны оба модуля,
а также backup_check.py и backup_receive.py (их импорты), и watchdog_probe.py.
Формат закрытого JSON совпадает с backup-monitor.json: directory,
state_directory, max_age_hours, recipient, smtp_port. Для availability используются
state_directory, recipient и localhost smtp_port; directory/max_age_hours
зарезервированы для отдельной проверки копий. Пример получателя — operator@example.test;
в рабочем config применяется существующий адрес, его не печатают в журнал.

StateDirectory=/var/lib/health-watchdog, каталог 0700, файлы 0600.
Два одинаковых наблюдения подтверждают переход. Начальный healthy не создаёт
письмо; outage и recovery дедуплицируются под flock. SMTP failure оставляет
старое состояние доставки, следующий запуск повторит попытку. Смена получателя
начинает отдельную последовательность наблюдений. Сбой после SMTP acceptance,
но до atomic state write может дать повторное письмо: это выбранный компромисс
в пользу повторной доставки вместо потери оповещения.

health-watchdog.timer запускает oneshot через 2 минуты после boot, затем через
5 минут после предыдущего запуска с jitter до 30 секунд. Порог двух наблюдений
означает задержку обнаружения примерно 5–11 минут, а не немедленный alert.
Probe запускается отдельным дочерним процессом: его deadline 15 секунд,
родитель ждёт не более 17 секунд. Общий CLI deadline 45 секунд не перехватывается
как результат probe: завершение происходит без ложного подтверждения доставки.
Unit разрешает только localhost, ограничивает запись StateDirectory и завершает
процесс за 60 секунд. Технический вывод не содержит email, тела HTTP или данных.
Четырнадцать watchdog unittest и native systemd-analyze verify прошли локально.
Это проверка артефактов: timer, SMTP и независимая доставка ещё не активированы.
Активация и её доказательства — T253a после выбора канала T252a.

## Протокол manifest T254

Обновлённый backup_receive сохраняет рядом с каждым успешно проверенным
ciphertext файл <имя>.sha256: ровно 64 lowercase hex и перевод строки, 0600.
Источник expected SHA — команда доверенного отправителя; сначала проверяются
полный входной поток и существующий target при повторе. Sidecar публикуется
atomic replace под тем же receive lock, затем выполняется fsync каталога.
Ciphertext и sidecar — две публикации, не одна файловая транзакция: при сбое
между ними ciphertext сохраняется, приём не подтверждается, повтор проверяет
target и завершает manifest. Отсутствующий manifest никогда не означает healthy.

Retention дневника по-прежнему 14: при удалении архива удаляется его sidecar.
Cluster-копии и посторонние файлы не удаляются. Manifest не является цифровой
подписью: атакующий с записью в каталог может заменить обе части. Он позволяет
заметить порчу сохранённых bytes относительно SHA, подтверждённого при приёме,
и не заменяет GPG-проверку/восстановление. На момент T254 правила были
проверены локально; receiver и доверенный backfill затем доставлены T260.
Текущий результат — в конце документа.

## Read-only offsite probe T254a

deploy/offsite_check.py принимает --directory и --max-age-hours (штатно 30).
Проверяется весь набор до 14 дневниковых ciphertext, каждый до 2 GiB,
по manifest соответствующего имени. Общий CLI deadline — 60 секунд:
его превышение означает незавершённую проверку, а не доказанную порчу.
Вывод содержит только status, freshness, integrity и агрегатные счётчики.
Посторонние/cluster-файлы не входят в daily inventory.

Freshness и hash независимы: healthy получается только при свежем последнем
архиве и verified для каждого сохраняемого daily архива. Unattested означает
отсутствие доверенного expected SHA; failed — несовпадение/неприемлемый файл.
Orphan manifest и более 14 архивов дают invalid_inventory. Shared nonblocking
receive lock исключает чтение промежуточной публикации; busy не считается
healthy и не запускает обход без блокировки. Программа не создаёт lock или
manifest, не изменяет ciphertext, не расшифровывает и не отправляет email.

Исторический read-only запуск до T260 на frontend VPS 20.10.2026: freshness=fresh,
integrity=unattested, verified=0, unattested=14, failed=0. Это ожидаемый результат
старого receiver без sidecar, а не заключение о повреждении. На VPS не оставлено
новых файлов. Новые передачи получают manifest после выполненной установки T260.
Backfill требует одинакового имени и совпавшего SHA с ещё сохранённым source;
более старые копии остаются unattested. Нельзя разрешить TOFU ради зелёного статуса.
В T260 установлены offsite_check.py, backup_check.py, backup_receive.py и
watchdog_probe.py как readonly CLI/receiver. Независимая доставка — blocked T254c.

Healthy подтверждает все найденные архивы (1–14) и freshness последнего.
Полное исчезновение пары archive+sidecar из прошлого inventory не обнаруживается
без отдельного доверенного исторического ledger. Программа не заявляет, что
сохранились ровно 14 ожидаемых копий. Причины corrupt/invalid_manifest/
invalid_archive различаются внутри check_archive; CLI агрегирует их в failed.

## Восстановление T254b

20.10.2026 выполнено:

    TEST_DATABASE_URL=postgresql://postgres:synthetic-local-only@127.0.0.1:55432/health_test npx --no-install vitest run src/server/backupRestore.test.ts
    python3 -B -m unittest discover -s deploy -p 'test_*.py'

Один synthetic restore test прошёл (около 3.55 s внутри теста), 72 Python
deploy tests прошли. PostgreSQL 18.3 — отдельный контейнер
health-diary-test-db, docker --pull=never; Node 24.22.0. Созданы случайные
source/restore БД и временная GPG-пара. Реальный custom dump зашифрован,
расшифрован и восстановлен одной транзакцией; fingerprints всех 20 таблиц,
файлы, миграции, ACL/RLS и изоляция владельцев совпали. Повреждённый ciphertext
и неверный dump отклонены. Сессии/ссылки в restore отозваны, остальные данные
не изменились; source не изменён. Тест завершил собственные finally cleanup.
Итоговый aggregate inventory показал одну временную БД, не ноль: общий
inventory не доказывает отсутствие всех утечек. До запуска baseline этого
inventory не снимался; неидентифицированная БД не удалялась.

Это доказательство синтетического пути восстановления текущей схемы, включая
миграцию 016. Оно не доказывает расшифровку каждого реального архива или
доставку независимого alert. Private key восстановления не использовался и
не устанавливался на VPS. Повторять drill после существенных изменений схемы
или backup/restore; фактическое восстановление реальных данных выполняется
оператором вне AI по BACKUPS, без вывода plaintext в Git/логи/чат.

Уточнение T254b1: единственная оставшаяся health_test_<UUID> имеет timestamp
каталога PostgreSQL 16.10.2026 10:07 UTC, до drill 20.10.2026. Это согласуется
с прежним остатком, а успешный test подтверждает выполнение собственных DROP.
Общий пустой inventory не подтверждён; этот старый ресурс сохранён.

## Состояние после доставки T260

Receiver с durable SHA sidecar и readonly CLI установлены. Свежая внешняя
копия подтверждена source SHA и manifest0600. Семь сохранившихся source-копий
повторно переданы штатным transfer, без TOFU. На момент приёмки:
fresh, verified7/unattested7/failed0; offsite_check правильно даёт unhealthy,
пока остаётся непроверенная история. Эти7 архивов сохраняются до независимого
доказательства same-name/source-SHA либо естественной ротации14 копий;
не удалять их и не создавать новые копии только ради green.
Availability readonly probe healthy; независимый SMTP/channel и новые timers
не активированы. T252a/T253a/T254c остаются blocked.
Подробные source SHA/gates/rollback — [DEPLOYMENT](DEPLOYMENT.md#приёмка-t260-20102026).
