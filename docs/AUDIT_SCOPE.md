# Файловый реестр охвата T231

Исходный Git tree: 9718e60423c28bbc708db95bf045db6403575769, **914 tracked-файлов**.
Это приложение к [AUDIT](AUDIT.md), не отдельный отчёт с другими выводами.
Новые документы T231 не включены в baseline. Node_modules, dist/build-api/coverage
и reports исключены; собственные generators/config включены.

Статус «проверено» означает разбор кода/контракта указанным способом, а не
доказательство отсутствия ошибок. «Проверено частично» ограничивает объём.
Исторические карточки не исполняемые модули: содержимое не перечитывалось целиком.
Текущие требования/навигация проверены отдельно. У тестов полное исполнение
и выборочный ручной review различаются.

Все исходные модули перечислены пофайлово; находки и ограничения — в AUDIT,
ответственность — в [ARCHITECTURE](ARCHITECTURE.md).

| Статус | Файлов |
|---|---|
| не проверено | 300 |
| проверено | 311 |
| проверено частично | 303 |

## .github

| Файл | Статус | Способ проверки | Ограничение |
|---|---|---|---|
| [.github/workflows/check.yml](../.github/workflows/check.yml) | проверено | Конфигурация/entry/script и штатный gate по назначению | Удалённое окружение/clean-install не подтверждены |

## deploy

| Файл | Статус | Способ проверки | Ограничение |
|---|---|---|---|
| [deploy/backup-monitor.example.json](../deploy/backup-monitor.example.json) | проверено | Полный static review; Python/units/build по назначению | AUD-008,011; live/SSH/SMTP не исполнялись |
| [deploy/backup.example.json](../deploy/backup.example.json) | проверено | Полный static review; Python/units/build по назначению | AUD-008,011; live/SSH/SMTP не исполнялись |
| [deploy/backup_check.py](../deploy/backup_check.py) | проверено | Полный static review; Python/units/build по назначению | AUD-008,011; live/SSH/SMTP не исполнялись |
| [deploy/backup_monitor.py](../deploy/backup_monitor.py) | проверено | Полный static review; Python/units/build по назначению | AUD-008,011; live/SSH/SMTP не исполнялись |
| [deploy/backup_receive.py](../deploy/backup_receive.py) | проверено | Полный static review; Python/units/build по назначению | AUD-008,011; live/SSH/SMTP не исполнялись |
| [deploy/backup_send.py](../deploy/backup_send.py) | проверено | Полный static review; Python/units/build по назначению | AUD-008,011; live/SSH/SMTP не исполнялись |
| [deploy/check_mail.py](../deploy/check_mail.py) | проверено | Полный static review; Python/units/build по назначению | AUD-008,011; live/SSH/SMTP не исполнялись |
| [deploy/database-roles.sql](../deploy/database-roles.sql) | проверено | Полный static review; Python/units/build по назначению | AUD-008,011; live/SSH/SMTP не исполнялись |
| [deploy/health-api-tunnel.service](../deploy/health-api-tunnel.service) | проверено | Полный static review; Python/units/build по назначению | AUD-008,011; live/SSH/SMTP не исполнялись |
| [deploy/health-api.service](../deploy/health-api.service) | проверено | Полный static review; Python/units/build по назначению | AUD-008,011; live/SSH/SMTP не исполнялись |
| [deploy/health-backup-monitor.service](../deploy/health-backup-monitor.service) | проверено | Полный static review; Python/units/build по назначению | AUD-008,011; live/SSH/SMTP не исполнялись |
| [deploy/health-backup-monitor.timer](../deploy/health-backup-monitor.timer) | проверено | Полный static review; Python/units/build по назначению | AUD-008,011; live/SSH/SMTP не исполнялись |
| [deploy/health-backup.service](../deploy/health-backup.service) | проверено | Полный static review; Python/units/build по назначению | AUD-008,011; live/SSH/SMTP не исполнялись |
| [deploy/health-backup.timer](../deploy/health-backup.timer) | проверено | Полный static review; Python/units/build по назначению | AUD-008,011; live/SSH/SMTP не исполнялись |
| [deploy/health-tunnel.sshd.conf](../deploy/health-tunnel.sshd.conf) | проверено | Полный static review; Python/units/build по назначению | AUD-008,011; live/SSH/SMTP не исполнялись |
| [deploy/install_release.py](../deploy/install_release.py) | проверено | Полный static review; Python/units/build по назначению | AUD-008,011; live/SSH/SMTP не исполнялись |
| [deploy/mail-opendkim.conf](../deploy/mail-opendkim.conf) | проверено | Полный static review; Python/units/build по назначению | AUD-008,011; live/SSH/SMTP не исполнялись |
| [deploy/mail-postfix.cf](../deploy/mail-postfix.cf) | проверено | Полный static review; Python/units/build по назначению | AUD-008,011; live/SSH/SMTP не исполнялись |
| [deploy/mail-privacy.conf](../deploy/mail-privacy.conf) | проверено | Полный static review; Python/units/build по назначению | AUD-008,011; live/SSH/SMTP не исполнялись |
| [deploy/mail-senders](../deploy/mail-senders) | проверено | Полный static review; Python/units/build по назначению | AUD-008,011; live/SSH/SMTP не исполнялись |
| [deploy/nginx.conf](../deploy/nginx.conf) | проверено | Полный static review; Python/units/build по назначению | AUD-008,011; live/SSH/SMTP не исполнялись |
| [deploy/revoke-restored-access.sql](../deploy/revoke-restored-access.sql) | проверено | Полный static review; Python/units/build по назначению | AUD-008,011; live/SSH/SMTP не исполнялись |
| [deploy/test_backup_check.py](../deploy/test_backup_check.py) | проверено частично | Python38 PASS + разбор связанных assertions | Synthetic local test, не production |
| [deploy/test_backup_monitor.py](../deploy/test_backup_monitor.py) | проверено частично | Python38 PASS + разбор связанных assertions | Synthetic local test, не production |
| [deploy/test_backup_receive.py](../deploy/test_backup_receive.py) | проверено частично | Python38 PASS + разбор связанных assertions | Synthetic local test, не production |
| [deploy/test_backup_send.py](../deploy/test_backup_send.py) | проверено частично | Python38 PASS + разбор связанных assertions | Synthetic local test, не production |
| [deploy/test_check_mail.py](../deploy/test_check_mail.py) | проверено частично | Python38 PASS + разбор связанных assertions | Synthetic local test, не production |
| [deploy/test_install_release.py](../deploy/test_install_release.py) | проверено частично | Python38 PASS + разбор связанных assertions | Synthetic local test, не production |
| [deploy/verify_build.py](../deploy/verify_build.py) | проверено | Полный static review; Python/units/build по назначению | AUD-008,011; live/SSH/SMTP не исполнялись |

## design

| Файл | Статус | Способ проверки | Ограничение |
|---|---|---|---|
| [design/desktop/README.md](../design/desktop/README.md) | проверено частично | Исторический статус/ссылки сопоставлены с текущим UI | Архивные формулировки уточнены в T231 |
| [design/desktop/Roboto-LICENSE.txt](../design/desktop/Roboto-LICENSE.txt) | не проверено | Исключён ручной разбор generated SVG/PNG/validation JSON или стороннего font/license | Генератор/лицензии и назначение учтены |
| [design/desktop/Roboto.ttf](../design/desktop/Roboto.ttf) | не проверено | Исключён ручной разбор generated SVG/PNG/validation JSON или стороннего font/license | Генератор/лицензии и назначение учтены |
| [design/desktop/activity-desktop.png](../design/desktop/activity-desktop.png) | не проверено | Исключён ручной разбор generated SVG/PNG/validation JSON или стороннего font/license | Генератор/лицензии и назначение учтены |
| [design/desktop/activity-desktop.svg](../design/desktop/activity-desktop.svg) | не проверено | Исключён ручной разбор generated SVG/PNG/validation JSON или стороннего font/license | Генератор/лицензии и назначение учтены |
| [design/desktop/activity-states.png](../design/desktop/activity-states.png) | не проверено | Исключён ручной разбор generated SVG/PNG/validation JSON или стороннего font/license | Генератор/лицензии и назначение учтены |
| [design/desktop/activity-states.svg](../design/desktop/activity-states.svg) | не проверено | Исключён ручной разбор generated SVG/PNG/validation JSON или стороннего font/license | Генератор/лицензии и назначение учтены |
| [design/desktop/activity-validation.json](../design/desktop/activity-validation.json) | не проверено | Исключён ручной разбор generated SVG/PNG/validation JSON или стороннего font/license | Генератор/лицензии и назначение учтены |
| [design/desktop/activity.cjs](../design/desktop/activity.cjs) | проверено | Генератор: исходник/шаблоны/зависимости/запись; без запуска | Архивные макеты, не runtime; перезаписывает tracked outputs |
| [design/desktop/documents-desktop.png](../design/desktop/documents-desktop.png) | не проверено | Исключён ручной разбор generated SVG/PNG/validation JSON или стороннего font/license | Генератор/лицензии и назначение учтены |
| [design/desktop/documents-desktop.svg](../design/desktop/documents-desktop.svg) | не проверено | Исключён ручной разбор generated SVG/PNG/validation JSON или стороннего font/license | Генератор/лицензии и назначение учтены |
| [design/desktop/documents-states.png](../design/desktop/documents-states.png) | не проверено | Исключён ручной разбор generated SVG/PNG/validation JSON или стороннего font/license | Генератор/лицензии и назначение учтены |
| [design/desktop/documents-states.svg](../design/desktop/documents-states.svg) | не проверено | Исключён ручной разбор generated SVG/PNG/validation JSON или стороннего font/license | Генератор/лицензии и назначение учтены |
| [design/desktop/documents-validation.json](../design/desktop/documents-validation.json) | не проверено | Исключён ручной разбор generated SVG/PNG/validation JSON или стороннего font/license | Генератор/лицензии и назначение учтены |
| [design/desktop/documents.cjs](../design/desktop/documents.cjs) | проверено | Генератор: исходник/шаблоны/зависимости/запись; без запуска | Архивные макеты, не runtime; перезаписывает tracked outputs |
| [design/desktop/gallery-validation.json](../design/desktop/gallery-validation.json) | не проверено | Исключён ручной разбор generated SVG/PNG/validation JSON или стороннего font/license | Генератор/лицензии и назначение учтены |
| [design/desktop/index.html](../design/desktop/index.html) | проверено частично | Generated gallery: шаблон render.cjs и existence HTML links | Ручной rendering не выполнялся |
| [design/desktop/material-symbols-LICENSE.txt](../design/desktop/material-symbols-LICENSE.txt) | не проверено | Исключён ручной разбор generated SVG/PNG/validation JSON или стороннего font/license | Генератор/лицензии и назначение учтены |
| [design/desktop/nutrition-desktop.png](../design/desktop/nutrition-desktop.png) | не проверено | Исключён ручной разбор generated SVG/PNG/validation JSON или стороннего font/license | Генератор/лицензии и назначение учтены |
| [design/desktop/nutrition-desktop.svg](../design/desktop/nutrition-desktop.svg) | не проверено | Исключён ручной разбор generated SVG/PNG/validation JSON или стороннего font/license | Генератор/лицензии и назначение учтены |
| [design/desktop/nutrition-states.png](../design/desktop/nutrition-states.png) | не проверено | Исключён ручной разбор generated SVG/PNG/validation JSON или стороннего font/license | Генератор/лицензии и назначение учтены |
| [design/desktop/nutrition-states.svg](../design/desktop/nutrition-states.svg) | не проверено | Исключён ручной разбор generated SVG/PNG/validation JSON или стороннего font/license | Генератор/лицензии и назначение учтены |
| [design/desktop/nutrition-validation.json](../design/desktop/nutrition-validation.json) | не проверено | Исключён ручной разбор generated SVG/PNG/validation JSON или стороннего font/license | Генератор/лицензии и назначение учтены |
| [design/desktop/nutrition.cjs](../design/desktop/nutrition.cjs) | проверено | Генератор: исходник/шаблоны/зависимости/запись; без запуска | Архивные макеты, не runtime; перезаписывает tracked outputs |
| [design/desktop/photos-desktop.png](../design/desktop/photos-desktop.png) | не проверено | Исключён ручной разбор generated SVG/PNG/validation JSON или стороннего font/license | Генератор/лицензии и назначение учтены |
| [design/desktop/photos-desktop.svg](../design/desktop/photos-desktop.svg) | не проверено | Исключён ручной разбор generated SVG/PNG/validation JSON или стороннего font/license | Генератор/лицензии и назначение учтены |
| [design/desktop/photos-states.png](../design/desktop/photos-states.png) | не проверено | Исключён ручной разбор generated SVG/PNG/validation JSON или стороннего font/license | Генератор/лицензии и назначение учтены |
| [design/desktop/photos-states.svg](../design/desktop/photos-states.svg) | не проверено | Исключён ручной разбор generated SVG/PNG/validation JSON или стороннего font/license | Генератор/лицензии и назначение учтены |
| [design/desktop/photos-validation.json](../design/desktop/photos-validation.json) | не проверено | Исключён ручной разбор generated SVG/PNG/validation JSON или стороннего font/license | Генератор/лицензии и назначение учтены |
| [design/desktop/photos.cjs](../design/desktop/photos.cjs) | проверено | Генератор: исходник/шаблоны/зависимости/запись; без запуска | Архивные макеты, не runtime; перезаписывает tracked outputs |
| [design/desktop/profile-desktop.png](../design/desktop/profile-desktop.png) | не проверено | Исключён ручной разбор generated SVG/PNG/validation JSON или стороннего font/license | Генератор/лицензии и назначение учтены |
| [design/desktop/profile-desktop.svg](../design/desktop/profile-desktop.svg) | не проверено | Исключён ручной разбор generated SVG/PNG/validation JSON или стороннего font/license | Генератор/лицензии и назначение учтены |
| [design/desktop/profile-states.png](../design/desktop/profile-states.png) | не проверено | Исключён ручной разбор generated SVG/PNG/validation JSON или стороннего font/license | Генератор/лицензии и назначение учтены |
| [design/desktop/profile-states.svg](../design/desktop/profile-states.svg) | не проверено | Исключён ручной разбор generated SVG/PNG/validation JSON или стороннего font/license | Генератор/лицензии и назначение учтены |
| [design/desktop/profile-validation.json](../design/desktop/profile-validation.json) | не проверено | Исключён ручной разбор generated SVG/PNG/validation JSON или стороннего font/license | Генератор/лицензии и назначение учтены |
| [design/desktop/profile.cjs](../design/desktop/profile.cjs) | проверено | Генератор: исходник/шаблоны/зависимости/запись; без запуска | Архивные макеты, не runtime; перезаписывает tracked outputs |
| [design/desktop/render.cjs](../design/desktop/render.cjs) | проверено | Генератор: исходник/шаблоны/зависимости/запись; без запуска | Архивные макеты, не runtime; перезаписывает tracked outputs |
| [design/desktop/settings-desktop.png](../design/desktop/settings-desktop.png) | не проверено | Исключён ручной разбор generated SVG/PNG/validation JSON или стороннего font/license | Генератор/лицензии и назначение учтены |
| [design/desktop/settings-desktop.svg](../design/desktop/settings-desktop.svg) | не проверено | Исключён ручной разбор generated SVG/PNG/validation JSON или стороннего font/license | Генератор/лицензии и назначение учтены |
| [design/desktop/settings-states.png](../design/desktop/settings-states.png) | не проверено | Исключён ручной разбор generated SVG/PNG/validation JSON или стороннего font/license | Генератор/лицензии и назначение учтены |
| [design/desktop/settings-states.svg](../design/desktop/settings-states.svg) | не проверено | Исключён ручной разбор generated SVG/PNG/validation JSON или стороннего font/license | Генератор/лицензии и назначение учтены |
| [design/desktop/settings-validation.json](../design/desktop/settings-validation.json) | не проверено | Исключён ручной разбор generated SVG/PNG/validation JSON или стороннего font/license | Генератор/лицензии и назначение учтены |
| [design/desktop/settings.cjs](../design/desktop/settings.cjs) | проверено | Генератор: исходник/шаблоны/зависимости/запись; без запуска | Архивные макеты, не runtime; перезаписывает tracked outputs |
| [design/desktop/today-desktop.png](../design/desktop/today-desktop.png) | не проверено | Исключён ручной разбор generated SVG/PNG/validation JSON или стороннего font/license | Генератор/лицензии и назначение учтены |
| [design/desktop/today-desktop.svg](../design/desktop/today-desktop.svg) | не проверено | Исключён ручной разбор generated SVG/PNG/validation JSON или стороннего font/license | Генератор/лицензии и назначение учтены |
| [design/desktop/weight-desktop.png](../design/desktop/weight-desktop.png) | не проверено | Исключён ручной разбор generated SVG/PNG/validation JSON или стороннего font/license | Генератор/лицензии и назначение учтены |
| [design/desktop/weight-desktop.svg](../design/desktop/weight-desktop.svg) | не проверено | Исключён ручной разбор generated SVG/PNG/validation JSON или стороннего font/license | Генератор/лицензии и назначение учтены |
| [design/desktop/weight-states.png](../design/desktop/weight-states.png) | не проверено | Исключён ручной разбор generated SVG/PNG/validation JSON или стороннего font/license | Генератор/лицензии и назначение учтены |
| [design/desktop/weight-states.svg](../design/desktop/weight-states.svg) | не проверено | Исключён ручной разбор generated SVG/PNG/validation JSON или стороннего font/license | Генератор/лицензии и назначение учтены |
| [design/desktop/weight-validation.json](../design/desktop/weight-validation.json) | не проверено | Исключён ручной разбор generated SVG/PNG/validation JSON или стороннего font/license | Генератор/лицензии и назначение учтены |
| [design/desktop/weight.cjs](../design/desktop/weight.cjs) | проверено | Генератор: исходник/шаблоны/зависимости/запись; без запуска | Архивные макеты, не runtime; перезаписывает tracked outputs |

## docs

| Файл | Статус | Способ проверки | Ограничение |
|---|---|---|---|
| [docs/API_REFERENCE.md](../docs/API_REFERENCE.md) | проверено | Инструкции/контракты/требования сопоставлены с кодом | Старые production утверждения только исторические |
| [docs/BACKEND_PLAN.md](../docs/BACKEND_PLAN.md) | проверено частично | Навигация/относящиеся исторические разделы | Не все исторические записи перечитаны |
| [docs/BACKUPS.md](../docs/BACKUPS.md) | проверено | Инструкции/контракты/требования сопоставлены с кодом | Старые production утверждения только исторические |
| [docs/CALCULATIONS.md](../docs/CALCULATIONS.md) | проверено | Инструкции/контракты/требования сопоставлены с кодом | Старые production утверждения только исторические |
| [docs/CODING_STANDARDS.md](../docs/CODING_STANDARDS.md) | проверено | Инструкции/контракты/требования сопоставлены с кодом | Старые production утверждения только исторические |
| [docs/DATABASE.md](../docs/DATABASE.md) | проверено частично | Навигация/относящиеся исторические разделы | Не все исторические записи перечитаны |
| [docs/DEPENDENCIES.md](../docs/DEPENDENCIES.md) | проверено | Инструкции/контракты/требования сопоставлены с кодом | Старые production утверждения только исторические |
| [docs/DEPLOYMENT.md](../docs/DEPLOYMENT.md) | проверено | Инструкции/контракты/требования сопоставлены с кодом | Старые production утверждения только исторические |
| [docs/DESIGN.md](../docs/DESIGN.md) | проверено частично | Навигация/относящиеся исторические разделы | Не все исторические записи перечитаны |
| [docs/MAIL_DNS.md](../docs/MAIL_DNS.md) | проверено | Инструкции/контракты/требования сопоставлены с кодом | Старые production утверждения только исторические |
| [docs/MVP.md](../docs/MVP.md) | проверено | Инструкции/контракты/требования сопоставлены с кодом | Старые production утверждения только исторические |
| [docs/PRIVACY_SECURITY.md](../docs/PRIVACY_SECURITY.md) | проверено | Инструкции/контракты/требования сопоставлены с кодом | Старые production утверждения только исторические |
| [docs/PROGRESS.md](../docs/PROGRESS.md) | проверено частично | Навигация/относящиеся исторические разделы | Не все исторические записи перечитаны |
| [docs/PROJECT_MAP.md](../docs/PROJECT_MAP.md) | проверено | Инструкции/контракты/требования сопоставлены с кодом | Старые production утверждения только исторические |
| [docs/REVIEW.md](../docs/REVIEW.md) | проверено частично | Навигация/относящиеся исторические разделы | Не все исторические записи перечитаны |
| [docs/SECURITY_AUDIT_T198.md](../docs/SECURITY_AUDIT_T198.md) | проверено частично | Навигация/относящиеся исторические разделы | Не все исторические записи перечитаны |
| [docs/SECURITY_PLAN.md](../docs/SECURITY_PLAN.md) | проверено частично | Навигация/относящиеся исторические разделы | Не все исторические записи перечитаны |
| [docs/SECURITY_RELEASE.md](../docs/SECURITY_RELEASE.md) | проверено частично | Навигация/относящиеся исторические разделы | Не все исторические записи перечитаны |
| [docs/SERVER_COMPLETION.md](../docs/SERVER_COMPLETION.md) | проверено частично | Навигация/относящиеся исторические разделы | Не все исторические записи перечитаны |
| [docs/SERVER_STORAGE.md](../docs/SERVER_STORAGE.md) | проверено частично | Навигация/относящиеся исторические разделы | Не все исторические записи перечитаны |
| [docs/TESTING.md](../docs/TESTING.md) | проверено | Инструкции/контракты/требования сопоставлены с кодом | Старые production утверждения только исторические |
| [docs/TEST_CASES.md](../docs/TEST_CASES.md) | проверено | Инструкции/контракты/требования сопоставлены с кодом | Старые production утверждения только исторические |
| [docs/WORKFLOW.md](../docs/WORKFLOW.md) | проверено | Инструкции/контракты/требования сопоставлены с кодом | Старые production утверждения только исторические |
| [docs/tasks/T000.md](../docs/tasks/T000.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T001.md](../docs/tasks/T001.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T001a.md](../docs/tasks/T001a.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T002.md](../docs/tasks/T002.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T003.md](../docs/tasks/T003.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T003a.md](../docs/tasks/T003a.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T004.md](../docs/tasks/T004.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T005.md](../docs/tasks/T005.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T006.md](../docs/tasks/T006.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T007.md](../docs/tasks/T007.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T008.md](../docs/tasks/T008.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T009.md](../docs/tasks/T009.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T010.md](../docs/tasks/T010.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T011.md](../docs/tasks/T011.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T012.md](../docs/tasks/T012.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T013.md](../docs/tasks/T013.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T014.md](../docs/tasks/T014.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T015.md](../docs/tasks/T015.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T016.md](../docs/tasks/T016.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T017.md](../docs/tasks/T017.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T018.md](../docs/tasks/T018.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T018a.md](../docs/tasks/T018a.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T019.md](../docs/tasks/T019.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T020.md](../docs/tasks/T020.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T021.md](../docs/tasks/T021.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T022.md](../docs/tasks/T022.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T023.md](../docs/tasks/T023.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T024.md](../docs/tasks/T024.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T025.md](../docs/tasks/T025.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T026.md](../docs/tasks/T026.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T027.md](../docs/tasks/T027.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T028.md](../docs/tasks/T028.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T029.md](../docs/tasks/T029.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T030.md](../docs/tasks/T030.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T031.md](../docs/tasks/T031.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T032.md](../docs/tasks/T032.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T033.md](../docs/tasks/T033.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T034.md](../docs/tasks/T034.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T035.md](../docs/tasks/T035.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T036.md](../docs/tasks/T036.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T037.md](../docs/tasks/T037.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T038.md](../docs/tasks/T038.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T039.md](../docs/tasks/T039.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T040.md](../docs/tasks/T040.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T040a.md](../docs/tasks/T040a.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T041.md](../docs/tasks/T041.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T042.md](../docs/tasks/T042.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T042a.md](../docs/tasks/T042a.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T043.md](../docs/tasks/T043.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T044.md](../docs/tasks/T044.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T045.md](../docs/tasks/T045.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T046.md](../docs/tasks/T046.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T046a.md](../docs/tasks/T046a.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T046b.md](../docs/tasks/T046b.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T047.md](../docs/tasks/T047.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T048.md](../docs/tasks/T048.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T049.md](../docs/tasks/T049.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T050.md](../docs/tasks/T050.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T050a.md](../docs/tasks/T050a.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T050b.md](../docs/tasks/T050b.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T051.md](../docs/tasks/T051.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T052.md](../docs/tasks/T052.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T053.md](../docs/tasks/T053.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T054.md](../docs/tasks/T054.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T054a.md](../docs/tasks/T054a.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T054b.md](../docs/tasks/T054b.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T055.md](../docs/tasks/T055.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T055a.md](../docs/tasks/T055a.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T055b.md](../docs/tasks/T055b.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T056.md](../docs/tasks/T056.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T057.md](../docs/tasks/T057.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T058.md](../docs/tasks/T058.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T058a.md](../docs/tasks/T058a.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T058b.md](../docs/tasks/T058b.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T058c.md](../docs/tasks/T058c.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T059.md](../docs/tasks/T059.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T060.md](../docs/tasks/T060.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T061.md](../docs/tasks/T061.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T061a.md](../docs/tasks/T061a.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T061b.md](../docs/tasks/T061b.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T061c.md](../docs/tasks/T061c.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T062.md](../docs/tasks/T062.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T063.md](../docs/tasks/T063.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T064.md](../docs/tasks/T064.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T065.md](../docs/tasks/T065.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T066.md](../docs/tasks/T066.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T067.md](../docs/tasks/T067.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T068.md](../docs/tasks/T068.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T068a.md](../docs/tasks/T068a.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T069.md](../docs/tasks/T069.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T070.md](../docs/tasks/T070.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T071.md](../docs/tasks/T071.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T072.md](../docs/tasks/T072.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T073a.md](../docs/tasks/T073a.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T073b.md](../docs/tasks/T073b.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T073c.md](../docs/tasks/T073c.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T074.md](../docs/tasks/T074.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T075.md](../docs/tasks/T075.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T076.md](../docs/tasks/T076.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T120.md](../docs/tasks/T120.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T121.md](../docs/tasks/T121.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T122.md](../docs/tasks/T122.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T123.md](../docs/tasks/T123.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T124.md](../docs/tasks/T124.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T125.md](../docs/tasks/T125.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T126.md](../docs/tasks/T126.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T127.md](../docs/tasks/T127.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T128.md](../docs/tasks/T128.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T129.md](../docs/tasks/T129.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T130.md](../docs/tasks/T130.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T131.md](../docs/tasks/T131.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T132.md](../docs/tasks/T132.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T133.md](../docs/tasks/T133.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T134.md](../docs/tasks/T134.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T135.md](../docs/tasks/T135.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T136.md](../docs/tasks/T136.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T137.md](../docs/tasks/T137.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T138.md](../docs/tasks/T138.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T139.md](../docs/tasks/T139.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T140.md](../docs/tasks/T140.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T141.md](../docs/tasks/T141.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T142.md](../docs/tasks/T142.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T143.md](../docs/tasks/T143.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T144.md](../docs/tasks/T144.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T145.md](../docs/tasks/T145.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T146.md](../docs/tasks/T146.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T147.md](../docs/tasks/T147.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T148.md](../docs/tasks/T148.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T149.md](../docs/tasks/T149.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T150.md](../docs/tasks/T150.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T151.md](../docs/tasks/T151.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T152.md](../docs/tasks/T152.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T153.md](../docs/tasks/T153.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T154.md](../docs/tasks/T154.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T155.md](../docs/tasks/T155.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T156.md](../docs/tasks/T156.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T157.md](../docs/tasks/T157.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T158.md](../docs/tasks/T158.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T159.md](../docs/tasks/T159.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T160.md](../docs/tasks/T160.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T161.md](../docs/tasks/T161.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T162.md](../docs/tasks/T162.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T163a.md](../docs/tasks/T163a.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T163b.md](../docs/tasks/T163b.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T164.md](../docs/tasks/T164.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T165a.md](../docs/tasks/T165a.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T165b.md](../docs/tasks/T165b.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T165c.md](../docs/tasks/T165c.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T166.md](../docs/tasks/T166.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T167a.md](../docs/tasks/T167a.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T167b.md](../docs/tasks/T167b.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T167c.md](../docs/tasks/T167c.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T168.md](../docs/tasks/T168.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T169a.md](../docs/tasks/T169a.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T169b.md](../docs/tasks/T169b.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T169c.md](../docs/tasks/T169c.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T170.md](../docs/tasks/T170.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T171a.md](../docs/tasks/T171a.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T171b1.md](../docs/tasks/T171b1.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T171b2.md](../docs/tasks/T171b2.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T171c.md](../docs/tasks/T171c.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T171d.md](../docs/tasks/T171d.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T172a.md](../docs/tasks/T172a.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T172b1.md](../docs/tasks/T172b1.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T172b2.md](../docs/tasks/T172b2.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T172b3.md](../docs/tasks/T172b3.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T172b4.md](../docs/tasks/T172b4.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T172c1.md](../docs/tasks/T172c1.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T172c2.md](../docs/tasks/T172c2.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T172c3.md](../docs/tasks/T172c3.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T172d1.md](../docs/tasks/T172d1.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T172d2.md](../docs/tasks/T172d2.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T172d3.md](../docs/tasks/T172d3.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T172d4.md](../docs/tasks/T172d4.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T172d5.md](../docs/tasks/T172d5.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T172e.md](../docs/tasks/T172e.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T173a.md](../docs/tasks/T173a.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T173b.md](../docs/tasks/T173b.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T173c.md](../docs/tasks/T173c.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T174a.md](../docs/tasks/T174a.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T174b.md](../docs/tasks/T174b.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T174b2.md](../docs/tasks/T174b2.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T174c1.md](../docs/tasks/T174c1.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T174c2.md](../docs/tasks/T174c2.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T174d.md](../docs/tasks/T174d.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T175a.md](../docs/tasks/T175a.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T175b.md](../docs/tasks/T175b.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T175c1.md](../docs/tasks/T175c1.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T175c2.md](../docs/tasks/T175c2.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T175d.md](../docs/tasks/T175d.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T175e1.md](../docs/tasks/T175e1.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T175e2.md](../docs/tasks/T175e2.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T175e3.md](../docs/tasks/T175e3.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T175e4.md](../docs/tasks/T175e4.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T175e5.md](../docs/tasks/T175e5.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T175e6.md](../docs/tasks/T175e6.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T175e7.md](../docs/tasks/T175e7.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T175e8.md](../docs/tasks/T175e8.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T175e9.md](../docs/tasks/T175e9.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T175f.md](../docs/tasks/T175f.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T175g.md](../docs/tasks/T175g.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T176a.md](../docs/tasks/T176a.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T176b.md](../docs/tasks/T176b.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T177.md](../docs/tasks/T177.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T178a.md](../docs/tasks/T178a.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T178b.md](../docs/tasks/T178b.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T179.md](../docs/tasks/T179.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T180.md](../docs/tasks/T180.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T181.md](../docs/tasks/T181.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T182.md](../docs/tasks/T182.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T183.md](../docs/tasks/T183.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T184.md](../docs/tasks/T184.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T185.md](../docs/tasks/T185.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T186.md](../docs/tasks/T186.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T187.md](../docs/tasks/T187.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T188.md](../docs/tasks/T188.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T189.md](../docs/tasks/T189.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T190.md](../docs/tasks/T190.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T191.md](../docs/tasks/T191.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T192.md](../docs/tasks/T192.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T193.md](../docs/tasks/T193.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T194.md](../docs/tasks/T194.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T195.md](../docs/tasks/T195.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T196.md](../docs/tasks/T196.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T197.md](../docs/tasks/T197.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T198.md](../docs/tasks/T198.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T199.md](../docs/tasks/T199.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T200.md](../docs/tasks/T200.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T201.md](../docs/tasks/T201.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T202.md](../docs/tasks/T202.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T203.md](../docs/tasks/T203.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T204.md](../docs/tasks/T204.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T205.md](../docs/tasks/T205.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T206.md](../docs/tasks/T206.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T207.md](../docs/tasks/T207.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T208.md](../docs/tasks/T208.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T209.md](../docs/tasks/T209.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T210.md](../docs/tasks/T210.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T211.md](../docs/tasks/T211.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T212.md](../docs/tasks/T212.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T213.md](../docs/tasks/T213.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T214.md](../docs/tasks/T214.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T215.md](../docs/tasks/T215.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T216.md](../docs/tasks/T216.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T217.md](../docs/tasks/T217.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T218.md](../docs/tasks/T218.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T219.md](../docs/tasks/T219.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T219a.md](../docs/tasks/T219a.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T220.md](../docs/tasks/T220.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T221.md](../docs/tasks/T221.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T222.md](../docs/tasks/T222.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T222a.md](../docs/tasks/T222a.md) | проверено частично | Карточка связанного этапа, целевая сверка фактов | Старые разрешения/результаты не подтверждают текущий VPS |
| [docs/tasks/T223.md](../docs/tasks/T223.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T224.md](../docs/tasks/T224.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T225.md](../docs/tasks/T225.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T225a.md](../docs/tasks/T225a.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T226.md](../docs/tasks/T226.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T226a.md](../docs/tasks/T226a.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T227.md](../docs/tasks/T227.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T228.md](../docs/tasks/T228.md) | не проверено | Историческая карточка инвентаризирована; полный rereview не проводился | Не исполняемый модуль; действующий scope в текущей матрице |
| [docs/tasks/T229.md](../docs/tasks/T229.md) | проверено частично | Карточка связанного этапа, целевая сверка фактов | Старые разрешения/результаты не подтверждают текущий VPS |
| [docs/tasks/T230.md](../docs/tasks/T230.md) | проверено частично | Карточка связанного этапа, целевая сверка фактов | Старые разрешения/результаты не подтверждают текущий VPS |

## licenses

| Файл | Статус | Способ проверки | Ограничение |
|---|---|---|---|
| [licenses/material-symbols-LICENSE.txt](../licenses/material-symbols-LICENSE.txt) | проверено частично | Назначение/лицензия/включение в сборку | Artwork/сторонняя лицензия не аудит алгоритмов |

## migrations

| Файл | Статус | Способ проверки | Ограничение |
|---|---|---|---|
| [migrations/001_foundation.sql](../migrations/001_foundation.sql) | проверено | SQL/grants/RLS/FK/indexes/checksums + isolated PostgreSQL tests | Схема/роли production не проверены |
| [migrations/002_accounts.sql](../migrations/002_accounts.sql) | проверено | SQL/grants/RLS/FK/indexes/checksums + isolated PostgreSQL tests | Схема/роли production не проверены |
| [migrations/003_profile_weight.sql](../migrations/003_profile_weight.sql) | проверено | SQL/grants/RLS/FK/indexes/checksums + isolated PostgreSQL tests | Схема/роли production не проверены |
| [migrations/004_nutrition.sql](../migrations/004_nutrition.sql) | проверено | SQL/grants/RLS/FK/indexes/checksums + isolated PostgreSQL tests | Схема/роли production не проверены |
| [migrations/005_commands.sql](../migrations/005_commands.sql) | проверено | SQL/grants/RLS/FK/indexes/checksums + isolated PostgreSQL tests | Схема/роли production не проверены |
| [migrations/006_activity.sql](../migrations/006_activity.sql) | проверено | SQL/grants/RLS/FK/indexes/checksums + isolated PostgreSQL tests | Схема/роли production не проверены |
| [migrations/007_attachments.sql](../migrations/007_attachments.sql) | проверено | SQL/grants/RLS/FK/indexes/checksums + isolated PostgreSQL tests | Схема/роли production не проверены |
| [migrations/008_settings.sql](../migrations/008_settings.sql) | проверено | SQL/grants/RLS/FK/indexes/checksums + isolated PostgreSQL tests | Схема/роли production не проверены |
| [migrations/009_visibility_presence.sql](../migrations/009_visibility_presence.sql) | проверено | SQL/grants/RLS/FK/indexes/checksums + isolated PostgreSQL tests | Схема/роли production не проверены |
| [migrations/010_diary_revision.sql](../migrations/010_diary_revision.sql) | проверено | SQL/grants/RLS/FK/indexes/checksums + isolated PostgreSQL tests | Схема/роли production не проверены |
| [migrations/011_registration.sql](../migrations/011_registration.sql) | проверено | SQL/grants/RLS/FK/indexes/checksums + isolated PostgreSQL tests | Схема/роли production не проверены |
| [migrations/012_account_email.sql](../migrations/012_account_email.sql) | проверено | SQL/grants/RLS/FK/indexes/checksums + isolated PostgreSQL tests | Схема/роли production не проверены |
| [migrations/013_email_operations.sql](../migrations/013_email_operations.sql) | проверено | SQL/grants/RLS/FK/indexes/checksums + isolated PostgreSQL tests | Схема/роли production не проверены |
| [migrations/014_email_binding.sql](../migrations/014_email_binding.sql) | проверено | SQL/grants/RLS/FK/indexes/checksums + isolated PostgreSQL tests | Схема/роли production не проверены |
| [migrations/015_auth_rate_limits.sql](../migrations/015_auth_rate_limits.sql) | проверено | SQL/grants/RLS/FK/indexes/checksums + isolated PostgreSQL tests | Схема/роли production не проверены |

## public

| Файл | Статус | Способ проверки | Ограничение |
|---|---|---|---|
| [public/assets/Roboto-LICENSE.txt](../public/assets/Roboto-LICENSE.txt) | проверено частично | Назначение/лицензия/включение в сборку | Artwork/сторонняя лицензия не аудит алгоритмов |
| [public/favicon.svg](../public/favicon.svg) | проверено частично | Назначение/лицензия/включение в сборку | Artwork/сторонняя лицензия не аудит алгоритмов |

## root

| Файл | Статус | Способ проверки | Ограничение |
|---|---|---|---|
| [.env.example](../.env.example) | проверено | Конфигурация/entry/script и штатный gate по назначению | Удалённое окружение/clean-install не подтверждены |
| [.gitignore](../.gitignore) | проверено | Конфигурация/entry/script и штатный gate по назначению | Удалённое окружение/clean-install не подтверждены |
| [.npmrc](../.npmrc) | проверено | Конфигурация/entry/script и штатный gate по назначению | Удалённое окружение/clean-install не подтверждены |
| [.nvmrc](../.nvmrc) | проверено | Конфигурация/entry/script и штатный gate по назначению | Удалённое окружение/clean-install не подтверждены |
| [AGENTS.md](../AGENTS.md) | проверено | Инструкции/контракты/требования сопоставлены с кодом | Старые production утверждения только исторические |
| [IDEAS.md](../IDEAS.md) | проверено частично | Навигация/относящиеся исторические разделы | Не все исторические записи перечитаны |
| [README.md](../README.md) | проверено | Инструкции/контракты/требования сопоставлены с кодом | Старые production утверждения только исторические |
| [REFACTORING_PLAN.md](../REFACTORING_PLAN.md) | проверено | Инструкции/контракты/требования сопоставлены с кодом | Старые production утверждения только исторические |
| [START_ONE_TASK.md](../START_ONE_TASK.md) | проверено частично | Навигация/относящиеся исторические разделы | Не все исторические записи перечитаны |
| [TASKS.md](../TASKS.md) | проверено | Инструкции/контракты/требования сопоставлены с кодом | Старые production утверждения только исторические |
| [eslint.config.mjs](../eslint.config.mjs) | проверено | Конфигурация/entry/script и штатный gate по назначению | Удалённое окружение/clean-install не подтверждены |
| [index.html](../index.html) | проверено | Конфигурация/entry/script и штатный gate по назначению | Удалённое окружение/clean-install не подтверждены |
| [package-lock.json](../package-lock.json) | проверено | Metadata lock v3/516packages/integrity/manifest + npm audit | Реализация сторонних пакетов исключена |
| [package.json](../package.json) | проверено | Конфигурация/entry/script и штатный gate по назначению | Удалённое окружение/clean-install не подтверждены |
| [playwright.config.ts](../playwright.config.ts) | проверено | Конфигурация/entry/script и штатный gate по назначению | Удалённое окружение/clean-install не подтверждены |
| [tsconfig.browser.json](../tsconfig.browser.json) | проверено | Конфигурация/entry/script и штатный gate по назначению | Удалённое окружение/clean-install не подтверждены |
| [tsconfig.json](../tsconfig.json) | проверено | Конфигурация/entry/script и штатный gate по назначению | Удалённое окружение/clean-install не подтверждены |
| [tsconfig.server.json](../tsconfig.server.json) | проверено | Конфигурация/entry/script и штатный gate по назначению | Удалённое окружение/clean-install не подтверждены |
| [vite.config.ts](../vite.config.ts) | проверено | Конфигурация/entry/script и штатный gate по назначению | Удалённое окружение/clean-install не подтверждены |
| [vite.server.config.ts](../vite.server.config.ts) | проверено | Конфигурация/entry/script и штатный gate по назначению | Удалённое окружение/clean-install не подтверждены |
| [vitest.browser.config.ts](../vitest.browser.config.ts) | проверено | Конфигурация/entry/script и штатный gate по назначению | Удалённое окружение/clean-install не подтверждены |

## scripts

| Файл | Статус | Способ проверки | Ограничение |
|---|---|---|---|
| [scripts/check-docs.mjs](../scripts/check-docs.mjs) | проверено | Конфигурация/entry/script и штатный gate по назначению | Удалённое окружение/clean-install не подтверждены |

## src

| Файл | Статус | Способ проверки | Ограничение |
|---|---|---|---|
| [src/App.browser.test.tsx](../src/App.browser.test.tsx) | проверено частично | Browser91 PASS; inventory и выбранные assertions/callers | Не каждая строка теста прочитана; часть fixtures legacy alias |
| [src/App.test.tsx](../src/App.test.tsx) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/App.tsx](../src/App.tsx) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/activity.css](../src/activity.css) | проверено частично | Static CSS + responsive/keyboard/axe Chromium suites | Без ручного pixel/screen reader review |
| [src/chart.css](../src/chart.css) | проверено частично | Static CSS + responsive/keyboard/axe Chromium suites | Без ручного pixel/screen reader review |
| [src/dataAccess.ts](../src/dataAccess.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/documents.css](../src/documents.css) | проверено частично | Static CSS + responsive/keyboard/axe Chromium suites | Без ручного pixel/screen reader review |
| [src/lab-trends.css](../src/lab-trends.css) | проверено частично | Static CSS + responsive/keyboard/axe Chromium suites | Без ручного pixel/screen reader review |
| [src/macro-charts.css](../src/macro-charts.css) | проверено частично | Static CSS + responsive/keyboard/axe Chromium suites | Без ручного pixel/screen reader review |
| [src/main.tsx](../src/main.tsx) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/nutrition.css](../src/nutrition.css) | проверено частично | Static CSS + responsive/keyboard/axe Chromium suites | Без ручного pixel/screen reader review |
| [src/photos.css](../src/photos.css) | проверено частично | Static CSS + responsive/keyboard/axe Chromium suites | Без ручного pixel/screen reader review |
| [src/profile.css](../src/profile.css) | проверено частично | Static CSS + responsive/keyboard/axe Chromium suites | Без ручного pixel/screen reader review |
| [src/settings.css](../src/settings.css) | проверено частично | Static CSS + responsive/keyboard/axe Chromium suites | Без ручного pixel/screen reader review |
| [src/shell.css](../src/shell.css) | проверено частично | Static CSS + responsive/keyboard/axe Chromium suites | Без ручного pixel/screen reader review |
| [src/styles.css](../src/styles.css) | проверено частично | Static CSS + responsive/keyboard/axe Chromium suites | Без ручного pixel/screen reader review |
| [src/today.css](../src/today.css) | проверено частично | Static CSS + responsive/keyboard/axe Chromium suites | Без ручного pixel/screen reader review |
| [src/weight.css](../src/weight.css) | проверено частично | Static CSS + responsive/keyboard/axe Chromium suites | Без ручного pixel/screen reader review |

## src/client

| Файл | Статус | Способ проверки | Ограничение |
|---|---|---|---|
| [src/client/AuthBoundary.test.tsx](../src/client/AuthBoundary.test.tsx) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/client/AuthBoundary.tsx](../src/client/AuthBoundary.tsx) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/client/EmailBinding.test.tsx](../src/client/EmailBinding.test.tsx) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/client/EmailBinding.tsx](../src/client/EmailBinding.tsx) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/client/PasswordRecovery.test.tsx](../src/client/PasswordRecovery.test.tsx) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/client/PasswordRecovery.tsx](../src/client/PasswordRecovery.tsx) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/client/QueryFeedback.tsx](../src/client/QueryFeedback.tsx) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/client/RegistrationForm.test.tsx](../src/client/RegistrationForm.test.tsx) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/client/RegistrationForm.tsx](../src/client/RegistrationForm.tsx) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/client/accountChanges.test.ts](../src/client/accountChanges.test.ts) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/client/accountChanges.ts](../src/client/accountChanges.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/client/auth.css](../src/client/auth.css) | проверено частично | Static CSS + responsive/keyboard/axe Chromium suites | Без ручного pixel/screen reader review |
| [src/client/auth.test.ts](../src/client/auth.test.ts) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/client/auth.ts](../src/client/auth.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/client/backupRepository.test.ts](../src/client/backupRepository.test.ts) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/client/backupRepository.ts](../src/client/backupRepository.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/client/commands.test.ts](../src/client/commands.test.ts) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/client/commands.ts](../src/client/commands.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/client/confirmations.ts](../src/client/confirmations.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/client/coreRepositories.test.ts](../src/client/coreRepositories.test.ts) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/client/diaryRepositories.test.ts](../src/client/diaryRepositories.test.ts) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/client/documentRepository.ts](../src/client/documentRepository.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/client/emailRecovery.ts](../src/client/emailRecovery.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/client/energyPlanRepository.ts](../src/client/energyPlanRepository.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/client/fileRepository.test.ts](../src/client/fileRepository.test.ts) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/client/fileRepository.ts](../src/client/fileRepository.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/client/foodRepository.ts](../src/client/foodRepository.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/client/http.test.ts](../src/client/http.test.ts) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/client/http.ts](../src/client/http.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/client/labHistoryRepository.ts](../src/client/labHistoryRepository.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/client/labRepository.ts](../src/client/labRepository.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/client/mediaRepositories.test.ts](../src/client/mediaRepositories.test.ts) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/client/mutations.ts](../src/client/mutations.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/client/notices.test.tsx](../src/client/notices.test.tsx) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/client/notices.ts](../src/client/notices.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/client/nutritionRepository.ts](../src/client/nutritionRepository.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/client/pages.test.ts](../src/client/pages.test.ts) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/client/pages.ts](../src/client/pages.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/client/photoRepository.ts](../src/client/photoRepository.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/client/productRepository.ts](../src/client/productRepository.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/client/profileRepository.ts](../src/client/profileRepository.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/client/queries.ts](../src/client/queries.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/client/readState.ts](../src/client/readState.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/client/records.test.ts](../src/client/records.test.ts) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/client/records.ts](../src/client/records.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/client/session.ts](../src/client/session.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/client/stepsRepository.ts](../src/client/stepsRepository.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/client/summaries.test.ts](../src/client/summaries.test.ts) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/client/summaries.ts](../src/client/summaries.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/client/upload.ts](../src/client/upload.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/client/useDiaryQuery.test.tsx](../src/client/useDiaryQuery.test.tsx) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/client/useDiaryQuery.ts](../src/client/useDiaryQuery.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/client/visibilityRepository.ts](../src/client/visibilityRepository.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/client/weightRepository.ts](../src/client/weightRepository.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/client/workoutRepository.ts](../src/client/workoutRepository.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |

## src/data

| Файл | Статус | Способ проверки | Ограничение |
|---|---|---|---|
| [src/data/backupRepository.test.ts](../src/data/backupRepository.test.ts) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/data/backupRepository.ts](../src/data/backupRepository.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/data/clearDiary.test.ts](../src/data/clearDiary.test.ts) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/data/clearDiary.ts](../src/data/clearDiary.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/data/db.test.ts](../src/data/db.test.ts) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/data/db.ts](../src/data/db.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/data/documentRepository.browser.test.tsx](../src/data/documentRepository.browser.test.tsx) | проверено частично | Browser91 PASS; inventory и выбранные assertions/callers | Не каждая строка теста прочитана; часть fixtures legacy alias |
| [src/data/documentRepository.test.ts](../src/data/documentRepository.test.ts) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/data/documentRepository.ts](../src/data/documentRepository.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/data/energyPlanRepository.test.ts](../src/data/energyPlanRepository.test.ts) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/data/energyPlanRepository.ts](../src/data/energyPlanRepository.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/data/fileRepository.browser.test.tsx](../src/data/fileRepository.browser.test.tsx) | проверено частично | Browser91 PASS; inventory и выбранные assertions/callers | Не каждая строка теста прочитана; часть fixtures legacy alias |
| [src/data/fileRepository.test.ts](../src/data/fileRepository.test.ts) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/data/fileRepository.ts](../src/data/fileRepository.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/data/foodRepository.test.ts](../src/data/foodRepository.test.ts) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/data/foodRepository.ts](../src/data/foodRepository.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/data/fullBackupRepository.test.ts](../src/data/fullBackupRepository.test.ts) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/data/fullBackupRepository.ts](../src/data/fullBackupRepository.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/data/fullBackupRestore.test.ts](../src/data/fullBackupRestore.test.ts) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/data/labHistoryRepository.test.ts](../src/data/labHistoryRepository.test.ts) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/data/labHistoryRepository.ts](../src/data/labHistoryRepository.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/data/labRepository.browser.test.tsx](../src/data/labRepository.browser.test.tsx) | проверено частично | Browser91 PASS; inventory и выбранные assertions/callers | Не каждая строка теста прочитана; часть fixtures legacy alias |
| [src/data/labRepository.test.ts](../src/data/labRepository.test.ts) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/data/labRepository.ts](../src/data/labRepository.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/data/mutationGeneration.browser.test.tsx](../src/data/mutationGeneration.browser.test.tsx) | проверено частично | Browser91 PASS; inventory и выбранные assertions/callers | Не каждая строка теста прочитана; часть fixtures legacy alias |
| [src/data/mutationGeneration.test.ts](../src/data/mutationGeneration.test.ts) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/data/nutritionRepository.test.ts](../src/data/nutritionRepository.test.ts) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/data/nutritionRepository.ts](../src/data/nutritionRepository.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/data/photoRepository.browser.test.tsx](../src/data/photoRepository.browser.test.tsx) | проверено частично | Browser91 PASS; inventory и выбранные assertions/callers | Не каждая строка теста прочитана; часть fixtures legacy alias |
| [src/data/photoRepository.test.ts](../src/data/photoRepository.test.ts) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/data/photoRepository.ts](../src/data/photoRepository.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/data/productRepository.test.ts](../src/data/productRepository.test.ts) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/data/productRepository.ts](../src/data/productRepository.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/data/profile-migration.test.ts](../src/data/profile-migration.test.ts) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/data/profileRepository.test.ts](../src/data/profileRepository.test.ts) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/data/profileRepository.ts](../src/data/profileRepository.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/data/recordLimit.ts](../src/data/recordLimit.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/data/recordLimitAttachments.test.ts](../src/data/recordLimitAttachments.test.ts) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/data/recordLimitBoundary.test.ts](../src/data/recordLimitBoundary.test.ts) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/data/recordLimitCatalog.test.ts](../src/data/recordLimitCatalog.test.ts) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/data/recordLimitJournals.test.ts](../src/data/recordLimitJournals.test.ts) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/data/stepsRepository.test.ts](../src/data/stepsRepository.test.ts) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/data/stepsRepository.ts](../src/data/stepsRepository.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/data/visibilityRepository.browser.test.tsx](../src/data/visibilityRepository.browser.test.tsx) | проверено частично | Browser91 PASS; inventory и выбранные assertions/callers | Не каждая строка теста прочитана; часть fixtures legacy alias |
| [src/data/visibilityRepository.test.ts](../src/data/visibilityRepository.test.ts) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/data/visibilityRepository.ts](../src/data/visibilityRepository.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/data/weightRepository.test.ts](../src/data/weightRepository.test.ts) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/data/weightRepository.ts](../src/data/weightRepository.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/data/workoutRepository.test.ts](../src/data/workoutRepository.test.ts) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/data/workoutRepository.ts](../src/data/workoutRepository.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |

## src/domain

| Файл | Статус | Способ проверки | Ограничение |
|---|---|---|---|
| [src/domain/activity.test.ts](../src/domain/activity.test.ts) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/domain/activity.ts](../src/domain/activity.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/domain/activityOverview.test.ts](../src/domain/activityOverview.test.ts) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/domain/activityOverview.ts](../src/domain/activityOverview.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/domain/attachment.browser.test.tsx](../src/domain/attachment.browser.test.tsx) | проверено частично | Browser91 PASS; inventory и выбранные assertions/callers | Не каждая строка теста прочитана; часть fixtures legacy alias |
| [src/domain/attachment.test.ts](../src/domain/attachment.test.ts) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/domain/attachment.ts](../src/domain/attachment.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/domain/backup.test.ts](../src/domain/backup.test.ts) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/domain/backup.ts](../src/domain/backup.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/domain/base64.test.ts](../src/domain/base64.test.ts) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/domain/base64.ts](../src/domain/base64.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/domain/bmi.test.ts](../src/domain/bmi.test.ts) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/domain/bmi.ts](../src/domain/bmi.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/domain/document.test.ts](../src/domain/document.test.ts) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/domain/document.ts](../src/domain/document.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/domain/emailAccount.test.ts](../src/domain/emailAccount.test.ts) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/domain/emailAccount.ts](../src/domain/emailAccount.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/domain/energy.test.ts](../src/domain/energy.test.ts) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/domain/energy.ts](../src/domain/energy.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/domain/energyPlan.test.ts](../src/domain/energyPlan.test.ts) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/domain/energyPlan.ts](../src/domain/energyPlan.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/domain/fullBackup.browser.test.tsx](../src/domain/fullBackup.browser.test.tsx) | проверено частично | Browser91 PASS; inventory и выбранные assertions/callers | Не каждая строка теста прочитана; часть fixtures legacy alias |
| [src/domain/fullBackup.test.ts](../src/domain/fullBackup.test.ts) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/domain/fullBackup.ts](../src/domain/fullBackup.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/domain/imageGeometry.test.ts](../src/domain/imageGeometry.test.ts) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/domain/imageGeometry.ts](../src/domain/imageGeometry.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/domain/imageHeader.test.ts](../src/domain/imageHeader.test.ts) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/domain/imageHeader.ts](../src/domain/imageHeader.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/domain/initialProducts.ts](../src/domain/initialProducts.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/domain/input.test.ts](../src/domain/input.test.ts) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/domain/input.ts](../src/domain/input.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/domain/labPlot.test.ts](../src/domain/labPlot.test.ts) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/domain/labPlot.ts](../src/domain/labPlot.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/domain/labResult.test.ts](../src/domain/labResult.test.ts) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/domain/labResult.ts](../src/domain/labResult.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/domain/nutrition.test.ts](../src/domain/nutrition.test.ts) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/domain/nutrition.ts](../src/domain/nutrition.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/domain/photo.test.ts](../src/domain/photo.test.ts) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/domain/photo.ts](../src/domain/photo.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/domain/photoExif.test.ts](../src/domain/photoExif.test.ts) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/domain/photoExif.ts](../src/domain/photoExif.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/domain/profile.test.ts](../src/domain/profile.test.ts) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/domain/profile.ts](../src/domain/profile.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/domain/registration.ts](../src/domain/registration.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/domain/restingEnergy.test.ts](../src/domain/restingEnergy.test.ts) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/domain/restingEnergy.ts](../src/domain/restingEnergy.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/domain/schema.ts](../src/domain/schema.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/domain/session.ts](../src/domain/session.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/domain/storedFile.test.ts](../src/domain/storedFile.test.ts) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/domain/storedFile.ts](../src/domain/storedFile.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/domain/visibility.test.ts](../src/domain/visibility.test.ts) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/domain/visibility.ts](../src/domain/visibility.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/domain/weightPlot.test.ts](../src/domain/weightPlot.test.ts) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/domain/weightPlot.ts](../src/domain/weightPlot.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |

## src/legacy

| Файл | Статус | Способ проверки | Ограничение |
|---|---|---|---|
| [src/legacy/browserExport.test.ts](../src/legacy/browserExport.test.ts) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/legacy/browserExport.ts](../src/legacy/browserExport.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/legacy/dataAccess.ts](../src/legacy/dataAccess.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/legacy/summaries.ts](../src/legacy/summaries.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |

## src/media

| Файл | Статус | Способ проверки | Ограничение |
|---|---|---|---|
| [src/media/checkBackupFile.test.ts](../src/media/checkBackupFile.test.ts) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/media/checkBackupFile.ts](../src/media/checkBackupFile.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/media/fullBackupFile.test.ts](../src/media/fullBackupFile.test.ts) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/media/fullBackupFile.ts](../src/media/fullBackupFile.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/media/prepareDocument.test.ts](../src/media/prepareDocument.test.ts) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/media/prepareDocument.ts](../src/media/prepareDocument.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/media/prepareFile.ts](../src/media/prepareFile.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/media/preparePhoto.browser.test.tsx](../src/media/preparePhoto.browser.test.tsx) | проверено частично | Browser91 PASS; inventory и выбранные assertions/callers | Не каждая строка теста прочитана; часть fixtures legacy alias |
| [src/media/preparePhoto.test.ts](../src/media/preparePhoto.test.ts) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/media/preparePhoto.ts](../src/media/preparePhoto.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |

## src/pages

| Файл | Статус | Способ проверки | Ограничение |
|---|---|---|---|
| [src/pages/AGENTS.md](../src/pages/AGENTS.md) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/pages/ActivityPage.browser.test.tsx](../src/pages/ActivityPage.browser.test.tsx) | проверено частично | Browser91 PASS; inventory и выбранные assertions/callers | Не каждая строка теста прочитана; часть fixtures legacy alias |
| [src/pages/ActivityPage.tsx](../src/pages/ActivityPage.tsx) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/pages/BrowserDiaryExport.tsx](../src/pages/BrowserDiaryExport.tsx) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/pages/CatalogLimit.browser.test.tsx](../src/pages/CatalogLimit.browser.test.tsx) | проверено частично | Browser91 PASS; inventory и выбранные assertions/callers | Не каждая строка теста прочитана; часть fixtures legacy alias |
| [src/pages/CopyMealForm.test.tsx](../src/pages/CopyMealForm.test.tsx) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/pages/CopyMealForm.tsx](../src/pages/CopyMealForm.tsx) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/pages/DeleteDiary.browser.test.tsx](../src/pages/DeleteDiary.browser.test.tsx) | проверено частично | Browser91 PASS; inventory и выбранные assertions/callers | Не каждая строка теста прочитана; часть fixtures legacy alias |
| [src/pages/DeleteDiary.test.tsx](../src/pages/DeleteDiary.test.tsx) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/pages/DeleteDiary.tsx](../src/pages/DeleteDiary.tsx) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/pages/DeletionFocus.browser.test.tsx](../src/pages/DeletionFocus.browser.test.tsx) | проверено частично | Browser91 PASS; inventory и выбранные assertions/callers | Не каждая строка теста прочитана; часть fixtures legacy alias |
| [src/pages/DocumentFile.browser.test.tsx](../src/pages/DocumentFile.browser.test.tsx) | проверено частично | Browser91 PASS; inventory и выбранные assertions/callers | Не каждая строка теста прочитана; часть fixtures legacy alias |
| [src/pages/DocumentFile.test.tsx](../src/pages/DocumentFile.test.tsx) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/pages/DocumentFile.tsx](../src/pages/DocumentFile.tsx) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/pages/DocumentForm.tsx](../src/pages/DocumentForm.tsx) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/pages/DocumentLimit.browser.test.tsx](../src/pages/DocumentLimit.browser.test.tsx) | проверено частично | Browser91 PASS; inventory и выбранные assertions/callers | Не каждая строка теста прочитана; часть fixtures legacy alias |
| [src/pages/DocumentList.tsx](../src/pages/DocumentList.tsx) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/pages/DocumentsPage.browser.test.tsx](../src/pages/DocumentsPage.browser.test.tsx) | проверено частично | Browser91 PASS; inventory и выбранные assertions/callers | Не каждая строка теста прочитана; часть fixtures legacy alias |
| [src/pages/DocumentsPage.test.tsx](../src/pages/DocumentsPage.test.tsx) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/pages/DocumentsPage.tsx](../src/pages/DocumentsPage.tsx) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/pages/EnergyPlanForm.test.tsx](../src/pages/EnergyPlanForm.test.tsx) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/pages/EnergyPlanForm.tsx](../src/pages/EnergyPlanForm.tsx) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/pages/EnergyPlanSettings.browser.test.tsx](../src/pages/EnergyPlanSettings.browser.test.tsx) | проверено частично | Browser91 PASS; inventory и выбранные assertions/callers | Не каждая строка теста прочитана; часть fixtures legacy alias |
| [src/pages/EnergyPlanSettings.tsx](../src/pages/EnergyPlanSettings.tsx) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/pages/ExactValues.browser.test.tsx](../src/pages/ExactValues.browser.test.tsx) | проверено частично | Browser91 PASS; inventory и выбранные assertions/callers | Не каждая строка теста прочитана; часть fixtures legacy alias |
| [src/pages/FoodForm.test.tsx](../src/pages/FoodForm.test.tsx) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/pages/FoodForm.tsx](../src/pages/FoodForm.tsx) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/pages/FoodJournal.test.tsx](../src/pages/FoodJournal.test.tsx) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/pages/FoodJournal.tsx](../src/pages/FoodJournal.tsx) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/pages/FullBackupExport.browser.test.tsx](../src/pages/FullBackupExport.browser.test.tsx) | проверено частично | Browser91 PASS; inventory и выбранные assertions/callers | Не каждая строка теста прочитана; часть fixtures legacy alias |
| [src/pages/FullBackupExport.test.tsx](../src/pages/FullBackupExport.test.tsx) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/pages/FullBackupExport.tsx](../src/pages/FullBackupExport.tsx) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/pages/FullBackupImport.browser.test.tsx](../src/pages/FullBackupImport.browser.test.tsx) | проверено частично | Browser91 PASS; inventory и выбранные assertions/callers | Не каждая строка теста прочитана; часть fixtures legacy alias |
| [src/pages/FullBackupImport.test.tsx](../src/pages/FullBackupImport.test.tsx) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/pages/FullBackupImport.tsx](../src/pages/FullBackupImport.tsx) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/pages/FullBackupRestore.browser.test.tsx](../src/pages/FullBackupRestore.browser.test.tsx) | проверено частично | Browser91 PASS; inventory и выбранные assertions/callers | Не каждая строка теста прочитана; часть fixtures legacy alias |
| [src/pages/LabForm.tsx](../src/pages/LabForm.tsx) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/pages/LabList.tsx](../src/pages/LabList.tsx) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/pages/LabSection.browser.test.tsx](../src/pages/LabSection.browser.test.tsx) | проверено частично | Browser91 PASS; inventory и выбранные assertions/callers | Не каждая строка теста прочитана; часть fixtures legacy alias |
| [src/pages/LabSection.test.tsx](../src/pages/LabSection.test.tsx) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/pages/LabSection.tsx](../src/pages/LabSection.tsx) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/pages/LabTrends.test.tsx](../src/pages/LabTrends.test.tsx) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/pages/LabTrends.tsx](../src/pages/LabTrends.tsx) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/pages/NutritionPage.browser.test.tsx](../src/pages/NutritionPage.browser.test.tsx) | проверено частично | Browser91 PASS; inventory и выбранные assertions/callers | Не каждая строка теста прочитана; часть fixtures legacy alias |
| [src/pages/NutritionPage.tsx](../src/pages/NutritionPage.tsx) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/pages/PendingEditors.browser.test.tsx](../src/pages/PendingEditors.browser.test.tsx) | проверено частично | Browser91 PASS; inventory и выбранные assertions/callers | Не каждая строка теста прочитана; часть fixtures legacy alias |
| [src/pages/PendingEditors.test.tsx](../src/pages/PendingEditors.test.tsx) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/pages/PhotoComparison.browser.test.tsx](../src/pages/PhotoComparison.browser.test.tsx) | проверено частично | Browser91 PASS; inventory и выбранные assertions/callers | Не каждая строка теста прочитана; часть fixtures legacy alias |
| [src/pages/PhotoComparison.test.tsx](../src/pages/PhotoComparison.test.tsx) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/pages/PhotoComparison.tsx](../src/pages/PhotoComparison.tsx) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/pages/PhotoForm.tsx](../src/pages/PhotoForm.tsx) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/pages/PhotoGallery.tsx](../src/pages/PhotoGallery.tsx) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/pages/PhotosPage.browser.test.tsx](../src/pages/PhotosPage.browser.test.tsx) | проверено частично | Browser91 PASS; inventory и выбранные assertions/callers | Не каждая строка теста прочитана; часть fixtures legacy alias |
| [src/pages/PhotosPage.test.tsx](../src/pages/PhotosPage.test.tsx) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/pages/PhotosPage.tsx](../src/pages/PhotosPage.tsx) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/pages/PrivacySettings.browser.test.tsx](../src/pages/PrivacySettings.browser.test.tsx) | проверено частично | Browser91 PASS; inventory и выбранные assertions/callers | Не каждая строка теста прочитана; часть fixtures legacy alias |
| [src/pages/PrivacySettings.test.tsx](../src/pages/PrivacySettings.test.tsx) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/pages/PrivacySettings.tsx](../src/pages/PrivacySettings.tsx) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/pages/ProductCatalog.tsx](../src/pages/ProductCatalog.tsx) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/pages/ProductForm.test.tsx](../src/pages/ProductForm.test.tsx) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/pages/ProductForm.tsx](../src/pages/ProductForm.tsx) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/pages/ProfilePage.browser.test.tsx](../src/pages/ProfilePage.browser.test.tsx) | проверено частично | Browser91 PASS; inventory и выбранные assertions/callers | Не каждая строка теста прочитана; часть fixtures legacy alias |
| [src/pages/ProfilePage.test.tsx](../src/pages/ProfilePage.test.tsx) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/pages/ProfilePage.tsx](../src/pages/ProfilePage.tsx) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/pages/RecordFocus.browser.test.tsx](../src/pages/RecordFocus.browser.test.tsx) | проверено частично | Browser91 PASS; inventory и выбранные assertions/callers | Не каждая строка теста прочитана; часть fixtures legacy alias |
| [src/pages/RecordFocus.test.tsx](../src/pages/RecordFocus.test.tsx) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/pages/SettingsPage.browser.test.tsx](../src/pages/SettingsPage.browser.test.tsx) | проверено частично | Browser91 PASS; inventory и выбранные assertions/callers | Не каждая строка теста прочитана; часть fixtures legacy alias |
| [src/pages/SettingsPage.test.tsx](../src/pages/SettingsPage.test.tsx) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/pages/SettingsPage.tsx](../src/pages/SettingsPage.tsx) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/pages/StepsForm.test.tsx](../src/pages/StepsForm.test.tsx) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/pages/StepsForm.tsx](../src/pages/StepsForm.tsx) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/pages/StepsLimit.browser.test.tsx](../src/pages/StepsLimit.browser.test.tsx) | проверено частично | Browser91 PASS; inventory и выбранные assertions/callers | Не каждая строка теста прочитана; часть fixtures legacy alias |
| [src/pages/TodayPage.test.tsx](../src/pages/TodayPage.test.tsx) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/pages/TodayPage.tsx](../src/pages/TodayPage.tsx) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/pages/WeightPage.browser.test.tsx](../src/pages/WeightPage.browser.test.tsx) | проверено частично | Browser91 PASS; inventory и выбранные assertions/callers | Не каждая строка теста прочитана; часть fixtures legacy alias |
| [src/pages/WeightPage.test.tsx](../src/pages/WeightPage.test.tsx) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/pages/WeightPage.tsx](../src/pages/WeightPage.tsx) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/pages/WorkoutForm.test.tsx](../src/pages/WorkoutForm.test.tsx) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/pages/WorkoutForm.tsx](../src/pages/WorkoutForm.tsx) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/pages/WorkoutJournal.browser.test.tsx](../src/pages/WorkoutJournal.browser.test.tsx) | проверено частично | Browser91 PASS; inventory и выбранные assertions/callers | Не каждая строка теста прочитана; часть fixtures legacy alias |
| [src/pages/WorkoutJournal.tsx](../src/pages/WorkoutJournal.tsx) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/pages/WorkoutPending.test.tsx](../src/pages/WorkoutPending.test.tsx) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |

## src/server

| Файл | Статус | Способ проверки | Ограничение |
|---|---|---|---|
| [src/server/AGENTS.md](../src/server/AGENTS.md) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/server/accountEmailSchema.test.ts](../src/server/accountEmailSchema.test.ts) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/server/accountMail.test.ts](../src/server/accountMail.test.ts) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/server/accountMail.ts](../src/server/accountMail.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/server/accounts.test.ts](../src/server/accounts.test.ts) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/server/accounts.ts](../src/server/accounts.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/server/accountsSchema.test.ts](../src/server/accountsSchema.test.ts) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/server/activityCommands.test.ts](../src/server/activityCommands.test.ts) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/server/activitySchema.test.ts](../src/server/activitySchema.test.ts) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/server/app.test.ts](../src/server/app.test.ts) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/server/app.ts](../src/server/app.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/server/attachmentCommands.test.ts](../src/server/attachmentCommands.test.ts) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/server/attachmentValidation.test.ts](../src/server/attachmentValidation.test.ts) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/server/attachmentValidation.ts](../src/server/attachmentValidation.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/server/attachmentsSchema.test.ts](../src/server/attachmentsSchema.test.ts) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/server/auth.test.ts](../src/server/auth.test.ts) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/server/auth.ts](../src/server/auth.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/server/authRateLimit.test.ts](../src/server/authRateLimit.test.ts) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/server/authRateLimit.ts](../src/server/authRateLimit.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/server/backupRestore.test.ts](../src/server/backupRestore.test.ts) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/server/backupRoutes.test.ts](../src/server/backupRoutes.test.ts) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/server/backupRoutes.ts](../src/server/backupRoutes.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/server/backupTransport.ts](../src/server/backupTransport.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/server/clearRoutes.test.ts](../src/server/clearRoutes.test.ts) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/server/clearRoutes.ts](../src/server/clearRoutes.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/server/commands.ts](../src/server/commands.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/server/config.test.ts](../src/server/config.test.ts) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/server/config.ts](../src/server/config.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/server/createAccount.ts](../src/server/createAccount.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/server/database.ts](../src/server/database.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/server/demoBackup.test.ts](../src/server/demoBackup.test.ts) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/server/demoBackup.ts](../src/server/demoBackup.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/server/demoPdf.ts](../src/server/demoPdf.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/server/demoProducts.ts](../src/server/demoProducts.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/server/demoText.ts](../src/server/demoText.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/server/diaryState.ts](../src/server/diaryState.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/server/documentRecords.ts](../src/server/documentRecords.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/server/documentRoutes.test.ts](../src/server/documentRoutes.test.ts) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/server/documentRoutes.ts](../src/server/documentRoutes.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/server/emailAuth.test.ts](../src/server/emailAuth.test.ts) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/server/emailAuth.ts](../src/server/emailAuth.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/server/emailBinding.ts](../src/server/emailBinding.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/server/emailLoginBinding.test.ts](../src/server/emailLoginBinding.test.ts) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/server/emailOperations.test.ts](../src/server/emailOperations.test.ts) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/server/fileRecords.test.ts](../src/server/fileRecords.test.ts) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/server/fileRecords.ts](../src/server/fileRecords.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/server/foodRecords.ts](../src/server/foodRecords.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/server/foodRoutes.test.ts](../src/server/foodRoutes.test.ts) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/server/foodRoutes.ts](../src/server/foodRoutes.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/server/fullSnapshot.test.ts](../src/server/fullSnapshot.test.ts) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/server/fullSnapshot.ts](../src/server/fullSnapshot.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/server/httpErrors.ts](../src/server/httpErrors.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/server/httpSecurity.ts](../src/server/httpSecurity.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/server/importRequest.ts](../src/server/importRequest.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/server/importRows.ts](../src/server/importRows.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/server/journalCommands.test.ts](../src/server/journalCommands.test.ts) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/server/labRecords.ts](../src/server/labRecords.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/server/labRoutes.test.ts](../src/server/labRoutes.test.ts) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/server/labRoutes.ts](../src/server/labRoutes.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/server/main.ts](../src/server/main.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/server/migrate.ts](../src/server/migrate.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/server/migrations.test.ts](../src/server/migrations.test.ts) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/server/migrations.ts](../src/server/migrations.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/server/nutritionRecords.ts](../src/server/nutritionRecords.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/server/nutritionRoutes.test.ts](../src/server/nutritionRoutes.test.ts) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/server/nutritionRoutes.ts](../src/server/nutritionRoutes.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/server/nutritionSchema.test.ts](../src/server/nutritionSchema.test.ts) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/server/photoRecords.ts](../src/server/photoRecords.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/server/photoRoutes.test.ts](../src/server/photoRoutes.test.ts) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/server/photoRoutes.ts](../src/server/photoRoutes.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/server/planRecords.ts](../src/server/planRecords.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/server/planRoutes.test.ts](../src/server/planRoutes.test.ts) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/server/planRoutes.ts](../src/server/planRoutes.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/server/prepareFullImport.test.ts](../src/server/prepareFullImport.test.ts) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/server/prepareFullImport.ts](../src/server/prepareFullImport.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/server/productRecords.ts](../src/server/productRecords.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/server/productRoutes.test.ts](../src/server/productRoutes.test.ts) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/server/productRoutes.ts](../src/server/productRoutes.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/server/profileRecords.ts](../src/server/profileRecords.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/server/profileRoutes.test.ts](../src/server/profileRoutes.test.ts) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/server/profileRoutes.ts](../src/server/profileRoutes.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/server/proxyIp.test.ts](../src/server/proxyIp.test.ts) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/server/readiness.test.ts](../src/server/readiness.test.ts) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/server/readiness.ts](../src/server/readiness.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/server/recordValidation.test.ts](../src/server/recordValidation.test.ts) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/server/recordValidation.ts](../src/server/recordValidation.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/server/registration.test.ts](../src/server/registration.test.ts) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/server/registrationRoutes.test.ts](../src/server/registrationRoutes.test.ts) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/server/restoreFull.test.ts](../src/server/restoreFull.test.ts) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/server/restoreFull.ts](../src/server/restoreFull.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/server/restoreText.test.ts](../src/server/restoreText.test.ts) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/server/restoreText.ts](../src/server/restoreText.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/server/restoredAccess.test.ts](../src/server/restoredAccess.test.ts) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/server/runtime.test.ts](../src/server/runtime.test.ts) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/server/runtime.ts](../src/server/runtime.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/server/seedDemo.ts](../src/server/seedDemo.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/server/seedProducts.test.ts](../src/server/seedProducts.test.ts) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/server/seedProducts.ts](../src/server/seedProducts.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/server/seedRecords.test.ts](../src/server/seedRecords.test.ts) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/server/seedRecords.ts](../src/server/seedRecords.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/server/sessions.test.ts](../src/server/sessions.test.ts) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/server/sessions.ts](../src/server/sessions.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/server/settingsRoutes.test.ts](../src/server/settingsRoutes.test.ts) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/server/settingsRoutes.ts](../src/server/settingsRoutes.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/server/stepsRecords.ts](../src/server/stepsRecords.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/server/stepsRoutes.test.ts](../src/server/stepsRoutes.test.ts) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/server/stepsRoutes.ts](../src/server/stepsRoutes.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/server/textInput.test.ts](../src/server/textInput.test.ts) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/server/textSnapshot.ts](../src/server/textSnapshot.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/server/transportDisconnect.test.ts](../src/server/transportDisconnect.test.ts) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/server/uploadTransport.ts](../src/server/uploadTransport.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/server/userTransaction.test.ts](../src/server/userTransaction.test.ts) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/server/userTransaction.ts](../src/server/userTransaction.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/server/weightRecords.ts](../src/server/weightRecords.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/server/weightRoutes.test.ts](../src/server/weightRoutes.test.ts) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/server/weightRoutes.ts](../src/server/weightRoutes.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/server/workoutRecords.ts](../src/server/workoutRecords.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/server/workoutRoutes.test.ts](../src/server/workoutRoutes.test.ts) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/server/workoutRoutes.ts](../src/server/workoutRoutes.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/server/writeCommand.test.ts](../src/server/writeCommand.test.ts) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/server/writeCommand.ts](../src/server/writeCommand.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |

## src/ui

| Файл | Статус | Способ проверки | Ограничение |
|---|---|---|---|
| [src/ui/ActivityOverview.tsx](../src/ui/ActivityOverview.tsx) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/ui/ActivitySummary.tsx](../src/ui/ActivitySummary.tsx) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/ui/BmiCard.test.tsx](../src/ui/BmiCard.test.tsx) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/ui/BmiCard.tsx](../src/ui/BmiCard.tsx) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/ui/Confirmation.test.tsx](../src/ui/Confirmation.test.tsx) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/ui/Confirmation.tsx](../src/ui/Confirmation.tsx) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/ui/DayContext.tsx](../src/ui/DayContext.tsx) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/ui/DayPicker.test.tsx](../src/ui/DayPicker.test.tsx) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/ui/DayPicker.tsx](../src/ui/DayPicker.tsx) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/ui/EnergySummary.browser.test.tsx](../src/ui/EnergySummary.browser.test.tsx) | проверено частично | Browser91 PASS; inventory и выбранные assertions/callers | Не каждая строка теста прочитана; часть fixtures legacy alias |
| [src/ui/EnergySummary.test.tsx](../src/ui/EnergySummary.test.tsx) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/ui/EnergySummary.tsx](../src/ui/EnergySummary.tsx) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/ui/Field.test.tsx](../src/ui/Field.test.tsx) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/ui/Field.tsx](../src/ui/Field.tsx) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/ui/FileImage.browser.test.tsx](../src/ui/FileImage.browser.test.tsx) | проверено частично | Browser91 PASS; inventory и выбранные assertions/callers | Не каждая строка теста прочитана; часть fixtures legacy alias |
| [src/ui/FileImage.test.tsx](../src/ui/FileImage.test.tsx) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/ui/FileImage.tsx](../src/ui/FileImage.tsx) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/ui/Icon.tsx](../src/ui/Icon.tsx) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/ui/MacroCharts.test.tsx](../src/ui/MacroCharts.test.tsx) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/ui/MacroCharts.tsx](../src/ui/MacroCharts.tsx) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/ui/Navigation.test.tsx](../src/ui/Navigation.test.tsx) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/ui/Navigation.tsx](../src/ui/Navigation.tsx) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/ui/NutritionSummary.test.tsx](../src/ui/NutritionSummary.test.tsx) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/ui/NutritionSummary.tsx](../src/ui/NutritionSummary.tsx) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/ui/StorageBoundary.test.tsx](../src/ui/StorageBoundary.test.tsx) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/ui/StorageBoundary.tsx](../src/ui/StorageBoundary.tsx) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/ui/WeightChart.test.tsx](../src/ui/WeightChart.test.tsx) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/ui/WeightChart.tsx](../src/ui/WeightChart.tsx) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/ui/actions.test.tsx](../src/ui/actions.test.tsx) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/ui/actions.tsx](../src/ui/actions.tsx) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/ui/backupFile.browser.test.tsx](../src/ui/backupFile.browser.test.tsx) | проверено частично | Browser91 PASS; inventory и выбранные assertions/callers | Не каждая строка теста прочитана; часть fixtures legacy alias |
| [src/ui/backupFile.test.ts](../src/ui/backupFile.test.ts) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/ui/backupFile.ts](../src/ui/backupFile.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/ui/download.test.ts](../src/ui/download.test.ts) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/ui/download.ts](../src/ui/download.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/ui/exactNumber.test.ts](../src/ui/exactNumber.test.ts) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/ui/exactNumber.ts](../src/ui/exactNumber.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |
| [src/ui/useVisibility.test.tsx](../src/ui/useVisibility.test.tsx) | проверено частично | Unit/API1633 PASS; inventory и выбранные assertions/callers | Ручной разбор выборочный; coverage не доказательство полноты |
| [src/ui/useVisibility.ts](../src/ui/useVisibility.ts) | проверено | Исходник/вызовы/схемы/связанные tests | Групповые находки в AUDIT; не live каждого состояния |

## tests

| Файл | Статус | Способ проверки | Ограничение |
|---|---|---|---|
| [tests/accountMailSmtp.ts](../tests/accountMailSmtp.ts) | проверено | Разбор test harness/guards/fixtures + штатные проверки | AUD-005,010,013 применимы к связанным fixtures |
| [tests/browserSetup.ts](../tests/browserSetup.ts) | проверено | Разбор test harness/guards/fixtures + штатные проверки | AUD-005,010,013 применимы к связанным fixtures |
| [tests/clientApi.ts](../tests/clientApi.ts) | проверено | Разбор test harness/guards/fixtures + штатные проверки | AUD-005,010,013 применимы к связанным fixtures |
| [tests/clientChannel.ts](../tests/clientChannel.ts) | проверено | Разбор test harness/guards/fixtures + штатные проверки | AUD-005,010,013 применимы к связанным fixtures |
| [tests/clientSession.ts](../tests/clientSession.ts) | проверено | Разбор test harness/guards/fixtures + штатные проверки | AUD-005,010,013 применимы к связанным fixtures |
| [tests/deployed/diary.spec.ts](../tests/deployed/diary.spec.ts) | проверено частично | Статический разбор HTTPS harness/spec; не исполнялся | Remote demo не менялся; live не подтверждён |
| [tests/deployed/playwright.config.ts](../tests/deployed/playwright.config.ts) | проверено частично | Статический разбор HTTPS harness/spec; не исполнялся | Remote demo не менялся; live не подтверждён |
| [tests/deployed/registration.spec.ts](../tests/deployed/registration.spec.ts) | проверено частично | Статический разбор HTTPS harness/spec; не исполнялся | Remote demo не менялся; live не подтверждён |
| [tests/deployed/release.spec.ts](../tests/deployed/release.spec.ts) | проверено частично | Статический разбор HTTPS harness/spec; не исполнялся | Remote demo не менялся; live не подтверждён |
| [tests/e2e/accessibility.spec.ts](../tests/e2e/accessibility.spec.ts) | проверено частично | E2E88 PASS; сценарии/fixtures/выбранные assertions | Chromium desktop/mobile, не Safari/Firefox и не ручной UX |
| [tests/e2e/activity-plan.spec.ts](../tests/e2e/activity-plan.spec.ts) | проверено частично | E2E88 PASS; сценарии/fixtures/выбранные assertions | Chromium desktop/mobile, не Safari/Firefox и не ручной UX |
| [tests/e2e/api-auth.spec.ts](../tests/e2e/api-auth.spec.ts) | проверено частично | E2E88 PASS; сценарии/fixtures/выбранные assertions | Chromium desktop/mobile, не Safari/Firefox и не ручной UX |
| [tests/e2e/async-delete.spec.ts](../tests/e2e/async-delete.spec.ts) | проверено частично | E2E88 PASS; сценарии/fixtures/выбранные assertions | Chromium desktop/mobile, не Safari/Firefox и не ручной UX |
| [tests/e2e/browser-export.spec.ts](../tests/e2e/browser-export.spec.ts) | проверено частично | E2E88 PASS; сценарии/fixtures/выбранные assertions | Chromium desktop/mobile, не Safari/Firefox и не ручной UX |
| [tests/e2e/completion.spec.ts](../tests/e2e/completion.spec.ts) | проверено частично | E2E88 PASS; сценарии/fixtures/выбранные assertions | Chromium desktop/mobile, не Safari/Firefox и не ручной UX |
| [tests/e2e/day-navigation.spec.ts](../tests/e2e/day-navigation.spec.ts) | проверено частично | E2E88 PASS; сценарии/fixtures/выбранные assertions | Chromium desktop/mobile, не Safari/Firefox и не ручной UX |
| [tests/e2e/design-contract.spec.ts](../tests/e2e/design-contract.spec.ts) | проверено частично | E2E88 PASS; сценарии/fixtures/выбранные assertions | Chromium desktop/mobile, не Safari/Firefox и не ручной UX |
| [tests/e2e/design-data.spec.ts](../tests/e2e/design-data.spec.ts) | проверено частично | E2E88 PASS; сценарии/fixtures/выбранные assertions | Chromium desktop/mobile, не Safari/Firefox и не ручной UX |
| [tests/e2e/design-visual.spec.ts](../tests/e2e/design-visual.spec.ts) | проверено частично | E2E88 PASS; сценарии/fixtures/выбранные assertions | Chromium desktop/mobile, не Safari/Firefox и не ручной UX |
| [tests/e2e/design-visual.spec.ts-snapshots/icon-activity-chromium.png](../tests/e2e/design-visual.spec.ts-snapshots/icon-activity-chromium.png) | проверено частично | Generated visual baseline: Chromium screenshot compare PASS | Самостоятельный ручной визуальный разбор исключён |
| [tests/e2e/design-visual.spec.ts-snapshots/icon-activity-mobile-chromium.png](../tests/e2e/design-visual.spec.ts-snapshots/icon-activity-mobile-chromium.png) | проверено частично | Generated visual baseline: Chromium screenshot compare PASS | Самостоятельный ручной визуальный разбор исключён |
| [tests/e2e/design-visual.spec.ts-snapshots/icon-brand-chromium.png](../tests/e2e/design-visual.spec.ts-snapshots/icon-brand-chromium.png) | проверено частично | Generated visual baseline: Chromium screenshot compare PASS | Самостоятельный ручной визуальный разбор исключён |
| [tests/e2e/design-visual.spec.ts-snapshots/icon-brand-mobile-chromium.png](../tests/e2e/design-visual.spec.ts-snapshots/icon-brand-mobile-chromium.png) | проверено частично | Generated visual baseline: Chromium screenshot compare PASS | Самостоятельный ручной визуальный разбор исключён |
| [tests/e2e/design-visual.spec.ts-snapshots/icon-documents-chromium.png](../tests/e2e/design-visual.spec.ts-snapshots/icon-documents-chromium.png) | проверено частично | Generated visual baseline: Chromium screenshot compare PASS | Самостоятельный ручной визуальный разбор исключён |
| [tests/e2e/design-visual.spec.ts-snapshots/icon-documents-mobile-chromium.png](../tests/e2e/design-visual.spec.ts-snapshots/icon-documents-mobile-chromium.png) | проверено частично | Generated visual baseline: Chromium screenshot compare PASS | Самостоятельный ручной визуальный разбор исключён |
| [tests/e2e/design-visual.spec.ts-snapshots/icon-nutrition-chromium.png](../tests/e2e/design-visual.spec.ts-snapshots/icon-nutrition-chromium.png) | проверено частично | Generated visual baseline: Chromium screenshot compare PASS | Самостоятельный ручной визуальный разбор исключён |
| [tests/e2e/design-visual.spec.ts-snapshots/icon-nutrition-mobile-chromium.png](../tests/e2e/design-visual.spec.ts-snapshots/icon-nutrition-mobile-chromium.png) | проверено частично | Generated visual baseline: Chromium screenshot compare PASS | Самостоятельный ручной визуальный разбор исключён |
| [tests/e2e/design-visual.spec.ts-snapshots/icon-photos-chromium.png](../tests/e2e/design-visual.spec.ts-snapshots/icon-photos-chromium.png) | проверено частично | Generated visual baseline: Chromium screenshot compare PASS | Самостоятельный ручной визуальный разбор исключён |
| [tests/e2e/design-visual.spec.ts-snapshots/icon-photos-mobile-chromium.png](../tests/e2e/design-visual.spec.ts-snapshots/icon-photos-mobile-chromium.png) | проверено частично | Generated visual baseline: Chromium screenshot compare PASS | Самостоятельный ручной визуальный разбор исключён |
| [tests/e2e/design-visual.spec.ts-snapshots/icon-profile-chromium.png](../tests/e2e/design-visual.spec.ts-snapshots/icon-profile-chromium.png) | проверено частично | Generated visual baseline: Chromium screenshot compare PASS | Самостоятельный ручной визуальный разбор исключён |
| [tests/e2e/design-visual.spec.ts-snapshots/icon-profile-mobile-chromium.png](../tests/e2e/design-visual.spec.ts-snapshots/icon-profile-mobile-chromium.png) | проверено частично | Generated visual baseline: Chromium screenshot compare PASS | Самостоятельный ручной визуальный разбор исключён |
| [tests/e2e/design-visual.spec.ts-snapshots/icon-settings-chromium.png](../tests/e2e/design-visual.spec.ts-snapshots/icon-settings-chromium.png) | проверено частично | Generated visual baseline: Chromium screenshot compare PASS | Самостоятельный ручной визуальный разбор исключён |
| [tests/e2e/design-visual.spec.ts-snapshots/icon-settings-mobile-chromium.png](../tests/e2e/design-visual.spec.ts-snapshots/icon-settings-mobile-chromium.png) | проверено частично | Generated visual baseline: Chromium screenshot compare PASS | Самостоятельный ручной визуальный разбор исключён |
| [tests/e2e/design-visual.spec.ts-snapshots/icon-today-chromium.png](../tests/e2e/design-visual.spec.ts-snapshots/icon-today-chromium.png) | проверено частично | Generated visual baseline: Chromium screenshot compare PASS | Самостоятельный ручной визуальный разбор исключён |
| [tests/e2e/design-visual.spec.ts-snapshots/icon-today-mobile-chromium.png](../tests/e2e/design-visual.spec.ts-snapshots/icon-today-mobile-chromium.png) | проверено частично | Generated visual baseline: Chromium screenshot compare PASS | Самостоятельный ручной визуальный разбор исключён |
| [tests/e2e/design-visual.spec.ts-snapshots/icon-weight-chromium.png](../tests/e2e/design-visual.spec.ts-snapshots/icon-weight-chromium.png) | проверено частично | Generated visual baseline: Chromium screenshot compare PASS | Самостоятельный ручной визуальный разбор исключён |
| [tests/e2e/design-visual.spec.ts-snapshots/icon-weight-mobile-chromium.png](../tests/e2e/design-visual.spec.ts-snapshots/icon-weight-mobile-chromium.png) | проверено частично | Generated visual baseline: Chromium screenshot compare PASS | Самостоятельный ручной визуальный разбор исключён |
| [tests/e2e/design-visual.spec.ts-snapshots/plot-first-320-chromium.png](../tests/e2e/design-visual.spec.ts-snapshots/plot-first-320-chromium.png) | проверено частично | Generated visual baseline: Chromium screenshot compare PASS | Самостоятельный ручной визуальный разбор исключён |
| [tests/e2e/design-visual.spec.ts-snapshots/plot-first-320-mobile-chromium.png](../tests/e2e/design-visual.spec.ts-snapshots/plot-first-320-mobile-chromium.png) | проверено частично | Generated visual baseline: Chromium screenshot compare PASS | Самостоятельный ручной визуальный разбор исключён |
| [tests/e2e/design-visual.spec.ts-snapshots/plot-first-375-chromium.png](../tests/e2e/design-visual.spec.ts-snapshots/plot-first-375-chromium.png) | проверено частично | Generated visual baseline: Chromium screenshot compare PASS | Самостоятельный ручной визуальный разбор исключён |
| [tests/e2e/design-visual.spec.ts-snapshots/plot-first-375-mobile-chromium.png](../tests/e2e/design-visual.spec.ts-snapshots/plot-first-375-mobile-chromium.png) | проверено частично | Generated visual baseline: Chromium screenshot compare PASS | Самостоятельный ручной визуальный разбор исключён |
| [tests/e2e/design-visual.spec.ts-snapshots/plot-latest-320-chromium.png](../tests/e2e/design-visual.spec.ts-snapshots/plot-latest-320-chromium.png) | проверено частично | Generated visual baseline: Chromium screenshot compare PASS | Самостоятельный ручной визуальный разбор исключён |
| [tests/e2e/design-visual.spec.ts-snapshots/plot-latest-320-mobile-chromium.png](../tests/e2e/design-visual.spec.ts-snapshots/plot-latest-320-mobile-chromium.png) | проверено частично | Generated visual baseline: Chromium screenshot compare PASS | Самостоятельный ручной визуальный разбор исключён |
| [tests/e2e/design-visual.spec.ts-snapshots/plot-latest-375-chromium.png](../tests/e2e/design-visual.spec.ts-snapshots/plot-latest-375-chromium.png) | проверено частично | Generated visual baseline: Chromium screenshot compare PASS | Самостоятельный ручной визуальный разбор исключён |
| [tests/e2e/design-visual.spec.ts-snapshots/plot-latest-375-mobile-chromium.png](../tests/e2e/design-visual.spec.ts-snapshots/plot-latest-375-mobile-chromium.png) | проверено частично | Generated visual baseline: Chromium screenshot compare PASS | Самостоятельный ручной визуальный разбор исключён |
| [tests/e2e/design-visual.spec.ts-snapshots/plot-single-375-chromium.png](../tests/e2e/design-visual.spec.ts-snapshots/plot-single-375-chromium.png) | проверено частично | Generated visual baseline: Chromium screenshot compare PASS | Самостоятельный ручной визуальный разбор исключён |
| [tests/e2e/design-visual.spec.ts-snapshots/plot-single-375-mobile-chromium.png](../tests/e2e/design-visual.spec.ts-snapshots/plot-single-375-mobile-chromium.png) | проверено частично | Generated visual baseline: Chromium screenshot compare PASS | Самостоятельный ручной визуальный разбор исключён |
| [tests/e2e/email-recovery.spec.ts](../tests/e2e/email-recovery.spec.ts) | проверено частично | E2E88 PASS; сценарии/fixtures/выбранные assertions | Chromium desktop/mobile, не Safari/Firefox и не ручной UX |
| [tests/e2e/emailHelpers.ts](../tests/e2e/emailHelpers.ts) | проверено | Разбор test harness/guards/fixtures + штатные проверки | AUD-005,010,013 применимы к связанным fixtures |
| [tests/e2e/fixtures.ts](../tests/e2e/fixtures.ts) | проверено | Разбор test harness/guards/fixtures + штатные проверки | AUD-005,010,013 применимы к связанным fixtures |
| [tests/e2e/full-restore.spec.ts](../tests/e2e/full-restore.spec.ts) | проверено частично | E2E88 PASS; сценарии/fixtures/выбранные assertions | Chromium desktop/mobile, не Safari/Firefox и не ручной UX |
| [tests/e2e/invalid-full-backup.spec.ts](../tests/e2e/invalid-full-backup.spec.ts) | проверено частично | E2E88 PASS; сценарии/fixtures/выбранные assertions | Chromium desktop/mobile, не Safari/Firefox и не ручной UX |
| [tests/e2e/lab-trends.spec.ts](../tests/e2e/lab-trends.spec.ts) | проверено частично | E2E88 PASS; сценарии/fixtures/выбранные assertions | Chromium desktop/mobile, не Safari/Firefox и не ручной UX |
| [tests/e2e/media-documents.spec.ts](../tests/e2e/media-documents.spec.ts) | проверено частично | E2E88 PASS; сценарии/fixtures/выбранные assertions | Chromium desktop/mobile, не Safari/Firefox и не ручной UX |
| [tests/e2e/media-photos.spec.ts](../tests/e2e/media-photos.spec.ts) | проверено частично | E2E88 PASS; сценарии/fixtures/выбранные assertions | Chromium desktop/mobile, не Safari/Firefox и не ручной UX |
| [tests/e2e/nutrition-day.spec.ts](../tests/e2e/nutrition-day.spec.ts) | проверено частично | E2E88 PASS; сценарии/fixtures/выбранные assertions | Chromium desktop/mobile, не Safari/Firefox и не ручной UX |
| [tests/e2e/profile-weight.spec.ts](../tests/e2e/profile-weight.spec.ts) | проверено частично | E2E88 PASS; сценарии/fixtures/выбранные assertions | Chromium desktop/mobile, не Safari/Firefox и не ручной UX |
| [tests/e2e/registration.spec.ts](../tests/e2e/registration.spec.ts) | проверено частично | E2E88 PASS; сценарии/fixtures/выбранные assertions | Chromium desktop/mobile, не Safari/Firefox и не ручной UX |
| [tests/e2e/responsive.spec.ts](../tests/e2e/responsive.spec.ts) | проверено частично | E2E88 PASS; сценарии/fixtures/выбранные assertions | Chromium desktop/mobile, не Safari/Firefox и не ручной UX |
| [tests/e2e/security-policy.spec.ts](../tests/e2e/security-policy.spec.ts) | проверено частично | E2E88 PASS; сценарии/fixtures/выбранные assertions | Chromium desktop/mobile, не Safari/Firefox и не ручной UX |
| [tests/e2e/setup.ts](../tests/e2e/setup.ts) | проверено | Разбор test harness/guards/fixtures + штатные проверки | AUD-005,010,013 применимы к связанным fixtures |
| [tests/e2e/stale-media.spec.ts](../tests/e2e/stale-media.spec.ts) | проверено частично | E2E88 PASS; сценарии/fixtures/выбранные assertions | Chromium desktop/mobile, не Safari/Firefox и не ручной UX |
| [tests/e2e/stale-records.spec.ts](../tests/e2e/stale-records.spec.ts) | проверено частично | E2E88 PASS; сценарии/fixtures/выбранные assertions | Chromium desktop/mobile, не Safari/Firefox и не ручной UX |
| [tests/e2e/start.spec.ts](../tests/e2e/start.spec.ts) | проверено частично | E2E88 PASS; сценарии/fixtures/выбранные assertions | Chromium desktop/mobile, не Safari/Firefox и не ручной UX |
| [tests/e2e/storage-unavailable.spec.ts](../tests/e2e/storage-unavailable.spec.ts) | проверено частично | E2E88 PASS; сценарии/fixtures/выбранные assertions | Chromium desktop/mobile, не Safari/Firefox и не ручной UX |
| [tests/e2e/text-backup.spec.ts](../tests/e2e/text-backup.spec.ts) | проверено частично | E2E88 PASS; сценарии/fixtures/выбранные assertions | Chromium desktop/mobile, не Safari/Firefox и не ручной UX |
| [tests/e2e/weight-chart.spec.ts](../tests/e2e/weight-chart.spec.ts) | проверено частично | E2E88 PASS; сценарии/fixtures/выбранные assertions | Chromium desktop/mobile, не Safari/Firefox и не ручной UX |
| [tests/fullBackupFixture.ts](../tests/fullBackupFixture.ts) | проверено | Разбор test harness/guards/fixtures + штатные проверки | AUD-005,010,013 применимы к связанным fixtures |
| [tests/generationAssertions.ts](../tests/generationAssertions.ts) | проверено | Разбор test harness/guards/fixtures + штатные проверки | AUD-005,010,013 применимы к связанным fixtures |
| [tests/queryRefresh.ts](../tests/queryRefresh.ts) | проверено | Разбор test harness/guards/fixtures + штатные проверки | AUD-005,010,013 применимы к связанным fixtures |
| [tests/serverApi.ts](../tests/serverApi.ts) | проверено | Разбор test harness/guards/fixtures + штатные проверки | AUD-005,010,013 применимы к связанным fixtures |
| [tests/serverDatabase.ts](../tests/serverDatabase.ts) | проверено | Разбор test harness/guards/fixtures + штатные проверки | AUD-005,010,013 применимы к связанным fixtures |
| [tests/setup.ts](../tests/setup.ts) | проверено | Разбор test harness/guards/fixtures + штатные проверки | AUD-005,010,013 применимы к связанным fixtures |
| [tests/textBackupFixture.ts](../tests/textBackupFixture.ts) | проверено | Разбор test harness/guards/fixtures + штатные проверки | AUD-005,010,013 применимы к связанным fixtures |
| [tests/workoutSmoke.ts](../tests/workoutSmoke.ts) | проверено | Разбор test harness/guards/fixtures + штатные проверки | AUD-005,010,013 применимы к связанным fixtures |
