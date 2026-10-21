# Разработка на нескольких компьютерах

Код и зашифрованные development-настройки хранятся в Git. Существующий
development age key и SOPS находятся на VPS; расшифровка выполняется через
ограниченный SSH helper. На новом компьютере **не нужны SOPS, age или age key**.
Приложение и отдельная синтетическая БД разработки запускаются локально.
Production api.env/admin.env, реальные данные и recovery GPG key не используются.

## Первый запуск на новом компьютере

Поддерживается Ubuntu 24.04 x86_64, включая WSL2 на Windows. Клон храните в
Linux home, не /mnt/c. Нужны Node 24.22.0/npm 11.19.1 (закреплены в репозитории),
Git/OpenSSH, GPG и работающий Docker Engine (`docker info` без sudo).
Установка [nvm](https://github.com/nvm-sh/nvm#installing-and-updating)
и [Docker](https://docs.docker.com/engine/install/ubuntu/) — по официальным
инструкциям. На Windows можно использовать Docker Desktop WSL integration.

Один раз разрешите SSH public key нового компьютера по следующему разделу.
После этого:

```bash
git clone --branch chore/portable-development git@github.com:arturican/health.git
cd health
source ~/.nvm/nvm.sh
nvm install
nvm use
npm run setup
```

Setup сам устанавливает зависимости по lockfile при необходимости, получает
секреты по SSH, скачивает отсутствующий postgres:18.3, создаёт отдельный
контейнер/постоянный том, роли и health/health_test, применяет миграции и seed.
Повтор сохраняет данные, пароли и уже установленные зависимости.
Существующий .env сохраняется; если ciphertext обновился в Git, setup выполняет
refresh только для неизменённого локального .env. Ошибка SSH не портит настройки.

Запуск API: `npm run local:api`. Во втором терминале из проекта после `nvm use`:
`npm run local:ui`. UI http://127.0.0.1:5173, readiness http://127.0.0.1:3001/api/v1/readiness.
Логин local-demo; пароль DEV_DEMO_PASSWORD просматривайте только в доверенном
локальном редакторе .env, не печатайте в чат/логи. SMTP выключен.

Опциональные настройки компьютера — [.env.local.example](../.env.local.example).
Создайте .env.local из шаблона только если его ещё нет; задайте свободные порты
и своё DEV_CONTAINER для параллельного клона. По умолчанию DB 55433/API 3001/UI
5173, контейнер health-dev-local, том health-dev-local-data. Обновление общих
секретов никогда не меняет .env.local. Чужие контейнеры/тома отвергаются.

## Как перенести ключ расшифровки

В обычном варианте age key переносить не требуется: он остаётся на VPS.
Нужен лишь разрешённый SSH-ключ компьютера. Используйте существующий ключ;
если его нет, создайте его обычным ssh-keygen, не перезаписывая прежние файлы.
Передайте **только .pub файл** на компьютер с существующим operator SSH-доступом
и выполните там из проекта:

```bash
npm run secrets:grant -- /путь/к/новому-компьютеру.pub
```

Эта команда добавляет public key только для development secrets. Она не выдаёт
root/shell/forwarding доступ и не меняет production-доступы. На новом компьютере
после разрешения достаточно npm run setup. GitHub-доступ для clone настраивается
обычным способом отдельно. Приватные SSH-ключи никуда не отправляйте.
Если identity не выбирается стандартным SSH/agent, задайте только путь:
`export HEALTH_SECRETS_IDENTITY="$HOME/.ssh/имя_ключа"`. Это настройка компьютера,
не поле общего .env. Неверный host key вызывает отказ; не отключайте проверку.

Сервис: health-dev-secrets@159.194.208.200, public host key закреплён в
[known_hosts](../config/development-secrets.known_hosts). Helper разрешает только
development encrypt/decrypt; ключ /var/lib/health-dev-secrets/private/keys.txt
имеет права 600, private каталог 700. Установка [installer](../deploy/install_development_secrets.py)
выполняется оператором из закрытого staging bundle (sops, keys.txt, recipient.txt,
client.pub и оба development_secrets Python-файла); существующий иной ключ не заменяется.
Это отдельное development-хранилище; production env и GPG recovery key туда не копируются.

На исходном компьютере сохранён прежний ~/.config/sops/age/keys.txt для резервного
local режима. Отдельная защищённая offline-копия ключа **не создана**. Сохраните
её в защищённом хранилище вне Git для восстановления самого VPS; не в чат/email.
Local fallback с установленными SOPS 3.13.3/age 1.3.2 и ключом: задайте
`export HEALTH_SECRETS_BACKEND=local`, затем используйте те же secrets:* команды.
Новый набор secrets:init создаёт только оператор в local режиме; при существующем
ciphertext новый key не генерируется. Проверка fallback: npm run test:secrets:local.

## Как переключаться между компьютерами

Перед сменой компьютера сохраните работу, выполните проверки, сделайте commits
с явными путями и `git push`. На другом до редактирования:

```bash
git status --short --branch
git fetch origin
git pull --ff-only
nvm use
npm run setup
```

Setup сам обновит зависимости/неизменённые secrets/миграции. Если локальный .env
изменён и версия Git обновилась, будет отказ: сначала объедините значения.
.env.local и данные локальной БД остаются на своём компьютере.
.secrets-state.json хранит только hashes, не коммитится. Если отметки нет,
существующий .env не перезаписывается; различия разрешаются явно.
Рабочая ветка — chore/portable-development: feature push не запускает текущий CI.
Push dev запускает frontend deploy; для обычной синхронизации используйте свою
feature-ветку. PR/merge/dispatch и production deploy здесь не выполняются.

## Как обновлять секреты

Сначала fetch/pull своей ветки и npm run setup. Отредактируйте четыре DEV_*_PASSWORD
из [.env.example](../.env.example) в приватном локальном редакторе. Допустимы
A-Z/a-z/0-9/_/-, минимум 15 символов; машинные параметры и production секреты
не добавляйте. Затем:

```bash
npm run secrets:encrypt
git diff --check
git add -- secrets/development.enc.env
git commit -m 'chore(dev): Txxx update development secrets'
git push
```

Используйте реальную карточку Txxx по AGENTS. Шифрование происходит на VPS,
Git хранит только ciphertext. Команда сама fetch-ит origin и отказывает при
новых upstream secret commits или изменившейся локальной версии ciphertext.
Для ручного обновления неизменённого .env доступна secrets:refresh; dirty файл
она сохраняет. Ключи/пароли не передаются в argv или сообщения ошибок.

Изменение .env не меняет пароль уже существующей БД/аккаунта. Для осознанной
ротации роли используйте интерактивный `docker exec -it health-dev-local psql -U postgres`
и `\password имя_роли` на каждом компьютере. DEV_DEMO_PASSWORD для существующего
local-demo сохраняйте: setup не сбрасывает пароль, прямой UI-смены пароля нет.
Новый пароль аккаунта требует отдельной явной процедуры либо нового стенда
с другим именем/портом и переносом дневника полной UI-копией.

При конфликте Git не объединяет ciphertext построчно. Сохраните обе версии
в закрытый временный каталог и расшифруйте через тот же SSH helper:

```bash
umask 077
conflict_tmp=$(mktemp -d)
git show :2:secrets/development.enc.env > "$conflict_tmp/ours.enc.env"
git show :3:secrets/development.enc.env > "$conflict_tmp/theirs.enc.env"
ssh -T -o BatchMode=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=config/development-secrets.known_hosts health-dev-secrets@159.194.208.200 decrypt-development < "$conflict_tmp/ours.enc.env" > "$conflict_tmp/ours.env"
ssh -T -o BatchMode=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=config/development-secrets.known_hosts health-dev-secrets@159.194.208.200 decrypt-development < "$conflict_tmp/theirs.enc.env" > "$conflict_tmp/theirs.env"
```

При custom identity добавьте ssh -i с её путём. Приватным редактором объедините
значения в .env, предварительно сохранив закрытую копию. Выберите целый ours/theirs
ciphertext и завершите уже согласованное Git-действие с ним. После включения
upstream в HEAD выполните secrets:reconcile и отдельный commit объединённого
ciphertext; до этого upstream guard откажет. Merge/rebase не запускайте только
ради инструкции. Временные plaintext-файлы удалите после разрешения.

## Как восстановить локальные данные

Для разработки достаточно Git, инструментов и SSH-доступа: setup создаёт
синтетический дневник. Настоящие данные не нужны и в Git не включаются.
PostgreSQL хранит и записи, и вложения; секреты/код их не переносят. Том сохраняется
при остановке контейнера; setup запускает его снова. Рабочий том не удаляйте.

Если нужен прежний дневник, сохраните полную копию в UI и перенесите её через
защищённое хранилище вне Git. На новом компьютере сохраните копию текущего
дневника, затем используйте предпросмотр/явное подтверждение восстановления.
Текстовая копия не содержит вложений. PostgreSQL backup/restore и account state —
[BACKUPS](BACKUPS.md), отдельная целевая БД и явное разрешение; recovery GPG key
отличается от development age key. Production автоматически не читается.

## Проверки

`npm run test:local` проверяет SSH failures, сохранность env, stale guards,
ошибочный backend и setup без повторной установки. Для полного check установите
браузер: `npx playwright install --with-deps chromium`, затем `npm run local:check`.
Если sudo нет и отсутствуют libnspr4/libnss3/libasound, Ubuntu 24.04 допускает:

```bash
browser_deps=$(mktemp -d)
(cd "$browser_deps" && apt-get download libnspr4 libnss3 libasound2t64)
for archive in "$browser_deps"/*.deb; do dpkg-deb -x "$archive" "$browser_deps/root"; done
export LD_LIBRARY_PATH="$browser_deps/root/usr/lib/x86_64-linux-gnu${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
npx playwright install chromium
npm run local:check
```

Для проверки чистого clone --no-local создайте новый .env.local с тремя свободными
портами >=20000 и DEV_CONTAINER=health-dev-smoke-уникальное-имя (латиница).
Не копируйте .env/node_modules/age key: предоставьте только SSH identity и выполните
setup, test:local, test:local:smoke, local:check, build:api. Smoke проверяет все
20 таблиц, отсутствие повторного npm ci, readiness/UI/login; E2E занимают также
4173/4181. Подробности [TESTING](TESTING.md). Чистый клон на текущем ПК не означает
проверку второго физического устройства.
