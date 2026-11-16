# INNOSIGHT · Product Release Audit

> Исторический аудит версии 1.0 от 2026-11-13. Проверки обновлённой версии: [RELEASE_1_1.md](RELEASE_1_1.md).

Дата: 2026-11-13. Область готовности: самодостаточная локальная платформа для хакатона и демонстрации покупателям.

## Подтверждённый результат

**59/59 unit/security/integration tests, 8/8 production Playwright scenarios, 0 skipped, 0 flaky, npm audit: 0 vulnerabilities.** TypeScript strict, ESLint и форматирование прошли. Production assets собраны Vite и обслуживаются nginx; PostgreSQL, Demo API, backend и frontend достигли healthy.

Машиночитаемые результаты:

- [QA_RESULTS.json](QA_RESULTS.json) — числа и разбивка проверок.
- [SMOKE_RESULTS.json](SMOKE_RESULTS.json) — настоящая HTTP-цепочка через nginx и PostgreSQL.
- [RUNTIME_RESULTS.json](RUNTIME_RESULTS.json) — полный stop/start и восстановление SSE без reload.
- [DEMO_CAPTURE_RESULTS.json](DEMO_CAPTURE_RESULTS.json) — фактические данные финальной демонстрации.
- [INNOSIGHT_SAMPLE_REPORT.pdf](INNOSIGHT_SAMPLE_REPORT.pdf) — настоящий PDF, созданный Chromium из HTML-отчёта.

## Проверенная вертикальная цепочка

Demo Yoga API → HTTP Proxy → graphql-js AST → PostgreSQL → Analytics API → nginx → Live Dashboard.

После Reset: 3 реально выполненных запроса, 25/99 observed fields, 25.25% selection coverage, 0% verified. HTTP-запрос `SmokeDiscovery` выбрал три новых поля: 28/99, 28.28%. Обычный запрос оставил verified на 0. Восемь зарегистрированных тестов прошли реальные assertions: 80/99 verified fields, 80.81%. Ошибка resolver сохранилась при HTTP 200. Semantic diff обнаружил два breaking changes, связанные с наблюдавшимися операциями и тестами. JSON/CSV/risks/HTML возвращены фактическим frontend reverse proxy. SSE notification получен по HTTP.

Latency в результатах — измеренное значение конкретного прогона, не обещание производительности. Dataset commerce — демонстрационные fixtures; metrics и traffic сгенерированы исполнением, а не числовыми константами.

## Автоматические проверки

- 20 analysis tests: operationName, nested/aliased fields, reusable/inline fragments, directives/default variables/coercion, interfaces/unions, introspection exclusion, безопасный AST, coverage/percentiles/risk math, semantic diff, nested input/enum dependencies и assertion evidence.
- 28 integration tests: настоящие HTTP upstream и PostgreSQL, GET/POST, actual response/status, HTTP 200 GraphQL errors, validation errors, refused connection, actual 10-second timeout, client cancellation, 5 MiB limit, invalid upstream response, event persistence/idempotence, tests без assertions/с failed assertion, SSE, exports/snapshots, reset, backend restart, schema isolation, authenticated HTTPS project и redirect refusal.
- 8 security tests: admin closed-by-default, exact allowlist, credential routing, HTML escaping, CSV formula protection.
- 3 coordination tests: concurrent proxy requests, exclusive management, reentrancy и lock release after failure.
- 8 Playwright scenarios на **production nginx/Compose**, не Vite dev: two-tab coverage update, offline data recovery, Test Lab assertions, все шесть Demo Lab experiments, durable demo history after reload, MiniMap из 16 узлов, поиск/filter/type/field details, auto layout, zoom/fullscreen, Change Impact, CSV download, HTML report, snapshots, no-assertions negative case, все 12 страниц при 1280/390 px, clipboard, keyboard navigation, ROI и introspection refresh.

В обычных browser scenarios не обнаружены JavaScript/console errors или horizontal overflow. Chromium offline emulation не обязана закрывать уже открытый localhost SSE socket; тест проверяет восстановление данных. Фактический disconnect/reconnect проверен отдельно остановкой контейнеров.

## Сохранность и реальное восстановление

Открытая вкладка Dashboard пережила `docker compose down -t 3` и `docker compose up -d --no-build --wait` без удаления volume. Сохранились 13 request events, active schema ID, TestRun, verified evidence и snapshot. EventSource действительно потерял соединение и восстановился. Следующий настоящий запрос добавил Query.node/Node.id: coverage 82.83% → 84.85%, verified осталось 80.81%. Dashboard обновился без reload; `performance.timeOrigin` не изменился. Все четыре сервиса снова healthy.

Отдельный GET с тестовым чувствительным литералом прошёл через proxy; значение отсутствовало в nginx и backend logs.

## Найдено и исправлено в ходе аудита

1. Обязательный Payment у неоплаченного заказа приводил к null propagation. Исправлена nullability и проверен настоящий Order test.
2. Невалидные значения variables и raw parser messages могли давать неверный coverage / раскрывать токены. Добавлены graphql-js coercion и безопасные сообщения.
3. Runtime health ошибочно ограничивался активной schema version. Теперь history health сохраняет события проекта, а coverage остаётся отдельным для версии.
4. Reset мог пересечься с proxy/test write. Добавлена координация с корректным 409 и reentrant demo → tests → proxy.
5. В Docker приватные права 0600/0700 рабочей папки мешали non-root runtime. COPY явно задаёт владельцев node/nginx; nginx config — 0644.
6. Cloud proxy приводил к ложному 403 локального BusyBox healthcheck. Probe обращается к loopback напрямую (`-Y off`); все healthchecks выполнены.
7. В MiniMap отсутствовали узлы, потому что controlled dimensions не сохранялись. Реализовано onNodesChange, measured dimensions и dragged positions; production E2E проверяет 16 реальных rect nodes.
8. Скрыты sensitive GET arguments из nginx access/error logs; query bodies и credentials не пишутся в request history.
9. Устранены npm advisories в старой Vitest/worker и minimatch цепочке; полный audit вернул 0.
10. Дополнены meaningful assertions validation, uniform 404, invalid upstream response recording и точная идентификация одноимённых операций по fingerprint.

## Среда и точность утверждений

Проверки выполнены на Node 24 и Chromium в managed Linux. Docker Engine 29.9.2 использует rootless `vfs` на диске около 8 GB. Сборка всех targets прошла; для облачного npm TLS использовался дополнительный Compose override с временным публичным CA BuildKit secret. Для локального запуска этот override и CA не нужны.

При проверке vfs несколько раз исчерпывал диск; удалялись только созданные задачей caches/dangling images, browser cache временно сжимался и затем восстановлен. PostgreSQL volume не удалялся. Docker build и последующий `up --no-build --wait` подтверждены раздельно после очистки кешей; это ограничение облачного storage, не скрытая зависимость продукта.

## Оставшиеся границы

- Local demo mode без enterprise login/SSO/RBAC и полноценной multi-tenancy. Не заявляется production SLA.
- Нет WebSocket subscriptions, multipart/incremental delivery и APQ без query text; cookie-based auth не проксируется. Credentials ограничены documented headers.
- Graph Universe фокусируется на object/interface/union output types. Enum/input definitions доступны в SDL и Change Impact; они не выдаются за поля selection coverage.
- Нет resolver execution tracing. Abstract selections и type-dependency impact консервативны; отсутствие наблюдений не доказывает отсутствие клиентов.
- Analytics агрегирует историю в памяти одного backend instance; нет больших нагрузочных/retention испытаний и durable fail-open telemetry queue. При невозможности сохранить событие в БД proxy работает fail-closed.
- Business mutations Demo API хранятся в памяти; аналитика, schema/test evidence и snapshots — в PostgreSQL.
- Проверен Chromium и responsive viewports; физические мобильные устройства, Firefox/WebKit и системные print dialogs вручную не проверялись. HTML реально отрендерен в PDF браузерным движком.

Критических необработанных дефектов в выполненных основных сценариях после исправлений не обнаружено. Этот вывод относится к перечисленным проверкам и не подменяет production rollout audit.
