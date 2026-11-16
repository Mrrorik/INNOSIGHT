# Архитектура INNOSIGHT

## Компоненты

- `apps/web`: React SPA, типизированные API DTO, TanStack Query, route-level lazy loading. nginx в Docker обслуживает production assets и проксирует REST, GraphQL и SSE. Vite используется для разработки.
- `apps/server`: один Fastify-процесс. Модули `proxy`, `analysis`, `analytics`, `testing`, `demo`, `store`, `locks`, `upstream`, `reports` разделяют transport, чистую математику и хранение.
- `apps/demo-api`: отдельный GraphQL Yoga API с commerce fixtures. Resolvers действительно фильтруют, пагинируют, связывают и изменяют данные. Предсказуемый slow resolver и управляемый resolver error.
- PostgreSQL: migrations ledger, projects, schema versions, request events, test definitions, runs, verified evidence, snapshots, demo runs.
- `packages/shared`: DTO и формулировка методологии для клиента и сервера.

## Поток запроса

1. Клиент отправляет JSON POST или query GET на `/proxy/:projectId/graphql`.
2. Proxy выбирает **заранее настроенный** upstream проекта и текущую schema version. Произвольного destination в запросе нет.
3. graphql-js парсит и валидирует документ, выбирает operationName, приводит variables, учитывает directives и раскрывает fragments. Координаты полей и response paths вычисляются независимо от бизнес-ответа.
4. Один `fetch` отправляет запрос upstream. Headers ограничены; redirects запрещены; timeout и response limit применяются к настоящему сетевому вызову. Отключение клиента отменяет upstream.
5. Proxy получает фактический статус и response, измеряет upstream latency. Ошибки JSON GraphQL внутри HTTP 200 сохраняются как ошибки операции.
6. Безопасный RequestEvent записывается в PostgreSQL с UUID и schema ID. Variables, Authorization и response body не сохраняются. Литералы структуры операции скрываются до INSERT. Даже синтаксическая ошибка не записывает raw parser message с входными токенами.
7. Только после сохранения события публикуется SSE update. Proxy возвращает upstream response и `X-INNOSIGHT-Request-ID`.
8. UI группирует частые уведомления, перечитывает analytics/history/tests. EventSource восстанавливает соединение, а `open/connected` инициирует полное перечитывание актуальных данных. Периодический refetch — дополнительное восстановление состояния.

Если PostgreSQL недоступен и событие не может быть сохранено, proxy возвращает ошибку сервера: durable background queue в этой версии нет. Это ограничение fail-closed режима, а не гарантия production-grade fail-open observability.

## Хранение и согласованность

Миграции исполняются транзакционно, последовательно, под `pg_advisory_xact_lock`. `_migrations` хранит ID и SHA-256: изменять применённую миграцию нельзя. Новая миграция — новая директория с `migration.sql`.

SchemaVersion имеет уникальную пару `(project, canonical SDL hash)`. Повторная introspection одной схемы не создаёт дубликат версии. Project хранит active schema ID. Неактивный кандидат можно сравнивать без изменения proxy.

RequestEvent хранит schema ID, безопасный AST print, hash структуры, metadata, список координат и безопасные коды/пути ошибок. UUID primary key обеспечивает идемпотентность повторного INSERT того же технического события. Два отдельных клиентских вызова — два разных события, даже если query одинаковый.

События и verified evidence привязаны к schema version. Активация другой версии создаёт собственное покрытие, не удаляя старую историю. Runtime health и Request Explorer используют историю проекта за выбранный период, включая старые версии. Snapshots хранят собственный schema ID; сравнение разных знаменателей явно ограничено.

TestRun и VerifiedField записываются одной транзакцией. Ошибочный тест не добавляет evidence. Уже полученное подтверждение накопительное для версии: последующий failing run не стирает прошлый успешный факт; runtime errors остаются отдельным сигналом.

Управляющие действия проекта и in-flight proxy writes координируются через AsyncLocalStorage и process-local read/exclusive guards. Demo → tests → proxy допускает вложенное владение. Конкурирующий Reset/тест/смена схемы возвращает 409. Это рассчитано на один backend-процесс; для горизонтального масштабирования нужен distributed/DB coordination.

## Модель покрытия

Знаменатель — поля `GraphQLObjectType` и `GraphQLInterfaceType`, без introspection. Input objects не входят в selection coverage. Union не имеет собственных полей, но его object branches учитываются через fragments.

Для наблюдаемой операции используются schema coordinates, например `Query.products`, `Product.price`. Повторные occurrences одного поля в одном документе дают одно наблюдение этого coordinate на request event. Aliases меняют response path, но не coordinate. Variable defaults и @skip/@include вычисляются graphql-js. Невалидный документ или невалидные обязательные variables не добавляют выбранные поля.

Abstract branches — статически возможные selections. Это **не resolver execution coverage**. Два разных concrete coordinates на одном abstract response path не получают test evidence по неоднозначному пути.

Пути assertions имеют вид `data.orders.0.items.0.product.name`. Проверяются `exists`, глубокое `equals`, `minLength`. Числовые индексы снимаются только при сопоставлении с AST paths. Успешный scalar assertion подтверждает соответствующий coordinate и структурные предки пути. Соседние поля не получают подтверждение. Missing/null пути и assertions ошибок не подтверждают data fields.

`selection = observed unique / schema output fields × 100`.

`verified = assertion-verified unique / schema output fields × 100`.

`error rate = events with HTTP ≥ 400 or nonempty GraphQL errors / period events × 100`.

`p95 = sorted durations[ceil(0.95 × N) − 1]`; для пустой выборки — 0.

Latency — время получения upstream response, не время ожидания клиентом и не resolver tracing. Timeline — 24 фактических временных bucket, включая пустые; данные не генерируются для красоты.

## Risk Intelligence

Score ограничен 100. Без тестов: 15 для ненаблюдавшегося поля либо `min(45, 20 + round(log2(count+1)×5))` для используемого поля. Связанные ошибки: `min(40, 20 + round(errorCount/max(count,1)×20))`. Используемое deprecated-поле: +25. High ≥ 60, medium ≥ 30, low ≥ 15.

Это приоритизация тестирования, не vulnerability scanner. Ошибка request event коррелирует со всеми выбранными полями этого события; виновный resolver не объявляется доказанным.

## Change Impact

`findBreakingChanges` / `findDangerousChanges` graphql-js сравнивают исполняемые схемы, а не строки SDL. Из semantic change извлекается соответствующий schema identifier. Для поля используются observed coordinates. Для enum/input/type changes выполняется обход output/argument dependencies, включая вложенные input objects. Потенциально затронутые requests и test cases берутся из evidence базовой версии.

Это консервативный анализ на уровне selections и типов. Он не доказывает использование конкретного значения enum или аргумента; эти значения намеренно не сохраняются. В UI указывается основание влияния. Направление base → target можно выбирать явно.

## Безопасность

- Сервисы Compose доступны с localhost. Demo без login; внешняя администрация требует ADMIN_TOKEN.
- Exact HTTPS upstream allowlist, без URL credentials/query/fragment; fetch redirects отключены.
- Configured upstream credentials — только server environment map, keyed by exact allowlisted URL. Клиентские Authorization/x-api-key передаются только выбранному upstream; headers не сохраняются.
- Административный токен сравнивается constant-time для равной длины, живёт в памяти UI.
- Размер request 128 KiB, timeout upstream 10 s, response limit 5 MiB, parser token/depth limits.
- SQL inputs параметризованы; dynamic sort/table identifiers взяты из фиксированных внутренних списков.
- HTML reports экранируют данные; CSV нейтрализует formula prefixes. nginx access logs содержат URI path без query arguments. GraphQL-specific nginx error logs отключены, чтобы не записывать raw GET variables; безопасные status logs и backend events доступны.
- CSP и заголовки nginx ограничивают frontend внешние подключения и embedding. Шрифты и assets локальные.

## Что потребуется перед production rollout

SSO/RBAC, real tenancy, TLS/reverse-proxy deployment policy, audit of admin actions, fail-open durable telemetry queue, SQL aggregates/retention, backup/restore policy и нагрузочные испытания. Текущая версия осознанно рассчитана на локальное демонстрационное использование одним backend instance.

Операции группируются по fingerprint безопасной нормализованной структуры, а не только по operationName: разные документы с одинаковым именем остаются отдельными операциями. Литеральные значения не используются как сохранённая идентичность. Переход из Change Impact / top operations передаёт точный fingerprint в Explorer.

## External automated-test captures (1.1)

`capture_sessions` anchors a named CI/test run to project + schema version. A cryptographically random 32-byte token is returned exactly once; only SHA-256 is persisted. Requests with `X-Innosight-Capture` are resolved before forwarding, run within the existing project activity guard, and persist `capture_id` and origin `test`. The header is not forwarded upstream. Finish is an exclusive project action, so it cannot race in-flight capture writes in the supported single-process deployment.

The report aggregates actual request events for one capture, counts unique selected output coordinates and object/interface types with selected fields, reports failed events separately, and includes all untouched fields. It does not create verified_fields. Schema activation makes an old token unusable, while reports retain the old schema denominator. Capture creation/finish require admin on external projects; local demo management remains open. SSE invalidates capture lists/reports after writes. `preClose` ends active SSE responses so backend shutdown can complete gracefully.

The UI defaults to a light workspace; an optional dark theme is persisted in localStorage. No theme setting changes analytical data. Static offline launch guide is generated by `scripts/render-guide.py` from START_HERE_RU.md and included in the web build.
