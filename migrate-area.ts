import { Client } from '@neondatabase/serverless';

async function migrate() {
  const client = new Client(process.env.DATABASE_URL);
  await client.connect();

  try {
    console.log('Adding area column to projects...');

    await client.query(`
      ALTER TABLE projects
      ADD COLUMN IF NOT EXISTS area TEXT;
    `);

    console.log('Migration complete.');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

migrate();
