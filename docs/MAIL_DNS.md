# Почта приложения — DNS и активация

Postfix/OpenDKIM установлены на VPS БД 2.26.54.81, отправитель:
no-reply@auth.arturican.com. SMTP доступен только локальным процессам на этом VPS:
127.0.0.1:25. Почтовые ящики, IMAP и приём писем из интернета не создаются.
В T187 публичные A/SPF/DKIM/DMARC/PTR проверены, соответствие ключа подтверждено.
Внешняя отправка включена: defer_transports пуст. Очередь при включении пуста;
TLS с проверкой сертификата/hostname и ограничения loopback сохранены.
Установлены Postfix 3.8.6-1ubuntu0.1 и OpenDKIM 2.11.0~beta2-9build4
из репозиториев Ubuntu 24.04; другие пакеты не обновлялись.

Файлы deploy/mail-postfix.cf задают параметры main.cf через postconf,
mail-senders установлен как /etc/postfix/health-senders,
mail-opendkim.conf — /etc/opendkim.conf. mail-privacy.conf установлен
как health-privacy.conf в drop-in каталогах postfix@-.service и opendkim.service.
Явный PidFile согласован с systemd и штатным tmpfiles.d OpenDKIM.

## Где добавить записи

Пользователь указал кабинет домена в Play2go. Откройте карточку arturican.com
в личном кабинете и найдите редактор DNS-зоны (название вкладки может отличаться).
Без входа кабинет показывает авторизацию, поэтому точные кнопки не проверены.
Авторитетные NS на момент установки: ns1.mitelis.cc и ns2.mitelis.cc.
Если кабинет позволяет менять только NS, запросите у поддержки доступ к редактору
зоны этих NS. Для этой настройки менять серверы NS не требуется.

Создайте записи ниже в зоне arturican.com. Имена в таблице относительные:
панель обычно сама дописывает .arturican.com. Если она требует полное имя,
добавьте этот суффикс один раз. TTL: 300 секунд или минимальный доступный.
Существующие записи сайта и другие SPF не заменять; все новые имена выделены
для почты приложения. На каждом имени должна быть только одна SPF-запись.

| Тип | Имя | Значение |
|---|---|---|
| A | mail | 2.26.54.81 |
| A | auth | 2.26.54.81 |
| TXT | mail | v=spf1 ip4:2.26.54.81 -all |
| TXT | auth | v=spf1 ip4:2.26.54.81 -all |
| TXT | _dmarc.auth | v=DMARC1; p=reject; adkim=s; aspf=s |
| TXT | health2026._domainkey.auth | Полное значение ниже |

Значение DKIM вставляется целиком в одну TXT-запись, без внешних кавычек.
Это публичный ключ; приватный находится только на VPS.

```text
v=DKIM1; h=sha256; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAvxigrDu6xEvXob7Yp2kLVrVeKP3o+T1MBbrtllNQO+RIstvuVy4Zm0weTro7QQj6sJcJufvr9Mg0lLFP+sGv6t1u6DwqwaUPEJ1mY3yPvl1jM1DCKFqLfgbZZl+Xx5D64hMbyVnf6UnRncBnuMEc7HHTVUs+lPpIqxofC3Qa1vuzXWUGzxCnAYPelEmxGrepdJKCNVfXUJG3/2OpufNzMaoYeH7GfxivYUR+ODV5/CXEn0UKhxwaXB3bRX7u/4UYfEKUu5Meq+YGRLCwr0xJJ47uFEDcVmscGgowXvYcizy1H5KEednGRJpFvTVOKfqeQFf92I95wLc87St07IRhewIDAQAB
```

## PTR у хостера VPS

PTR настраивается в карточке VPS или его IP, а не в обычной зоне домена.
Для IP 2.26.54.81 установите обратное имя mail.arturican.com.
Сначала должна существовать A-запись mail.arturican.com → 2.26.54.81.
Если в панели нет поля PTR/rDNS, отправьте поддержке хостера:

> Прошу установить PTR/rDNS для моего VPS 2.26.54.81 в mail.arturican.com.
> Прямая A-запись mail.arturican.com указывает на 2.26.54.81.
> Сервер используется для исходящих служебных писем приложения.

## Проверка и включение

После обновления DNS администратор проверяет публичные записи и соответствие
DKIM приватному ключу. Исходник проверки: [check_mail.py](../deploy/check_mail.py).
До активации локальный режим проверяет синтетическое письмо и удаляет только
его queue id, не отправляя письмо наружу. Этот режим требует временной задержки
defer_transports = smtp и не запускается на активном транспорте.
Режим --dns можно повторять после активации; он не меняет конфигурацию:

```bash
python3 /usr/local/libexec/health-mail-check.py --dns
```

При новой установке сначала держите defer_transports = smtp и выполните
локальную проверку без --dns. Когда --dns проходит, проверьте пустую очередь
командой postqueue -p, затем снимите задержку и перечитайте конфигурацию.
На текущем VPS это уже выполнено в T187:

```bash
postconf -e 'defer_transports ='
postfix reload
```

Пароль/подтверждение почты ещё не подключены к SMTP в приложении. Установка
почтовой службы не означает реализацию кнопки восстановления. До подключения
проверяются и лимитируются письма; адреса и токены не попадают в журналы API.
Postfix/OpenDKIM фильтруют строки журнала с адресами через LogFilterPatterns.
Доставка во входящие не гарантируется одной установкой MTA: получатели проверяют
DNS, подпись и репутацию IP. Реальная доставка в пользовательский ящик пока
не проверялась; без синтетического/согласованного тестового ящика она не заявляется.

Приватный ключ: /etc/opendkim/keys/auth.arturican.com/health2026.private,
opendkim:opendkim, 0600; в Git и локально в WSL его нет. Резервирование БД
этот файл не включает; при утрате ключа потребуется новая пара и замена DKIM TXT.

Основания: [Ubuntu Postfix](https://ubuntu.com/server/docs/how-to/mail-services/install-postfix/),
[Postfix параметры](https://www.postfix.org/postconf.5.html),
[Gmail sender guidelines](https://support.google.com/mail/answer/81126?hl=en).
