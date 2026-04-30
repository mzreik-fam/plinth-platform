import { Client } from '@neondatabase/serverless';

async function migrate() {
  const client = new Client(process.env.DATABASE_URL);
  await client.connect();

  try {
    console.log('Creating areas table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS areas (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(tenant_id, name)
      );
    `);

    console.log('Adding area_id to projects...');
    await client.query(`
      ALTER TABLE projects
      ADD COLUMN IF NOT EXISTS area_id UUID REFERENCES areas(id) ON DELETE SET NULL;
    `);

    console.log('Migrating existing project locations to areas...');
    // For each tenant, create distinct areas from existing project.location values
    const locationsResult = await client.query(`
      SELECT DISTINCT tenant_id, location
      FROM projects
      WHERE location IS NOT NULL AND location <> ''
    `);

    for (const row of locationsResult.rows) {
      const areaResult = await client.query(`
        INSERT INTO areas (tenant_id, name)
        VALUES ($1, $2)
        ON CONFLICT (tenant_id, name) DO UPDATE SET name = EXCLUDED.name
        RETURNING id
      `, [row.tenant_id, row.location]);

      await client.query(`
        UPDATE projects
        SET area_id = $1
        WHERE tenant_id = $2 AND location = $3 AND area_id IS NULL
      `, [areaResult.rows[0].id, row.tenant_id, row.location]);
    }

    console.log('Creating indexes...');
    await client.query(`CREATE INDEX IF NOT EXISTS idx_areas_tenant ON areas(tenant_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_projects_area ON projects(area_id);`);

    console.log('Enabling RLS on areas...');
    await client.query(`ALTER TABLE areas ENABLE ROW LEVEL SECURITY;`);
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tenant_isolation' AND tablename = 'areas') THEN
          CREATE POLICY tenant_isolation ON areas FOR ALL USING (tenant_id = current_setting('app.current_tenant_id')::UUID);
        END IF;
      END
      $$;
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
