import { createApp } from './app.js';
import { pool } from './db.js';
const app = await createApp({ logger: true });
await app.listen({ host: '0.0.0.0', port: Number(process.env.PORT || 4000) });
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, async () => {
    await app.close();
    await pool.end();
    process.exit(0);
  });
