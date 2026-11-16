# Запуск INNOSIGHT

Подробная инструкция для версии 1.1. Можно начать без знания программирования. Для демонстрации не нужны платные API, облачная база, аккаунт GraphQL-сервиса или секретные ключи. Все сервисы и настоящие демонстрационные данные входят в проект.

Если вы открыли архив: сначала **распакуйте его целиком** в обычную папку. Не запускайте файлы внутри окна ZIP. В папке `innosight` должны находиться `docker-compose.yml`, `Dockerfile`, `package.json`, каталоги `apps`, `packages`, `prisma` и эта инструкция. Файл `START_HERE.html` — офлайн-версия этой инструкции, его можно открыть двойным щелчком. Само приложение открывают по HTTP после запуска серверов.

## 1. Самый короткий путь

1. Установите Docker Desktop и запустите его. Дождитесь готовности Docker Engine.
2. Откройте терминал в распакованной папке `innosight`.
3. Выполните одну команду:

```sh
docker compose up -d --build --wait
```

4. После успешного завершения откройте **http://localhost:3000**.
5. Выберите **Demo Lab → Start Demo**. Операции действительно отправляются в GraphQL API, попадают в PostgreSQL и изменяют интерфейс. Некоторые демонстрационные операции намеренно возвращают ошибки.

В Windows можно вместо команды дважды нажать `START_WINDOWS.bat`. На macOS/Linux из терминала в папке проекта: `bash START_MAC_LINUX.sh`. Эти скрипты проверяют Docker, запускают те же четыре сервиса и пытаются открыть браузер. Отсутствие автоматического открытия браузера не мешает работе: введите адрес вручную.

**Не нужно** устанавливать Node.js, npm, PostgreSQL или nginx на компьютер для запуска через Docker. Не нужно копировать `.env.example`: встроенные настройки уже подходят для локальной демонстрации.

## 2. Что понадобится

- Современный 64-битный компьютер с Windows, macOS или Linux и аппаратной виртуализацией.
- Рекомендуется 8 ГБ оперативной памяти; выделите Docker хотя бы 4 ГБ.
- Рекомендуется 6–10 ГБ свободного диска для загрузки, сборки образов и базы.
- Интернет при первой сборке: Docker скачивает образы и npm-зависимости. Шрифты включены в приложение, CDN и облачные ключи для работы интерфейса не нужны.
- Свободные локальные порты 3000, 4000, 5000, 5432.
- Docker Engine/Desktop с Compose v2, поддерживающим `--wait`. Команда пишется `docker compose`, с пробелом. Если `--wait` неизвестен, обновите Docker Desktop либо выполните `docker compose up -d --build`, затем проверяйте состояние через `docker compose ps`.

Порт 3000 — веб-интерфейс. 4000 — backend и GraphQL Proxy. 5000 — отдельный демо GraphQL API. 5432 — PostgreSQL. Порты привязаны к `127.0.0.1`, поэтому обычная локальная установка доступна с этого компьютера.

## 3. Установка Docker: по операционным системам

### Windows 10/11

1. Установите Docker Desktop с официальной страницы: https://docs.docker.com/desktop/setup/install/windows-install/ . Проверьте требования вашей версии Windows.
2. При запросе используйте backend WSL 2. Если Docker сообщает об отсутствии WSL, откройте PowerShell от администратора, выполните `wsl --install`, следуйте указаниям Windows и перезагрузите компьютер.
3. Запустите Docker Desktop. Дождитесь сообщения о работающем Engine. Docker Desktop должен оставаться запущенным.
4. Распакуйте архив, например в `C:\Projects\innosight`.
5. Откройте папку в Проводнике, нажмите адресную строку, введите `powershell` и нажмите Enter. Либо откройте PowerShell и выполните:

```powershell
cd "C:\Projects\innosight"
docker --version
docker compose version
docker info
docker compose up -d --build --wait
```

Если путь другой, подставьте свой. Пробелы в пути требуют кавычек. Для запуска `START_WINDOWS.bat` не требуется разрешать выполнение PowerShell-скриптов.

### macOS

1. Установите Docker Desktop: https://docs.docker.com/desktop/setup/install/mac-install/ . Выберите вариант для Apple Silicon (M-серия) или Intel согласно вашему Mac.
2. Запустите Docker из Applications, завершите первичную настройку, дождитесь готовности Engine.
3. Распакуйте архив. Откройте Terminal и перейдите в папку проекта, например:

```sh
cd "$HOME/Downloads/innosight"
docker compose version
docker info
bash START_MAC_LINUX.sh
```

Можно перетащить папку из Finder в Terminal после набора `cd `, чтобы вставить правильный путь. Dockerfile использует обычные многоплатформенные образы Node, nginx и PostgreSQL; отдельного Intel-эмулятора для исходников проекта нет.

### Linux

1. Установите Docker Engine и плагин Compose по официальной инструкции для своего дистрибутива: https://docs.docker.com/engine/install/ . Альтернатива — Docker Desktop for Linux.
2. Запустите Docker daemon. Для systemd-дистрибутива обычно `sudo systemctl enable --now docker`.
3. Проверьте `docker info` и `docker compose version`.
4. Если сокет Docker недоступен вашему пользователю, используйте официальную инструкцию https://docs.docker.com/engine/install/linux-postinstall/ . Доступ к группе docker даёт широкие права; не меняйте права сокета на общедоступные. До настройки можно выполнять команды Docker с `sudo`.
5. В каталоге проекта выполните:

```sh
docker compose up -d --build --wait
```

## 4. Как понять, что всё запустилось

```sh
docker compose ps
```

Должны работать четыре сервиса: `postgres`, `demo-api`, `server`, `web`. У каждого ожидается состояние `healthy`. Первая сборка занимает несколько минут, время зависит от интернета и компьютера. База создаётся автоматически; backend применяет SQL-миграции и выполняет настоящие запросы для начальных данных.

Адреса:

| Что открыть                | Адрес                                    |
| -------------------------- | ---------------------------------------- |
| Приложение                 | http://localhost:3000                    |
| Готовность backend и базы  | http://localhost:4000/ready              |
| Здоровье backend           | http://localhost:4000/health             |
| GraphQL Proxy демо-проекта | http://localhost:4000/proxy/demo/graphql |
| Прямой GraphQL демо-сервер | http://localhost:5000/graphql            |

Для GraphQL нужен POST с JSON или корректный GET query; пустой адрес Proxy не обязан возвращать данные. Ответ `/ready` с HTTP 200 означает, что backend видит базу и активную схему.

Исходное состояние нового демо-проекта: **3 настоящих запроса, 25 из 99 выбранных output-полей (25,25%), 0 подтверждённых assertions полей**. Интерфейс округляет проценты до одного знака. Если Demo уже использовали раньше, история сохраняется и показатели будут другими. **Demo Lab → Reset Demo** возвращает исходное состояние. Сброс удаляет только демонстрационные события, прогоны, snapshots и результаты тестов; требует подтверждения.

## 5. Демонстрация за пять минут

1. Откройте **Обзор**. Объясните разницу: selection означает, что поле было выбрано GraphQL-операцией; verified означает, что ответ проверен успешным зарегистрированным assertion. Обычный запрос не доказывает корректность поля.
2. Откройте **Playground** и выполните:

```graphql
query SupplierDiscovery {
  suppliers {
    leadTimeDays
    rating
  }
}
```

После чистого Reset Demo обнаружатся три новых координаты: `Query.suppliers`, `Supplier.leadTimeDays`, `Supplier.rating`. Coverage изменится с 25/99 до 28/99. Если запрос уже выполняли, новых полей может не быть — это нормальное накопление уникальных полей. 3. В другой вкладке держите **Обзор**: SSE обновляет данные после сохранения запроса, ручная перезагрузка не требуется. 4. Откройте **Live Requests**, найдите `SupplierDiscovery`, нажмите строку. Показаны тип операции, время, поля и безопасная структура запроса. Значения variables, ответы и заголовки в истории не сохраняются. 5. В **Graph Universe** найдите `Supplier`, выберите тип и поле, попробуйте масштабирование, автокомпоновку и фильтр невыбранных полей. 6. В **Test Lab → Запустить весь набор** восемь встроенных query-тестов выполнят настоящие assertions. Это повышает Verified coverage. Детали каждого результата раскрываются. 7. В **Demo Lab → Start Demo** последовательно выполняются трафик, раскрытие новых полей, контролируемые ошибки, медленный запрос, тесты и анализ несовместимых изменений. Красные ошибки здесь ожидаемы и показывают диагностику. 8. В **Отчёты** сохраните snapshot, скачайте CSV/JSON, откройте печатный отчёт. В диалоге печати браузера выберите «Сохранить как PDF».

Кнопка темы вверху переключает светлую и тёмную темы; выбор сохраняется в этом браузере. `Ctrl+K` открывает быстрый переход.

## 6. Главное для компании: подключить существующие автотесты

### 6.1. Прогон через интерфейс

1. Выберите проект и откройте **Прогоны автотестов**.
2. Назовите прогон, например `CI build 127`, нажмите **Создать прогон**.
3. Скопируйте endpoint и токен заголовка **X-Innosight-Capture**. Токен показывается только при создании, храните его в памяти процесса CI или секретах своего CI. Браузер не сохраняет его после перезагрузки; в БД хранится SHA-256.
4. В конфигурации существующего тестового клиента замените GraphQL URL на Proxy и добавьте этот заголовок ко всем запросам текущего прогона. Код тестовых проверок менять не требуется.
5. Запустите свои тесты. Страница автоматически покажет выбранные поля и типы, незатронутые поля, число запросов, ошибки и P95 этого прогона.
6. Нажмите **Завершить прогон** и скачайте JSON. После завершения токен больше не принимает запросы; для следующего запуска создайте новый прогон.

Обычный трафик, Demo Lab и запросы без токена **не попадают в покрытие этого прогона**. Внешние тесты могут выполнять assertions в своём раннере, но INNOSIGHT не получает их результаты автоматически. Поэтому покрытие такого прогона — честное **selection coverage автотестов**, оно не повышает Verified coverage. Для проверяемых assertions используйте встроенный Test Lab.

Прогон закреплён за версией схемы. Если активная схема изменилась, старый токен вернёт `CAPTURE_SCHEMA_CHANGED`: завершите старый прогон и создайте новый. Старый отчёт остаётся привязан к исходной схеме. Тип считается затронутым, если выбрано хотя бы одно его output-поле; input/scalar/enum не включаются в знаменатель покрытия типов.

### 6.2. Проверка curl (macOS/Linux или Git Bash)

Замените `TOKEN` настоящим токеном созданного прогона:

```sh
curl 'http://localhost:4000/proxy/demo/graphql' \
  -H 'Content-Type: application/json' \
  -H 'X-Innosight-Capture: TOKEN' \
  --data '{"query":"query CatalogCheck { products { id name price } }"}'
```

В Windows PowerShell используйте отдельный вариант:

```powershell
$headers = @{ "X-Innosight-Capture" = "TOKEN" }
$body = @{ query = "query CatalogCheck { products { id name price } }" } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "http://localhost:4000/proxy/demo/graphql" -Headers $headers -ContentType "application/json" -Body $body
```

### 6.3. Пример CI на Node.js

Node.js нужен только для этого примера. Сохраните как `capture-example.mjs` вне контейнера. Node 24 поддерживает встроенный fetch, зависимости не нужны. Скрипт создаёт настоящий прогон и завершает его даже при неуспешной проверке ответа:

```js
const origin = process.env.INNOSIGHT_URL || 'http://localhost:4000';
const project = process.env.INNOSIGHT_PROJECT || 'demo';
const admin = process.env.ADMIN_TOKEN;
const headers = {
  'content-type': 'application/json',
  ...(admin ? { authorization: `Bearer ${admin}` } : {}),
};
const base = `${origin}/api/projects/${project}/captures`;
async function checked(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`INNOSIGHT HTTP ${response.status}: ${await response.text()}`);
  return response.json();
}
const run = await checked(base, {
  method: 'POST',
  headers,
  body: JSON.stringify({ label: 'Node CI example' }),
});
try {
  const result = await checked(`${origin}/proxy/${project}/graphql`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-innosight-capture': run.token },
    body: JSON.stringify({ query: 'query CatalogCheck { products { id name price } }' }),
  });
  if (result.errors || !result.data?.products?.length) throw new Error('Catalog assertion failed');
} finally {
  const report = await checked(`${base}/${run.id}/finish`, { method: 'POST', headers, body: '{}' });
  console.log(JSON.stringify(report, null, 2));
}
```

Запуск: `node capture-example.mjs`. Пример GraphQL-запроса рассчитан на встроенную commerce-схему; для своего API замените его настоящим запросом. Токен прогона не передаётся вашему GraphQL upstream. Авторизацию вашего API при необходимости задайте отдельно.

Если тесты тоже в контейнере, `localhost` внутри него обозначает этот контейнер. В одной Compose-сети используйте `http://server:4000/proxy/demo/graphql`. С хост-компьютера используйте `http://localhost:4000/...`. Из другого компьютера порты по умолчанию недоступны.

## 7. Подключение своего GraphQL API

Для внешнего API требуется HTTPS endpoint, разрешённый администратором. Не вводите произвольные чужие адреса: Proxy — управляемое подключение к конкретному API.

1. Скопируйте `.env.example` в `.env` в корне проекта. Не публикуйте этот файл.
2. Задайте длинный случайный `ADMIN_TOKEN` и точный URL в `UPSTREAM_ALLOWLIST`. Для нескольких адресов используйте запятую без пробелов. URL должен полностью совпадать с адресом в интерфейсе, включая завершающий слеш, если он есть. Query string, fragment и credentials в URL запрещены.
3. Если upstream требует авторизации, добавьте server-only карту заголовков. Пример (значения замените):

```dotenv
ADMIN_TOKEN=REPLACE_WITH_LONG_RANDOM_VALUE
UPSTREAM_ALLOWLIST=https://api.your-company.example/graphql
UPSTREAM_HEADERS_JSON='{"https://api.your-company.example/graphql":{"authorization":"Bearer REPLACE_WITH_REAL_UPSTREAM_TOKEN"}}'
```

Значения `REPLACE_...` — заполнители, такой endpoint сам не заработает. Не отправляйте реальные секреты в публичный репозиторий или архив. Введённый в Settings admin token защищает управление подключениями, но не заменяет учётные записи пользователей.

4. Примените окружение:

```sh
docker compose up -d --build --wait
```

5. Откройте **Настройки**, введите тот же ADMIN_TOKEN в административный доступ. Создайте проект с именем и разрешённым URL.
6. INNOSIGHT запросит introspection. Если она отключена, укажите SDL вашей действующей схемы в форме импорта/подключения. SDL должен соответствовать upstream: устаревшая схема искажает анализ.
7. Выберите новый проект в боковом меню, проверьте его через Playground или создайте прогон автотестов. URL Proxy будет содержать ID нового проекта.

Заголовки credentials берутся с сервера и не возвращаются в настройках проекта. Переадресации upstream не разрешены. Самоподписанный сертификат не отключает TLS-проверку автоматически: для корпоративного CA нужно настроить доверие контейнера; не используйте отключение проверки TLS.

Локальная демонстрационная установка не является готовым публичным многопользовательским SaaS. Для публикации организации дополнительно нужны аутентификация читателей, роли, TLS перед интерфейсом, политика хранения, резервирование и эксплуатационный контроль. Подробные границы — в `docs/SECURITY.md`.

## 8. Остановка, повторный запуск и сохранение данных

Остановить сервисы, сохранив историю:

```sh
docker compose down
```

Повторно запустить уже собранную версию:

```sh
docker compose up -d --wait
```

После изменения исходников:

```sh
docker compose up -d --build --wait
```

История находится в именованном Docker volume `postgres_data`. Закрытие браузера и `docker compose down` её не удаляют. Не переименовывайте папку установки без понимания Compose project name: новая папка может создать новый независимый volume, и интерфейс будет выглядеть как новая установка. Старые данные при этом обычно остаются в прежнем volume.

**`docker compose down -v` удаляет базу безвозвратно. Для обычной остановки никогда не добавляйте `-v`.** Reset Demo также удаляет демонстрационную историю, но не весь Docker volume и не внешние проекты.

### Резервная копия

На macOS/Linux или в Windows Command Prompt (cmd.exe), из папки проекта:

```sh
docker compose exec -T postgres pg_dump -U innosight --clean --if-exists innosight > innosight-backup.sql
```

Файл содержит реальные данные проекта — храните его отдельно от публичного архива. В старом Windows PowerShell перенаправление текста может изменить кодировку: используйте `cmd.exe` для приведённых команд.

Восстановление **заменяет данные**. Сначала сохраните текущую копию. В тех же macOS/Linux/cmd.exe:

```sh
docker compose stop server web
docker compose exec -T postgres psql -v ON_ERROR_STOP=1 -U innosight -d innosight < innosight-backup.sql
docker compose up -d --wait
```

Не восстанавливайте непроверенный чужой SQL. Не редактируйте применённые файлы миграций: backend проверяет их контрольные суммы.

## 9. Если не запускается

### Docker не найден / cannot connect to Docker daemon

Установите и запустите Docker Desktop/Engine. Проверьте `docker info`. После установки может понадобиться открыть новый терминал или перезагрузить компьютер. До успешного `docker info` приложение запускать бессмысленно.

### no configuration file provided

Терминал открыт не в папке проекта. Перейдите в каталог с `docker-compose.yml`. Проверьте `dir` в Windows или `ls` в macOS/Linux.

### port is already allocated / address already in use

Один из портов занят другим проектом или локальным PostgreSQL. Остановите только известный конфликтующий сервис. Если PostgreSQL нужен параллельно, в `docker-compose.yml` можно изменить **левую** часть его порта на `127.0.0.1:5433:5432`; связь backend с базой внутри Docker останется прежней. Тогда локальным Node-тестам понадобится DATABASE_URL/TEST_DATABASE_URL с портом 5433. Не меняйте внутренние порты без обновления зависимых настроек.

Если занят веб-порт, можно заменить `3000:8080` на `3001:8080` и открыть localhost:3001. Браузерные API-запросы идут через тот же nginx; для отдельного dev-клиента проверьте CORS.

### Failed to fetch / пустой экран / сервис unhealthy

```sh
docker compose ps
docker compose logs --tail=120 server
docker compose logs --tail=80 demo-api
docker compose logs --tail=80 postgres
docker compose logs --tail=80 web
```

Проверьте http://localhost:4000/ready. Если открыли HTML исходников вместо localhost:3000, вернитесь к правильному адресу. Для анализа отправляйте запросы через `/proxy/...`, прямые запросы на порт 5000 не проходят через INNOSIGHT и не увеличивают его покрытие.

### Ошибка скачивания npm/образов, сертификата или сборки

Первая сборка требует интернета. Проверьте сеть, корпоративный proxy и доверенные CA. В этой поставке нет секретных сертификатов среды разработки. Для обычной локальной машины достаточно основного docker-compose.yml; файлы временной облачной среды не нужны. После устранения причины повторите команду запуска. Не отключайте TLS-проверку ради сборки.

### Нет места / сборка завершилась с ошибкой записи

Освободите диск, проверьте `docker system df`. Можно удалить ненужный **build cache**, понимая, что другие проекты будут дольше пересобираться: `docker builder prune`. Не используйте `docker volume prune` или `docker system prune --volumes`: это может удалить чужие базы. INNOSIGHT хранит историю именно в volume.

### Coverage не изменился

Уникальное поле считается один раз на версию схемы. Повторный запрос увеличивает количество запросов, но не coverage. Поле, отключённое через `@skip`/`@include`, не считается выбранным. Убедитесь, что выбран нужный проект, запрос шёл через Proxy, а для отдельного прогона добавлен его действующий токен. Внешние selection-запросы не увеличивают Verified coverage.

### 401 / 403 / 409 при подключении

- `INVALID_CAPTURE_TOKEN`: токен неверный или относится к другому проекту.
- `ADMIN_REQUIRED`: задайте ADMIN_TOKEN на сервере и используйте то же значение в Settings/CI.
- `UPSTREAM_NOT_ALLOWED`: добавьте точный HTTPS URL в серверный allowlist и пересоздайте server через Compose.
- `CAPTURE_FINISHED`: создайте новый прогон.
- `CAPTURE_SCHEMA_CHANGED`: схема сменилась, создайте новый прогон для неё.
- `PROJECT_BUSY`: дождитесь завершения Reset/тестов/управления схемой и повторите действие.

### Ошибки в Demo Lab

Сценарии Error/Slow специально создают диагностические события. Ошибка GraphQL может приходить с HTTP 200 — INNOSIGHT всё равно учитывает её. Для чистой демонстрации используйте Reset Demo и повторите Start Demo. Нулевой Verified до запуска assertions — ожидаемое состояние.

## 10. Запуск для разработчика без Docker-приложений

Этот раздел необязателен для демонстрации. Нужны Node.js **24+**, npm и доступная PostgreSQL 17. Docker можно использовать только для базы:

```sh
npm ci
docker compose up -d postgres
npm run db:migrate
npm run dev
```

Backend использует локальные значения DATABASE_URL и DEMO_API_URL из конфигурации по умолчанию; для других значений экспортируйте переменные окружения вашей оболочки. `.env` автоматически подставляется Docker Compose, но Node-скрипты не обязаны его читать — задайте env в терминале явно. `npm run dev` запускает три процесса: demo-api:5000, server:4000, Vite:3000. Не держите одновременно Compose web/server/demo-api на тех же портах.

Остановка dev: `Ctrl+C`. Сборка: `npm run build`. Исходники: backend `apps/server`, demo API `apps/demo-api`, React `apps/web`, общие DTO `packages/shared`, миграции `prisma/migrations`, тесты `tests`.

## 11. Как проверить код и настоящее приложение

Проверки требуют Node 24+ и установленных devDependencies (`npm ci`). Docker-запуск приложения сам по себе их не требует.

```sh
npm run typecheck
npm run lint
npm test
```

`npm test` создаёт отдельную базу `innosight_test` на локальной PostgreSQL, применяет миграции и запускает unit/security/integration проверки. Нельзя направлять тесты на рабочую базу: integration требуют имя с окончанием `_test`. Для нестандартного подключения задайте TEST_DATABASE_URL. HTTP-интеграции создают отдельные временные серверы; тестовый DB-пользователь должен иметь право создать тестовую базу. Включена проверка настоящего локального HTTPS через openssl.

Browser E2E запускайте против **работающего Compose** (включая nginx):

```sh
npx playwright install chromium
npm run test:e2e
```

На чистом Linux для системных библиотек может понадобиться официальная `npx playwright install --with-deps chromium` с правами установки пакетов. E2E сбрасывают **демо-проект**, создают запросы, тесты и snapshots. Не запускайте их во время важной демонстрации. Они не должны использовать ваши внешние проекты. Отчёт Playwright: `npx playwright show-report`.

`npm run demo:verify` проверяет демо HTTP-цепочку, также сбрасывает demo. Фактические результаты проверки поставки записаны в `docs/RELEASE_1_1.md`, исторические результаты 1.0 отдельно отмечены в документах.

## 12. Где что находится в архиве

- `START_HERE_RU.md`, `START_HERE.html` — эта инструкция в текстовом и браузерном формате.
- `START_WINDOWS.bat`, `START_MAC_LINUX.sh` — помощники запуска.
- `README.md` — обзор продукта и технические команды.
- `docker-compose.yml`, `Dockerfile`, `infra/nginx.conf` — запуск четырёх сервисов.
- `apps`, `packages`, `prisma`, `scripts`, `tests`, `package-lock.json` — все исходники, миграции, проверки и фиксированные npm-зависимости.
- `docs/source-materials/ZUNAMI_COMPANY_BRIEF.pdf` — оригинал документа компании.
- `docs/source-materials/ZUNAMI_COMPANY_BRIEF.txt` — извлечённый текст PDF.
- `docs/source-materials/1-INNOSIGHT_full_answer.txt`, `docs/SPECIFICATION.txt` — подробное исходное ТЗ.
- `docs/COMPANY_REQUIREMENTS.md` — сопоставление требований компании с реализацией и проверками.
- `docs/ARCHITECTURE.md`, `docs/SECURITY.md`, `docs/DEMO_SCRIPT.md` — устройство системы, границы безопасности, сценарий выступления.
- `docs/screenshots` — реальные снимки работающего интерфейса.
- `PROGRESS.md` — история разработки, выполненные проверки и ограничения.

В архив не входят node_modules, контейнерные образы, Docker volume с пользовательской БД, .env и секреты. Они создаются локально при запуске. Архив содержит всё необходимое для воспроизводимой сборки, но первая установка требует интернета и установленного Docker.
