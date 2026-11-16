# Third-party components

Основные библиотеки: React, Vite, Fastify, graphql-js, GraphQL Yoga, PostgreSQL/pg, TanStack Query, Recharts, React Flow, Dagre, CodeMirror, Lucide, Zod, Vitest, Playwright, ESLint, nginx. Их лицензии доступны в соответствующих npm packages / официальных distributions. React Flow attribution сохранена в графе.

Golos Text и JetBrains Mono поставляются локально по SIL Open Font License. Копии лицензий включены в frontend: `/licenses/Golos-Text-OFL.txt` и `/licenses/JetBrains-Mono-OFL.txt`.

Npm overrides поднимают minimatch до совместимой версии 11.0.8 в `typescript-eslint`, `@eslint/config-array` и `eslint`, чтобы устранить GHSA-g3hv-75wg-m249. Совместимость проверяется lint и автоматическими тестами. Vitest обновлён до 5.1 для устранения advisories старой worker/mocker цепочки. Production backend image не содержит dev dependencies; frontend image содержит только nginx и собранные assets.
