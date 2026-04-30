import { sql } from './lib/db';

async function check() {
  const tables = await sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`;
  console.log('Tables:', tables.map((t) => (t as {tablename: string}).tablename));
}

check();
