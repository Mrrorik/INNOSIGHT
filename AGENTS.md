# INNOSIGHT engineering guide

Monorepo: apps/server (Fastify + proxy + intelligence), apps/demo-api (Yoga), apps/web (React), packages/shared (DTO), prisma/migrations (SQL), tests.

Commands: npm ci; npm run typecheck; npm run lint; npm test; npm run test:e2e; npm run build. Docker: docker compose up --build.

Use graphql-js AST and schema APIs. Coverage means selections, never resolver execution. Verified fields require successful registered assertions targeting response paths, with no GraphQL errors. Never persist variable values, response bodies, headers, or query literals in request history. Schema changes must not mix coverage across incompatible schemas. Admin-only external project configuration, exact upstream allowlist, no arbitrary proxy destinations. No invented metrics. Update PROGRESS.md with executed checks and remaining limitations after each stage. Preserve a runnable vertical slice. Record changes in git after stages.

Production lessons: managed source files may be 0600/0700, so Docker COPY must explicitly set node/nginx ownership. Keep the local-only nginx health probe independent of HTTP proxy variables. React Flow controlled nodes must preserve measured dimensions and positions through onNodesChange; production E2E asserts all 16 MiniMap nodes. Run browser tests on nginx Compose before claiming a release, not only Vite dev. Demo reset is explicitly destructive only to the demo project and restores the eight built-in tests.
