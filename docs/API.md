# Backend HTTP API

Base URL: `http://localhost:4000`. Frontend nginx предоставляет те же `/api/` и `/proxy/` на порту 3000. В примерах project ID — `demo`.

## Формат и безопасность

REST ошибки: `{"error":{"code":"VALIDATION_ERROR","message":"…"}}`. Используются 400, 401, 403, 404, 405, 409, 413, 429, 500, 502, 504. Ошибки GraphQL, полученные от upstream, возвращаются в фактическом GraphQL response со статусом upstream; это отдельный transport contract.

`Content-Type: application/json` для POST. Неизвестный проект: 404; закрытая introspection: 502 с предложением импортировать SDL; конфликт управляющих действий: 409 `PROJECT_BUSY`. `/ready` проверяет PostgreSQL и наличие активной demo schema, а upstream health проверяется отдельно per project.

Admin headers: `Authorization: Bearer <ADMIN_TOKEN>`. Для внешних проектов создание, schema management, регистрация и запуск тестов требуют admin. Действия demo project открыты в явно локальном демонстрационном режиме. Proxy headers Authorization/x-api-key относятся к upstream, не к административному токену.

## Основные endpoints

| Method | Path                                    | Назначение / body                                                                                                                   |
| ------ | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/health`                               | Liveness, service version                                                                                                           |
| GET    | `/ready`                                | DB + schema readiness, 503 при недоступности                                                                                        |
| GET    | `/api/meta`                             | Методология, ограничения, admin configured                                                                                          |
| GET    | `/api/projects`                         | `{items: Project[]}`                                                                                                                |
| POST   | `/api/projects`                         | Admin: `{name,description?,upstream,sdl?}`. HTTPS endpoint из точного allowlist. 201; при неуспешной подготовке проект откатывается |
| GET    | `/api/projects/:id/connection`          | Настоящий `{__typename}` probe, `{connected,status,upstream}`                                                                       |
| GET    | `/api/projects/:id/analytics?range=24h` | Полный типизированный Analytics DTO                                                                                                 |
| GET    | `/api/projects/:id/coverage`            | Поля текущей схемы, observed/test/error/risk evidence                                                                               |
| GET    | `/api/projects/:id/operations`          | Группы по fingerprint, counts, latency, errors                                                                                      |
| GET    | `/api/projects/:id/risks`               | Объяснимые findings                                                                                                                 |
| GET    | `/api/projects/:id/requests`            | Фильтрация и пагинация событий                                                                                                      |
| GET    | `/api/projects/:id/requests/:requestId` | Один безопасный RequestEvent                                                                                                        |
| GET    | `/api/projects/:id/schemas`             | `{items:[{id,sdl,createdAt,hash}]}`                                                                                                 |
| POST   | `/api/projects/:id/schemas/introspect`  | Получить и активировать настоящую upstream schema                                                                                   |
| POST   | `/api/projects/:id/schemas/import`      | `{sdl,activate?:false}`; по умолчанию сохраняет кандидат                                                                            |
| POST   | `/api/projects/:id/schemas/diff`        | `{baseId,targetId}`; semantic changes + requests/tests базовой версии                                                               |
| GET    | `/api/projects/:id/tests`               | `{items:TestCase[],runs:TestRun[]}`; последние 30 runs                                                                              |
| POST   | `/api/projects/:id/tests`               | Зарегистрировать query: `{name,query,variables?,assertions,expectedError?}`. 201                                                    |
| POST   | `/api/projects/:id/tests/run`           | `{caseId?}`; синхронный настоящий прогон одного/всех тестов                                                                         |
| GET    | `/api/projects/:id/tests/suggestions`   | Query suggestions и required fixtures, без автоматического запуска                                                                  |
| POST   | `/api/projects/:id/demo/:scenario`      | Demo only: `discover`, `traffic`, `blindspots`, `incident`, `recover`, `changes`                                                    |
| GET    | `/api/projects/:id/demo/runs`           | Последние 30 сохранённых ScenarioResult с timestamp                                                                                 |
| POST   | `/api/projects/:id/reset`               | Demo only: fixtures + history reset + три baseline requests                                                                         |
| POST   | `/api/projects/:id/snapshots`           | `{label}`; сохранить metrics + schema ID, 201                                                                                       |
| GET    | `/api/projects/:id/report/json`         | Полный JSON с методологией                                                                                                          |
| GET    | `/api/projects/:id/report/csv`          | CSV coverage, attachment                                                                                                            |
| GET    | `/api/projects/:id/report/risks`        | JSON findings, attachment                                                                                                           |
| GET    | `/api/projects/:id/report/html`         | Печатный HTML, кнопка `window.print()`                                                                                              |
| GET    | `/api/projects/:id/events`              | Server-Sent Events                                                                                                                  |

### Request filters

- `page`: integer ≥ 1, default 1.
- `limit`: 1…100, default 25.
- `search`: поиск по operation name / safe query.
- `errors`: `true` / `false`, иначе все события.
- `type`: `query` / `mutation` / `unknown`.
- `field`: точный schema coordinate, например `Product.price`.
- `fingerprint`: SHA-256 нормализованной структуры; различает одноимённые операции.
- `minDuration`: milliseconds ≥ 0.
- `range`: `1h`, `24h` (default), `7d`, `all`.
- `sort`: `time` (default) или `duration`, по убыванию.

Ответ: `{items,total,page,limit}`. SQL inputs параметризованы; сортировка выбирается из фиксированного списка.

### GraphQL Proxy

`POST /proxy/:id/graphql`:

```json
{
  "query": "query User($id: ID!) { user(id: $id) { id name } }",
  "variables": { "id": "u1" },
  "operationName": "User"
}
```

`variables` и `operationName` могут отсутствовать или быть null. `extensions` передаются при наличии текста query. GET принимает `query`, JSON `variables`, `operationName`, JSON `extensions` в URL; GET mutations запрещены. Subscription, multipart, incremental streaming и APQ without query text не реализованы.

Фактический upstream status/content-type/response передаются клиенту. В ответе есть `X-INNOSIGHT-Request-ID`. HTTP 200 с `errors` считается ошибочным событием runtime health. Синтаксическая/validation ошибка не добавляет выбранные поля.

Лимиты: request 128 KiB; text query до 100000 символов в пределах body limit; upstream response 5 MiB; timeout 10 s. Refused connection → 502 `UPSTREAM_UNAVAILABLE`; timeout → 504 `UPSTREAM_TIMEOUT`; response size limit → 502 `UPSTREAM_RESPONSE_TOO_LARGE`. Отключение клиента отменяет upstream и сохраняется как telemetry 499 `CLIENT_CANCELLED` (ответ отключившемуся клиенту уже не доставляется).

### Assertions

```json
{
  "name": "Product price",
  "query": "query { products { id price } }",
  "assertions": [
    { "path": "data.products", "operator": "minLength", "expected": 1 },
    { "path": "data.products.0.price", "operator": "equals", "expected": 249 }
  ]
}
```

Операторы: `exists` (не null и не missing), глубокое строгое `equals` (обязательный expected), `minLength` (неотрицательное целое expected для string/array). Пустой массив assertions разрешён для исследования, но такой test case считается failed и не повышает verified coverage. Секреты нельзя помещать в сохраняемые fixtures/expected.

### SSE

Сначала:

```text
event: connected
data: {"projectId":"demo"}
```

После commit события:

```text
event: update
data: {"type":"request","at":"…","data":{"id":"…","fields":["Product.price"]}}
```

Другие типы: `tests`, `schema`, `demo`, `snapshot`, `reset`. Каждые 15 s приходит heartbeat-комментарий. Replay по Last-Event-ID не реализован: клиент на каждом reconnect перечитывает актуальное persisted state, поэтому не зависит от доставки каждого notification.

## Прогоны внешних автотестов (1.1)

| Method | Path                                           | Body / response                                                       |
| ------ | ---------------------------------------------- | --------------------------------------------------------------------- |
| POST   | `/api/projects/:id/captures`                   | `{ "label": "CI build 42" }` → 201 CaptureReport + **token один раз** |
| GET    | `/api/projects/:id/captures`                   | `{items: CaptureSummary[]}` — последние 50                            |
| GET    | `/api/projects/:id/captures/:captureId`        | Поля, типы, метрики, закреплённая schemaId, methodology               |
| POST   | `/api/projects/:id/captures/:captureId/finish` | Идемпотентное завершение, timestamp и итоговый отчёт                  |
| GET    | `/api/projects/:id/captures/:captureId/report` | JSON attachment, без токена                                           |

Внешние проекты требуют admin для создания/завершения. Добавьте заголовок `X-Innosight-Capture: <token>` к GraphQL Proxy. Запрос сохранится с `origin=test`, `captureId`; обычный трафик не включается. `GET .../requests?capture=<uuid>` фильтрует историю. Токен не возвращается при чтении, не передаётся upstream, хранится только SHA-256. Неверный токен — 401 INVALID_CAPTURE_TOKEN, завершённый — 409 CAPTURE_FINISHED, несовпадение активной схемы — 409 CAPTURE_SCHEMA_CHANGED. Покрытие — unique selected output fields и object/interface types с хотя бы одним выбранным полем. Verified от внешнего токена не меняется. SSE update отправляется после сохранения запроса или изменения состояния прогона.
