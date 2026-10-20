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
Текущий backup_receive проверяет SHA при приёме, но не хранит manifest.
T254 должен сохранять expectedSHA после проверки новой передачи; backfill
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
