import { createHash } from 'node:crypto';
import pg from 'pg';
import { readFile, readdir } from 'node:fs/promises';
export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://innosight:innosight@localhost:5432/innosight',
  max: 10,
  connectionTimeoutMillis: 5000,
});
// Idle connection errors must not become unhandled EventEmitter exceptions. Query
// failures are reported by the API and readiness check, without leaking credentials.
pool.on('error', () =>
  process.stderr.write(
    JSON.stringify({
      level: 'error',
      code: 'DATABASE_CONNECTION_LOST',
      message: 'PostgreSQL idle connection lost; future requests will reconnect.',
    }) + '\n',
  ),
);
export async function migrate() {
  const directory = new URL('../../../prisma/migrations/', import.meta.url);
  const folders = (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(712098)');
    await client.query(
      'CREATE TABLE IF NOT EXISTS _migrations(id text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())',
    );
    for (const id of folders) {
      const sql = await readFile(new URL(id + '/migration.sql', directory), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const existing = await client.query('SELECT checksum FROM _migrations WHERE id=$1', [id]);
      if (existing.rowCount && existing.rows[0].checksum !== checksum)
        throw new Error(
          `Applied migration checksum mismatch: ${id}. Create a new migration instead of editing history.`,
        );
      if (!existing.rowCount) {
        await client.query(sql);
        await client.query('INSERT INTO _migrations(id,checksum) VALUES($1,$2)', [id, checksum]);
      }
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
