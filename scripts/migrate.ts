import { migrate, pool } from '../apps/server/src/db.js';
await migrate();
await pool.end();
console.log('Database migrations applied.');
