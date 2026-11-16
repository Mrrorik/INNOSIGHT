import pg from 'pg';
const url = new URL(
  process.env.TEST_DATABASE_URL || 'postgresql://innosight:innosight@localhost:5432/innosight_test',
);
const database = decodeURIComponent(url.pathname.slice(1));
if (!/^[a-zA-Z0-9_]+_test$/.test(database))
  throw new Error(
    'TEST_DATABASE_URL database name must end with _test. Refusing to modify a non-test database.',
  );
url.pathname = '/postgres';
const client = new pg.Client({ connectionString: url.href });
try {
  await client.connect();
  const found = await client.query('SELECT 1 FROM pg_database WHERE datname=$1', [database]);
  if (!found.rowCount) await client.query(`CREATE DATABASE "${database}"`);
  console.log(`Test database ready: ${database}`);
} finally {
  await client.end();
}
