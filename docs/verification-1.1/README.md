# Свежие результаты INNOSIGHT 1.1

Все JSON в этом каталоге получены 2026-11-14, отдельно от исторических отчётов 1.0 в родительском каталоге.

- `unit-integration.json`: исходный Vitest JSON, 62 успешные проверки.
- `browser.json`: исходный Playwright JSON конечной nginx/Compose сборки, 10 successful, 0 skipped/flaky.
- `npm-audit.json`: актуальный npm audit, 0 vulnerabilities.
- `smoke.json`: реальные HTTP, PostgreSQL, coverage, assertions, exports и SSE.
- `runtime.json`: полный Compose down/up, сохранность capture/истории/snapshot и обновление открытой страницы.
- `demo-capture.json`: фактическая выборка финальных скриншотов и трёхстраничного PDF.

`verify-runtime.mjs` воспроизводит restart-аудит и действительно останавливает все сервисы. `capture-product.mjs` воспроизводит демонстрационные материалы. Оба требуют Node 24, npm devDependencies, установленный Playwright Chromium и запущенный Compose; **сбрасывают demo-проект**, внешние проекты не затрагивают. Запускайте последовательно из корня проекта. На других машинах latency и timestamps будут отличаться.

Итоговое объяснение результатов и ограничений: `../RELEASE_1_1.md`. Инструкция для первого запуска: `../../START_HERE_RU.md`.
