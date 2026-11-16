# INNOSIGHT 1.1 — проверка поставки

Дата: 14 ноября 2026. Это отчёт о **выполненных** проверках обновлённого проекта. Исторические `RELEASE_AUDIT.md`, `QA_RESULTS.json`, `RUNTIME_RESULTS.json`, `SMOKE_RESULTS.json`, `DEMO_CAPTURE_RESULTS.json` описывают версию 1.0; свежие машинные результаты находятся в **verification-1.1/**.

## Что изменено

- Сохранён существующий monorepo и вся основная технология. Новый учёт внешних автотестов соответствует задаче компании Zunami: именованные прогоны, endpoint + одноразовый token header, отдельное покрытие полей/типов, незатронутые поля, история и JSON.
- Добавлена миграция 002 поверх неизменённой 001. Токен случайный 256-bit, в БД только SHA-256; завершение блокирует новые запросы. Прогон закреплён за схемой и проектом. Admin нужен для управления внешними проектами.
- Интерфейс переработан: светлая рабочая область, графитовая навигация, спокойная палитра, простые заголовки, менее декоративные панели, адаптивная сетка и сохраняемая тёмная тема. Реальные графики/граф/действия сохранены.
- Исправлено graceful shutdown с активными SSE-подключениями. Docker web install/build объединены в один RUN для уменьшения промежуточных слоёв.
- Добавлены подробный русский START_HERE_RU.md, самостоятельный офлайн-HTML, launch helpers Windows/macOS/Linux, оригинальные материалы компании и матрица соответствия.

## Фактические результаты

| Проверка                                          | Результат                     | Подтверждение                                                                       |
| ------------------------------------------------- | ----------------------------- | ----------------------------------------------------------------------------------- |
| TypeScript strict                                 | PASS                          | `npm run typecheck`                                                                 |
| ESLint                                            | PASS                          | `npm run lint`                                                                      |
| Prettier                                          | PASS                          | `npm run format:check`; generated HTML исключён, canonical source — Markdown        |
| Unit/security/integration                         | **62 / 62**, 0 failures       | `verification-1.1/unit-integration.json`                                            |
| Browser E2E на конечном nginx/Compose             | **10 / 10**, 0 skipped/flaky  | `verification-1.1/browser.json`                                                     |
| npm audit                                         | **0 vulnerabilities**         | `verification-1.1/npm-audit.json`                                                   |
| Docker runtime + web targets                      | Собраны и запущены            | Node Alpine, nginx Alpine, PostgreSQL 17                                            |
| Четыре сервиса                                    | **healthy**                   | postgres, demo-api, server, web                                                     |
| Настоящий HTTP/SSE smoke                          | PASS                          | `verification-1.1/smoke.json`                                                       |
| Полный Compose down/up без удаления volume        | PASS                          | `verification-1.1/runtime.json`                                                     |
| Сохранность прогона, ID запросов, схемы, snapshot | PASS                          | Тот же runtime audit                                                                |
| Обновление открытого Dashboard после restart      | PASS, без reload              | Coverage 28.28% → 29.29%, Verified 0%                                               |
| Свежие скриншоты и PDF                            | Получены из работающей сборки | `screenshots/`, `INNOSIGHT_SAMPLE_REPORT.pdf`, `verification-1.1/demo-capture.json` |
| Bash helper                                       | Проверен синтаксис            | `bash -n START_MAC_LINUX.sh`                                                        |

Backend: 20 анализаторов/schema tests, 31 real HTTP/PostgreSQL integration, 8 security, 3 coordination. Интеграции используют отдельную `innosight_test`, настоящую Yoga API и локальную HTTPS/TLS fixture с openssl; сравнивают direct/proxy response, проверяют AST selections, privacy, ошибки, timeout, ограничение response, cancellation, schema boundaries, assertions и перезапуск.

Capture-проверки подтверждают: два настоящих запроса дают ровно 5/99 полей и три затронутых типа; посторонний запрос не входит в отчёт; hash отличается от исходного токена; токен не передаётся upstream; законченный/неверный/старой схемы токен отклоняется; чужой проект не получает доступ к отчёту или токену; внешнее управление требует admin; Verified не растёт от внешних selections.

Browser E2E: вертикальная цепочка Playground → Proxy → SQL → coverage → другая вкладка Dashboard/SSE, assertions, все шесть Demo Lab сценариев, Graph Universe с 16 MiniMap nodes и контролами, Change Impact, exports/snapshots, negative no-assertion case, 13 маршрутов при 1280/390px, clipboard/keyboard/ROI, отдельный внешний capture, populated mobile capture, обе темы и руководство.

## Реальная демонстрационная выборка

Финальные изображения и PDF сделаны после настоящего Reset, шести сценариев, двух запросов отдельного CI-прогона и запроса Playground. На момент фиксации: **85/99 observed (85.86%), 80/99 verified (80.81%), 26 запросов, 3 намеренные ошибки, 2 breaking changes, 2 snapshots**. P95 измерен, зависит от машины; не является обещанием производительности.

На чистой установке стартовые показатели ниже: **3 запроса, 25/99 observed, 0 verified**. Demo Lab/Test Lab дают пользователю самостоятельно воспроизвести рост. ZIP содержит исходники, а не копию пользовательского Docker volume.

## Найдено и исправлено при аудите

1. Внешние автотесты раньше не имели отдельного учёта запуска; добавлены capture sessions, изоляция данных и отчёт.
2. Активный SSE мог удерживать завершение backend; `preClose` закрывает streams. Проверено с живым reader и полным Compose restart.
3. Заполненная capture-страница растягивалась на 390px. Устранены intrinsic minimum grid sizes; повторный production E2E проверяет отсутствие overflow и делает снимок.
4. Подписи осей были недостаточно контрастны в новой тёмной теме. Их цвет теперь зависит от theme variables.
5. Вспомогательный генератор PDF сначала обращался к неверному маршруту. Исправлен на `/report/html`, добавлены проверки HTTP 200 и заголовка. Финальный PDF проверен `pdfinfo` и `pdftotext`: три A4-страницы, Nexus Commerce, актуальные метрики и методология.

## Среда и границы проверки

Проверено на managed Linux, Node 24, headless Chromium, rootless Docker/vfs, Compose v2. Реальные Windows/macOS машины в этой сессии не использовались; для них подготовлены инструкции и helpers, без заявления о нативном тестировании.

Диск облачной среды около 8 GB несколько раз заполнялся при vfs-копировании слоёв. Первая пересборка и один TLS fixture setup остановились с ENOSPC; это зафиксировано в PROGRESS.md. Удалялись только task build cache, заменяемые контейнеры и ненужные INNOSIGHT images, **PostgreSQL volume сохранён**. После очистки backend suite прошёл 62/62, все targets собраны, финальный production E2E прошёл 10/10. Чистая облачная сборка использовала дополнительный публичный CA через необязательный BuildKit secret; сертификат и временный override не включены в ZIP. Основная команда Compose с cached steps отдельно выполнена без override.

Выпуск предназначен для локальной демонстрации и технической оценки. Не реализованы enterprise SSO/RBAC, публичный reader auth, распределённые locks/pubsub, retention, WebSocket subscriptions, multipart/incremental GraphQL и APQ без query text. Не заявлены production SLA, нагрузочная сертификация или внешний pentest. См. SECURITY.md и COMPANY_REQUIREMENTS.md.

## Команды воспроизведения

Приложение без Node на компьютере:

```sh
docker compose up -d --build --wait
```

Затем http://localhost:3000. Подробности для новичка: START_HERE_RU.md / START_HERE.html.

С Node 24 и установленными npm devDependencies:

```sh
npm ci
npm run typecheck
npm run lint
npm run format:check
npm test
npx playwright install chromium
npm run test:e2e
npm run demo:verify
node docs/verification-1.1/verify-runtime.mjs
node docs/verification-1.1/capture-product.mjs
```

Последние четыре команды изменяют/сбрасывают demo-данные. Runtime audit действительно останавливает/запускает Compose. Их выполняют последовательно, не во время выступления. `npm run demo:verify` пишет стандартный docs/SMOKE_RESULTS.json; в этой поставке свежая копия сохранена отдельно в verification-1.1/smoke.json для отделения исторических результатов.
