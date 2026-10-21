# Независимая почта второго VPS — T262

Состояние на 21.10.2026 (Europe/Moscow): SMTP установлен на frontend
159.194.208.200, но **внешняя отправка отложена: отсутствует PTR**.
Прямые DNS подтверждены в T262a. В T262b пользователь передал отказ провайдера
в выдаче PTR по внутренним условиям о размещённом «живом» сайте. Следующий шаг —
повторное рассмотрение фактического приложения либо отдельный выбор независимого
SMTP relay. После работающего транспорта нужны проверка получения и активация.
Новые watchdog/offsite timers не включены. Data SMTP на 2.26.54.81 продолжает
работать без изменения ключа или конфигурации приложения. Общий AUD-011 открыт.

## Что установлено и проверено

Postfix 3.8.6-1ubuntu0.1, OpenDKIM/opendkim-tools 2.11.0~beta2-9build4
из Ubuntu24.04. Симуляция и фактическая установка: 16 новых пакетов, без общего
upgrade. Пакетный autostart запрещался временным policy-rc.d, удалённым после
установки. Новые mail services сейчас active, но disabled на boot и с
`defer_transports=smtp`. Системный hostname не менялся.

Внешний SMTP идёт непосредственно к MX получателя; relayhost, transport_maps,
sender-dependent relay/transport и fallback пусты, default_transport=smtp.
Data VPS не участвует в этом маршруте. Новый DKIM selector —
healthmonitor2026. RSA2048 private key существует только на frontend:
`/etc/opendkim/keys/auth.arturican.com/healthmonitor2026.private`,
opendkim:opendkim0600; родительские каталоги0750. Его нельзя копировать в Git,
WSL, AI или передавать в поддержку. Копии БД этот ключ не содержат; при утрате
нужна новая пара и замена соответствующего TXT.

Проверено на native VPS:
- Postfix check, OpenDKIM config, rsyslog -N1 и systemd-analyze verify;
- только127.0.0.1:25/8891, разрешён прежний From, forged sender отвергается;
- mandatory verified outbound TLS, milter failure=tempfail;
- deferred reserved .invalid fixture: реальная RSA-подпись/body hash верны,
  удалён только собственный queue id, итоговая очередь пуста;
- journald LogFilterPatterns и раннее rsyslog правило скрывают адреса;
  синтетический положительный контроль без адреса записан в syslog/mail.log,
  mail-строка с адресом отсутствует в обоих sinks;
- прежний recipient перенесён приватным потоком в
  `/etc/health-diary/mail-monitor.json`, root0600, каталог0700;
- исходящий TCP25/EHLO/STARTTLS с проверкой сертификата до двух публичных MX,
  без DATA и без сообщения реальному получателю.

Первая проверка rsyslog **не прошла**: отсутствовал mail.log и syslog-user
не мог создать его в /var/log. Созданы только отсутствующие mail.log/mail.err,
syslog:adm0640, штатные правила не переписаны. Повторная проверка прошла.
Это не тест доставки в почтовый ящик. Реальных писем с frontend ещё не было.

## DNS-записи и их состояние

Доступа к кабинету домена/провайдера в текущем окружении нет. Публичный DoH
подтвердил новые A/HELO SPF/DKIM и shared auth SPF после ответа пользователя
«Записи внесены» (T262a). Только PTR остаётся NXDOMAIN. Прямые TCP DNS
к ns1.beget.com и ns2.beget.com дали authoritative=true/rcode3/PTR=[];
Google/Cloudflare подтвердили отсутствие записи, negative TTL300.
WSL UDP DNS timeout не принят за NXDOMAIN. Зона arturican.com
на ns1.mitelis.cc/ns2.mitelis.cc; смена NS не нужна. Имена ниже относительные,
TTL300 или минимальный доступный.

Все четыре записи таблицы опубликованы и проверены; она сохранена как
справочник для сопровождения. Повторно добавлять их не требуется.

| Действие при первичной настройке | Тип | Имя в зоне arturican.com | Значение |
|---|---|---|---|
| Добавить | A | mail-monitor | 159.194.208.200 |
| Добавить | TXT | mail-monitor | v=spf1 ip4:159.194.208.200 -all |
| **Заменить существующий единственный SPF** | TXT | auth | v=spf1 ip4:2.26.54.81 ip4:159.194.208.200 -all |
| Добавить | TXT | healthmonitor2026._domainkey.auth | Полное публичное значение ниже |

На auth должна остаться **одна** TXT-запись, начинающаяся v=spf1;
прочие TXT на этом имени не удалять. Старый IP сохранён. Существующие mail/auth A,
mail SPF, health2026 DKIM, _dmarc.auth и записи сайта менять не требуется.
Не создавать второй SPF рядом со старым. DKIM вставляется целиком одной TXT;
панель/сервер могут разбить строку на quoted segments одной записи.

```text
v=DKIM1; h=sha256; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAu4WyKHLpnUitO+BOlfVE8zJroUZK5/jXUKyFgFiKyuwpdc8pYWgR7TzIg0hwcYooMJj+2KrRN08R7SYF+JXSD7PobppiUqxEZk9nugSKNBr3eJ7sv2frAL+FflLg8k68zelc2TcqZEzoNQJw79CF9CGEnsPKoufRlVOVCNo1K99uwTYI1Q4q+xZm5jguekX5m+7i1Sm7vmL7mFZbxn2IUSu/1Gzm4Pv2xDKnq0me2aGgxHHH+vstMQf4b7SQ6g2+oL4fw8lDsey1zn6xDOR7AOFaJdrdxPaEIy1yg+V9FF72aWKRGaccecsQyj5Qlsm9EdlX8XdUIK89SW+z0C4OWwIDAQAB
```

После создания A задайте PTR **IP159.194.208.200** у VPS-провайдера:
mail-monitor.arturican.com. Обратная запись не задаётся в прямой зоне домена.
На момент T262a PTR не задан в авторитативной обратной зоне.
По [официальной инструкции Beget](https://beget.com/ru/kb/how-to/vps/mailu-pochtovyj-server-sozdanie-i-nastrojka)
PTR настраивается через тикет: [панель](https://cp.beget.com/) → «Помощь и поддержка».
Если VPS приобретён через другого провайдера, обратиться в его поддержку.
Делегация обратной зоны на Beget не подтверждает, в каком кабинете оплачен VPS.
Готовый текст для поддержки:

> Прошу установить PTR/rDNS для моего VPS 159.194.208.200 в
> mail-monitor.arturican.com. Прямая A-запись указывает на 159.194.208.200.
> Сервер используется для исходящих служебных оповещений приложения.
> PTR 2.26.54.81/mail.arturican.com изменять не требуется.

## Отказ провайдера и дальнейший порядок — T262b

21.10.2026 пользователь передал ответ поддержки: сейчас PTR не выпускают без
размещённого на аккаунте поддерживаемого и посещаемого сайта; статичный сайт
или редирект не подходят. Это источник текущего внешнего блокера. Условия
переданы пользователем, их публичный полный текст/исключения и состояние аккаунта
не проверены. Наличие PTR не обеспечивается одним выполненным запросом поддержки.

Репозиторий подтверждает: [App](../src/App.tsx) — React SPA с восемью экранами;
[runtime](../src/server/runtime.ts) регистрирует authenticated API и
[readiness](../src/server/readiness.ts) проверяет доступность БД.
[Nginx](../deploy/nginx.conf) раздаёт HTML/JS/CSS на frontend159.194.208.200
и проксирует /api/ через туннель к Fastify/PostgreSQL на2.26.54.81.
Публичные health/readiness/release и отказ закрытому diary без auth проверены;
реальные записи/посещаемость не читались. Исходники и availability не доказывают
регулярные визиты пользователей или принятие проекта по внутреннему регламенту.

Рекомендуется отправить поддержке фактическое уточнение. Это **черновик**:
агент не отправлял тикет и не раскрывал учётные данные/дневник.

> Здравствуйте. Прошу повторно рассмотреть запрос PTR для 159.194.208.200.
> На этом VPS размещён проект https://dev.arturican.com — личный дневник.
> Он работает как веб-приложение с авторизацией, серверным API и хранением
> в PostgreSQL. На указанном VPS находятся React-клиент, HTTPS и API-прокси;
> сам API и база данных размещены на отдельном сервере. Основные разделы
> доступны после входа, поскольку содержат личные записи.
> Подскажите, подходит ли такое размещение под ваши условия и какие сведения
> о проекте нужны для повторного рассмотрения. PTR mail-monitor.arturican.com
> нужен для служебных оповещений одному администратору о доступности API
> и состоянии резервных копий. Прямая A-запись уже указывает на этот IP.

Принятие такого проекта провайдером не гарантировано. Ссылка на публичную
[инструкцию PTR](https://beget.com/ru/kb/how-to/vps/mailu-pochtovyj-server-sozdanie-i-nastrojka)
показывает порядок обращения, но не отменяет полученный отказ.

Если отказ сохранится, следующий технический вариант — authenticated SMTP
submission к существующему независимому mail provider вне data VPS.
Такой механизм предусмотрен [Postfix SMTP client SASL](https://www.postfix.org/SASL_README.html).
В этой схеме доставка на MX выполняется инфраструктурой relay; нужен его
разрешённый sender, настройка домена, проверяемый TLS и закрытые credentials.
Такой сервис/аккаунт не выбраны, условия тарифа и доступность не проверены.
Новая интеграция требует отдельной карточки и выбора пользователя, а секреты
передаются через закрытую конфигурацию, не через чат/Git. Текущий standalone
DNS gate к relay неприменим: до переключения нужен отдельный проверенный gate
для нового транспорта, без ослабления privacy/sender/TLS требований.
Data VPS как единственный relay исчезнет вместе с наблюдаемым хостом;
для независимых outage alerts такой маршрут не подходит.

До решения frontend SMTP остаётся deferred, timers не включаются.
T262/T253a/T254c и AUD-011 остаются открытыми. Установленные key/config/DNS
сохраняются; эта docs-only задача ничего на VPS не меняет.

## Проверка и активация прямого SMTP после выдачи PTR

1. На frontend выполнить `python3 /usr/local/libexec/health-mail-check.py --host monitor --dns`.
   До всех A/SPF/DKIM/DMARC/PTR и matching private key gate должен завершаться
   ошибкой. Сейчас DNS pending только для PTR — ожидаемый блокер, не PASS.
2. Выполнено в T262a: data helper [check_mail.py](../deploy/check_mail.py)
   обновлён из текущего source, root0600 mail-dns.json содержит
   `"sender_ips":["2.26.54.81","159.194.208.200"]`. Прежние
   host/ip/sender/dkim_name/dkim_value сохранены; data --dns PASS.
   MTA configs SHA256 прежние, services active без restart.
   Before копии — /root/health-T262/before на data; повторная установка не нужна.
   Безопасная read-only проверка: `python3 /usr/local/libexec/health-mail-check.py --dns`.
   По умолчанию это data profile; selector/private key data не менять.
3. На frontend повторить deferred local gate:
   `python3 /usr/local/libexec/health-mail-check.py --host monitor`.
   Он не использует локальные API/БД data. Команду без --dns не запускать после
   включения доставки: она требует defer_transports=smtp.
4. Проверить пустую очередь через закрытый root-процесс без публикации адресов.
   Только после PASS обоих DNS gates:
   `postconf -e 'defer_transports ='`, `postfix reload` и
   `systemctl enable postfix opendkim`. Не выполнять postqueue -f массово.
5. Отправить одно согласованное synthetic operational сообщение прежнему
   recipient из закрытого конфига, без health data/вложений/ссылок/токенов.
   Не печатать recipient, postqueue/postcat или сырые SMTP errors. Зафиксировать
   отдельно local SMTP acceptance, queue pending/absent и подтверждение
   получателя по уникальному несекретному маркеру. Исчезнувший queue id не
   доказывает remote250/inbox (возможен bounce/expiry). Postfix status=sent
   содержит адрес и намеренно отфильтрован; ради proof фильтры не ослаблять.
6. После receipt продолжить [T253a](tasks/T253a.md) и [T254c](tasks/T254c.md):
   isolated alert/recovery без остановки рабочего API/БД, затем timers.
   Одно настроенное MTA не закрывает независимые watchdog/offsite alerts.

## Установленные файлы и откат

[mail-postfix.cf](../deploy/mail-postfix.cf) применяется через postconf -e,
затем [mail-monitor-postfix.cf](../deploy/mail-monitor-postfix.cf): это override,
не замена всего main.cf. [mail-opendkim.conf](../deploy/mail-opendkim.conf)
с заменой только Selector/KeyFile из
[mail-monitor-opendkim.conf](../deploy/mail-monitor-opendkim.conf).
[mail-senders](../deploy/mail-senders) → /etc/postfix/health-senders.
[mail-privacy.conf](../deploy/mail-privacy.conf) → privacy.conf drop-ins
postfix@-.service/opendkim.service;
[mail-monitor-rsyslog.conf](../deploy/mail-monitor-rsyslog.conf) →
/etc/rsyslog.d/00-health-mail-privacy.conf **до** file/forward rules.
Native rsyslog validation и synthetic positive/negative контроль обязательны
при переносе; journald gate не проверяет rsyslog sinks.

На этом хосте штатные mail.log/mail.err нужно предварительно создать
syslog:adm0640 только при отсутствии: syslog-user не может создавать файлы
в /var/log. Существующие журналы не обнулять. Rsyslog перезапущен после native
validation; nginx/API/tunnel/DB не перезапускались этой задачей.

`/root/health-T262` root0700 содержит исходную package/service inventory,
apt simulation/install/config validation logs, defaults и исходники установки.
Полные логи вне Git. Временный policy-rc.d удалён, packages удерживают точные
версии текущей установки, автоматическое pin/hold не вводилось.
Перед каждым продолжением проверить remote state заново, не повторять
неидемпотентный initial install поверх готового хоста.

Для отказа от новой доставки сначала отложить SMTP и остановить/отключить
только новые postfix/opendkim и будущие monitor timers. Сохранить queue/state/key;
не удалять все сообщения и архивы. Удалить только добавленные drop-ins/00-rule
после сохранения, восстановить точные defaults из before, validate/restart rsyslog.
Не удалять зависимости общим autoremove. Data SMTP/API и backups не менять.
Если shared SPF уже опубликован, удаление frontend IP делать только после
остановки его отправки; data IP/старые DKIM/PTR сохраняются.

## Что остаётся неизвестным

Репутация нового IP и фактическое получение письма не проверены. Кабинет
провайдера/DNS не подключён; наличие внешнего provider monitoring неизвестно.
Проверка доступных services не является просмотром кабинета. Два VPS не дают
внешнего наблюдения при отказе самого frontend. После SMTP остаются отдельные
приёмки watchdog/offsite alerts и актуальной offsite integrity. Установка MTA
не доказывает доступность копий или возможность восстановления.

Связано: [почта приложения](MAIL_DNS.md), [контроль копий](BACKUP_CONTROL.md),
[карточка T262](tasks/T262.md).
