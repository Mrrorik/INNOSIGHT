# Запуск INNOSIGHT на Railway

Весь проект (сайт + API + демо-API) собирается в **один** сервис из `Dockerfile` (последний этап `railway`). Нужна ещё только база PostgreSQL.

1. Загрузите проект на GitHub (в корне репозитория должны лежать `Dockerfile`, `railway.json`, `apps/`, `infra/`).
2. Railway → **New Project → Deploy from GitHub repo** → выберите репозиторий.
3. В проекте нажмите **+ New → Database → Add PostgreSQL**.
4. Откройте сервис с приложением → **Variables** → **New Variable**:
   - `DATABASE_URL` = `${{Postgres.DATABASE_URL}}` (имя `Postgres` — как называется ваш сервис с базой).
5. (По желанию) `ADMIN_TOKEN` и `UPSTREAM_ALLOWLIST` — см. `.env.example`. Для демо не нужны.
6. **Settings → Networking → Generate Domain**. Откройте выданную ссылку, затем **Demo Lab → Start Demo**.

Порт задавать не нужно: Railway сам передаёт `PORT`, nginx слушает его.

Если сборка или запуск не удались, пришлите текст из **Build Logs** / **Deploy Logs**.

Локально проект по-прежнему запускается через `docker compose up -d --build --wait`.
