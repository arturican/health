# Разработка на нескольких компьютерах

Поддержано: Ubuntu 24.04 x86_64, включая WSL2 на Windows. Команды выполняются
в Bash внутри Linux, клон — в Linux home, не на /mnt/c. Native Windows/macOS/ARM
не проверены. React/TypeScript/Vite → Fastify → PostgreSQL, npm по lockfile.
Node 24.22.0 и npm 11.19.1 закреплены в .nvmrc/package.json/.npmrc.

## Первый запуск на новом компьютере

Нужны Git/SSH-доступ к существующему GitHub, nvm (или ровно указанные Node/npm),
curl, GPG, Docker Engine с доступом текущего пользователя к daemon.
На Windows включите WSL2 Ubuntu 24.04 и Docker WSL integration либо Docker
Engine внутри WSL. `docker info` должен работать без sudo. Системные инструменты
Ubuntu: `sudo apt-get update`, затем `sudo apt-get install git curl ca-certificates gnupg`.
Установка [nvm](https://github.com/nvm-sh/nvm#installing-and-updating) и
[Docker Engine](https://docs.docker.com/engine/install/ubuntu/) — по официальным
инструкциям; существующие установки не заменяйте.

SOPS 3.13.3 и age 1.3.2 нужны для запрошенного хранения секретов; новых npm
зависимостей/Compose нет. Если CLI ещё не установлены, эти команды устанавливают
официальные Linux amd64 binaries в пользовательский каталог (SHA256 проверяется):

```bash
(
set -eu
tools_tmp=$(mktemp -d)
curl -fLsS https://github.com/getsops/sops/releases/download/v3.13.3/sops-v3.13.3.linux.amd64 -o "$tools_tmp/sops"
printf '%s  %s\n' e5bec3346a873ae91d871550f3e698c1aad962aff462a080e40f25fde17fef6b "$tools_tmp/sops" | sha256sum -c -
curl -fLsS https://github.com/FiloSottile/age/releases/download/v1.3.2/age-v1.3.2-linux-amd64.tar.gz -o "$tools_tmp/age.tar.gz"
printf '%s  %s\n' cbe24006683f8eb669266162894b9a522a1af52f2665fbc63a4bb032ed26ac10 "$tools_tmp/age.tar.gz" | sha256sum -c -
tar -xzf "$tools_tmp/age.tar.gz" -C "$tools_tmp"
mkdir -p ~/.local/bin
install -m 755 "$tools_tmp/sops" "$tools_tmp/age/age" "$tools_tmp/age/age-keygen" ~/.local/bin/
)
export PATH="$PATH:$HOME/.local/bin"
```

При любой ошибке проверки остановитесь до install. Источники и digest:
[SOPS release](https://github.com/getsops/sops/releases/tag/v3.13.3),
[age release](https://github.com/FiloSottile/age/releases/tag/v1.3.2).
Перенесите ключ по следующему разделу, затем:

```bash
git clone --branch chore/portable-development git@github.com:arturican/health.git
cd health
source ~/.nvm/nvm.sh
nvm install
nvm use
npm ci
npm run secrets:restore
docker pull postgres:18.3
npm run local:doctor
npm run local:setup
npx playwright install --with-deps chromium
npm run local:check
npm run local:api
# Второй терминал в том же каталоге: source ~/.nvm/nvm.sh; nvm use
npm run local:ui
```

UI: http://127.0.0.1:5173; API readiness: http://127.0.0.1:3001/api/v1/readiness.
Логин local-demo, пароль — DEV_DEMO_PASSWORD в приватном .env (просматривайте
в доверенном локальном редакторе, не печатайте в чат/логи). SMTP выключен.
Setup повторяем: не удаляет/пересоздаёт БД, не меняет существующие пароли,
применяет новые миграции и не меняет уже заполненный синтетический дневник.
API rebuild выполняется при запуске; для reload перезапустите local:api.

Все настройки разработки перечислены в [.env.example](../.env.example) и
[.env.local.example](../.env.local.example). Четыре обязательных DEV_*_PASSWORD
получаются из SOPS: PostgreSQL admin (только setup/tests), runtime health_app,
schema owner health_migrator и синтетический аккаунт. Новые значения генерируются
один раз secrets:init. Имена DATABASE_URL/MIGRATION_DATABASE_URL/TEST_DATABASE_URL,
ADMIN_LOGIN/PASSWORD/TIMEZONE, NODE_ENV, API_HOST/PORT, APP_ORIGIN, MAIL_ENABLED,
API_TRUST_PROXY и HEALTH_API_PROXY вычисляются local:* в памяти; API получает
только ограниченный URL, мигратор/seed — отдельные права. VITE_* секретов нет.
Прямые серверные команды README требуют отдельного полного env; они не читают
DEV_* как URL. VPS api.env/admin.env и доступы SSH/recovery не входят в разработку.

Параметры компьютера необязательны. Чтобы сменить порты/имя контейнера, до setup
создайте .env.local из шаблона, если этого файла ещё нет, и отредактируйте его.
Не перезаписывайте существующий .env.local. По умолчанию БД 55433, API 3001,
UI 5173, контейнер health-dev-local, постоянный том health-dev-local-data.
Для параллельного клона нужны другие три порта и DEV_CONTAINER. Обновление
секретов никогда не меняет .env.local. Чужой контейнер/том/привязка порта
отклоняется; ошибку исправляйте конфигом, не удалением данных.

## Как перенести ключ расшифровки

На исходном компьютере ключ: ~/.config/sops/age/keys.txt (600), каталог 700.
Он создан один раз и переиспользуется. Резервная копия в этой работе **не создана**.
Сохраните файл в зашифрованном хранилище паролей с вложениями или на защищённом
офлайн-носителе. Не отправляйте его в Git, чат, email или VPS. Проверьте, что
сохранён именно приватный файл, а не только public recipient из .sops.yaml.

На втором компьютере восстановите файл из защищённой копии, затем:

```bash
install -d -m 700 ~/.config/sops/age
install -m 600 /путь/к/защищённой-копии/keys.txt ~/.config/sops/age/keys.txt
npm run secrets:restore
```

Перед install убедитесь, что целевой keys.txt отсутствует; существующий ключ
не заменяйте. Другой внешний путь задаётся через SOPS_AGE_KEY_FILE. Ключ внутри
репозитория (включая symlink) отклоняется. Без ключа restore даёт понятную ошибку.
Restore сохраняет существующий .env; ошибка SOPS/MAC не создаёт пустой файл.
Первичный secrets:init нужен только при создании нового encrypted набора,
не на каждом компьютере; если ciphertext существует, новый ключ не создаётся.

## Как переключаться между компьютерами

На исходном компьютере сохраните изменения, выполните проверки и сделайте
осмысленные commits с явными путями, затем `git push`. Незакоммиченные файлы
не появятся на другом компьютере. .env.local и БД остаются на своём компьютере.

На другом до редактирования: `git status --short --branch`, `git fetch origin`,
`git pull --ff-only`. При локальных правках сначала сохраните их, не используйте
автоматические stash/reset/force. Затем `nvm use`; `npm ci` только при первой
установке/изменении lockfile; `npm run secrets:refresh` если ciphertext изменился;
`npm run local:setup` для новых миграций; local:api/local:ui.
Refresh явно заменяет только неизменённый после restore/encrypt .env; при
локальных правках отказывает. .secrets-state.json хранит только hashes версии,
не коммитится. Если отметки нет, восстановите/объедините конфиг вручную.

Рабочая ветка этой подготовки — chore/portable-development. Push feature-ветки
не запускает существующий CI. Push dev запускает frontend deploy; не используйте
его для обычной синхронизации без согласованной доставки. PR/merge/dispatch
в эту работу не входят; production/VPS не меняются.

## Как обновлять секреты

Сначала fetch/pull актуальной своей ветки. Если .env не меняли, выполните
secrets:refresh, затем отредактируйте четыре значения в приватном редакторе.
Допустимы A-Z/a-z/0-9/_/- и минимум 15 символов; комментарии не переносятся.
Не добавляйте production-доступы или машинные порты. После этого:

```bash
npm run secrets:encrypt
git diff --check
git add -- secrets/development.enc.env
git commit -m 'chore(dev): update development secrets'
git push
```

В этом проекте регулярная работа оформляется карточкой Txxx по AGENTS; замените
пример сообщения на type(scope): Txxx действие. Encrypt сам выполняет fetch
origin и отказывает, если upstream содержит новые изменения настроек или
локальный ciphertext не соответствует отметке restore. Без upstream сначала
настройте слежение за существующей своей веткой; это не разрешение push dev.
Смена пароля в .env не меняет пароль уже созданной БД/аккаунта. При осознанной
ротации синхронизируйте соответствующую локальную роль через интерактивный
`docker exec -it health-dev-local psql -U postgres` и `\password имя_роли` на
каждом компьютере. Для существующего local-demo сохраняйте прежний
DEV_DEMO_PASSWORD: setup не сбрасывает пароль аккаунта, прямой смены пароля
через UI нет. Новый пароль аккаунта требует отдельной явной процедуры; можно
создать отдельный стенд с новым именем/портом и перенести дневник полной UI-копией.
Несовпадение пароля роли остановит setup, сохранив данные.

При конфликте ciphertext Git не объединяет строки автоматически (.gitattributes).
С ключом сохраните обе версии в закрытый временный каталог, расшифруйте в файлы:

```bash
umask 077
conflict_tmp=$(mktemp -d)
git show :2:secrets/development.enc.env > "$conflict_tmp/ours.enc.env"
git show :3:secrets/development.enc.env > "$conflict_tmp/theirs.enc.env"
sops --decrypt --input-type dotenv --output-type dotenv --output "$conflict_tmp/ours.env" "$conflict_tmp/ours.enc.env"
sops --decrypt --input-type dotenv --output-type dotenv --output "$conflict_tmp/theirs.env" "$conflict_tmp/theirs.enc.env"
```

Приватным редактором объедините нужные значения в .env, сохранив свою закрытую
копию перед правкой. Установите целый ours.enc.env либо theirs.enc.env как
secrets/development.enc.env, добавьте только этот ciphertext и завершите уже
согласованное Git-действие с выбранной целой версией. Только после этого, когда
HEAD включает upstream, выполните `npm run secrets:reconcile` и отдельный коммит
объединённых значений. Иначе проверка новых upstream commits откажет. Reconcile
проверяет ключ/MAC/upstream, но разрешает новую локальную версию без старой отметки.
Не запускайте merge/rebase только ради этой инструкции.
Удалите временные plaintext-файлы после разрешения; не выводите их через diff/cat.

## Как восстановить локальные данные

Для запуска достаточно Git, инструментов и age-ключа: setup создаёт новую
синтетическую демонстрацию. Настоящие данные и дампы не нужны для разработки.
PostgreSQL содержит и дневник, и байты вложений; код/.env их не переносят.
Том переживает остановку контейнера (`docker stop health-dev-local`, затем setup).
Не используйте docker volume rm/prune для рабочего тома.

Если нужно продолжить прежний дневник, сохраните полную копию в настройках UI
и перенесите её через защищённое хранилище вне Git. На новом компьютере сначала
сохраните копию текущего локального дневника, затем используйте UI восстановления:
предпросмотр и явное подтверждение замены. Текстовая копия не содержит вложений.
Для физического PostgreSQL backup/restore, ролей и account state используйте
[BACKUPS](BACKUPS.md) и отдельную целевую БД с явным разрешением. Recovery GPG
ключ отличается от development age-ключа; он переносится отдельно, если нужен.
Автоматического чтения production, копирования реальных данных или очистки БД нет.

## Проверка чистого клона

Используйте `git clone --no-local`, npm ci и только явно предоставленный age key.
Не копируйте .env/node_modules/свои настройки. Создайте новый .env.local с тремя
свободными портами >=20000 и DEV_CONTAINER=health-dev-smoke-уникальное-имя
(только латиница), затем local:setup, `npm run test:local`,
`npm run test:local:smoke`, `npm run local:check`, `npm run build:api`.
Smoke проверяет повторный setup по содержимому 20 таблиц, readiness/UI и вход;
он отказывается работать на обычных портах/контейнере. Test:local использует
синтетические временные Git/key fixtures, проверяет повреждение и сохранность.
Полный check использует health_test и собственные временные БД; backup-тесту
нужен postgres:18.3 в Docker, браузерным тестам — Chromium/GPG по [TESTING](TESTING.md).
Если sudo недоступен, а Chromium сообщает об отсутствии libnspr4/libnss3/libasound,
на Ubuntu 24.04 можно явно загрузить только эти системные библиотеки локально:

```bash
browser_deps=$(mktemp -d)
(cd "$browser_deps" && apt-get download libnspr4 libnss3 libasound2t64)
for archive in "$browser_deps"/*.deb; do dpkg-deb -x "$archive" "$browser_deps/root"; done
export LD_LIBRARY_PATH="$browser_deps/root/usr/lib/x86_64-linux-gnu${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
npx playwright install chromium
npm run local:check
```

Это явная настройка инструментов текущего терминала, не содержимое проекта
или общие секреты. Другие отсутствующие библиотеки диагностируйте через ldd;
на обычном новом компьютере предпочтительна команда install --with-deps выше.
E2E отдельно занимают 4173/4181: перед запуском убедитесь, что эти порты свободны.
Успешный чистый клон на текущем компьютере не доказывает запуск на другом устройстве.
