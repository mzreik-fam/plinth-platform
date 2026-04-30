import { Client } from '@neondatabase/serverless';
import { hashPassword } from './lib/auth';

async function seed() {
  const client = new Client(process.env.DATABASE_URL);
  await client.connect();

  try {
    console.log('Running schema migration...');

    await client.query(`
      CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

      CREATE TABLE IF NOT EXISTS tenants (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name TEXT NOT NULL,
        slug TEXT UNIQUE NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
        email TEXT NOT NULL,
        username TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        full_name TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('platform_owner','super_admin','project_manager','admin','internal_agent','agency_admin','agency_agent','buyer')),
        is_active BOOLEAN DEFAULT true,
        invite_token TEXT UNIQUE,
        invite_expires_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(tenant_id, email),
        UNIQUE(tenant_id, username)
      );

      CREATE TABLE IF NOT EXISTS projects (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        location TEXT,
        status TEXT DEFAULT 'active',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS units (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
        project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
        unit_number TEXT NOT NULL,
        unit_type TEXT NOT NULL CHECK (unit_type IN ('villa','plot','apartment')),
        bedrooms INTEGER,
        bathrooms INTEGER,
        area_sqft NUMERIC,
        price NUMERIC NOT NULL,
        status TEXT DEFAULT 'draft' CHECK (status IN ('draft','available','pre_booked','booked','handed_over','terminated')),
        features JSONB DEFAULT '[]',
        images JSONB DEFAULT '[]',
        created_by UUID REFERENCES users(id),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS buyers (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
        full_name TEXT NOT NULL,
        email TEXT,
        phone TEXT NOT NULL,
        emirates_id TEXT,
        passport_number TEXT,
        nationality TEXT,
        address TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS payment_plans (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        description TEXT,
        milestones JSONB NOT NULL DEFAULT '[{\"label\":\"Booking\",\"percent\":20,\"due_days_from_booking\":0},{\"label\":\"Installment 1\",\"percent\":30,\"due_days_from_booking\":90},{\"label\":\"Installment 2\",\"percent\":30,\"due_days_from_booking\":180},{\"label\":\"Final\",\"percent\":20,\"due_days_from_booking\":365}]',
        is_default BOOLEAN DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS transactions (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
        unit_id UUID REFERENCES units(id) ON DELETE RESTRICT,
        buyer_id UUID REFERENCES buyers(id) ON DELETE RESTRICT,
        payment_plan_id UUID REFERENCES payment_plans(id),
        agent_id UUID REFERENCES users(id),
        status TEXT DEFAULT 'eoi' CHECK (status IN ('eoi','booking_pending','confirmed','cancelled','terminated')),
        eoi_amount NUMERIC,
        eoi_date TIMESTAMPTZ,
        booking_amount NUMERIC,
        booking_date TIMESTAMPTZ,
        total_price NUMERIC NOT NULL,
        signed_at TIMESTAMPTZ,
        portal_token TEXT UNIQUE,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS payments (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
        transaction_id UUID REFERENCES transactions(id) ON DELETE CASCADE,
        amount NUMERIC NOT NULL,
        payment_method TEXT CHECK (payment_method IN ('bank_transfer','cheque','cash','card')),
        reference_number TEXT,
        proof_url TEXT,
        status TEXT DEFAULT 'pending' CHECK (status IN ('pending','confirmed','rejected')),
        confirmed_by UUID REFERENCES users(id),
        confirmed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS documents (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
        transaction_id UUID REFERENCES transactions(id) ON DELETE CASCADE,
        category TEXT CHECK (category IN ('id_copy','contract','receipt','noc','proof_of_transfer','other')),
        file_name TEXT NOT NULL,
        file_url TEXT,
        uploaded_by UUID REFERENCES users(id),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS audit_logs (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
        user_id UUID REFERENCES users(id),
        action TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id UUID,
        details JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_units_tenant ON units(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_units_project ON units(project_id);
      CREATE INDEX IF NOT EXISTS idx_units_status ON units(status);
      CREATE INDEX IF NOT EXISTS idx_transactions_tenant ON transactions(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_transactions_unit ON transactions(unit_id);
      CREATE INDEX IF NOT EXISTS idx_transactions_buyer ON transactions(buyer_id);
      CREATE INDEX IF NOT EXISTS idx_payments_transaction ON payments(transaction_id);
      CREATE INDEX IF NOT EXISTS idx_documents_transaction ON documents(transaction_id);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant ON audit_logs(tenant_id);

      ALTER TABLE users ENABLE ROW LEVEL SECURITY;
      ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
      ALTER TABLE units ENABLE ROW LEVEL SECURITY;
      ALTER TABLE buyers ENABLE ROW LEVEL SECURITY;
      ALTER TABLE payment_plans ENABLE ROW LEVEL SECURITY;
      ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
      ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
      ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
      ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
    `);

    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tenant_isolation' AND tablename = 'users') THEN
          CREATE POLICY tenant_isolation ON users FOR ALL USING (tenant_id = current_setting('app.current_tenant_id')::UUID);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tenant_isolation' AND tablename = 'projects') THEN
          CREATE POLICY tenant_isolation ON projects FOR ALL USING (tenant_id = current_setting('app.current_tenant_id')::UUID);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tenant_isolation' AND tablename = 'units') THEN
          CREATE POLICY tenant_isolation ON units FOR ALL USING (tenant_id = current_setting('app.current_tenant_id')::UUID);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tenant_isolation' AND tablename = 'buyers') THEN
          CREATE POLICY tenant_isolation ON buyers FOR ALL USING (tenant_id = current_setting('app.current_tenant_id')::UUID);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tenant_isolation' AND tablename = 'payment_plans') THEN
          CREATE POLICY tenant_isolation ON payment_plans FOR ALL USING (tenant_id = current_setting('app.current_tenant_id')::UUID);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tenant_isolation' AND tablename = 'transactions') THEN
          CREATE POLICY tenant_isolation ON transactions FOR ALL USING (tenant_id = current_setting('app.current_tenant_id')::UUID);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tenant_isolation' AND tablename = 'payments') THEN
          CREATE POLICY tenant_isolation ON payments FOR ALL USING (tenant_id = current_setting('app.current_tenant_id')::UUID);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tenant_isolation' AND tablename = 'documents') THEN
          CREATE POLICY tenant_isolation ON documents FOR ALL USING (tenant_id = current_setting('app.current_tenant_id')::UUID);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tenant_isolation' AND tablename = 'audit_logs') THEN
          CREATE POLICY tenant_isolation ON audit_logs FOR ALL USING (tenant_id = current_setting('app.current_tenant_id')::UUID);
        END IF;
      END
      $$;
    `);

    console.log('Schema migration complete.');
    console.log('Starting data seed...');

    // 1. Create tenant (developer workspace)
    const tenantResult = await client.query(`
      INSERT INTO tenants (name, slug)
      VALUES ('fäm Properties', 'fam-properties')
      ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
      RETURNING id
    `);
    const tenantId = tenantResult.rows[0].id;
    console.log('Tenant created:', tenantId);

    // 2. Create Super Admin user
    const passwordHash = await hashPassword('admin123');
    const userResult = await client.query(`
      INSERT INTO users (tenant_id, email, username, password_hash, full_name, role)
      VALUES (
        '${tenantId}',
        'admin@plinth.ae',
        'admin',
        '${passwordHash}',
        'System Administrator',
        'super_admin'
      )
      ON CONFLICT (tenant_id, username) DO UPDATE SET
        password_hash = EXCLUDED.password_hash,
        full_name = EXCLUDED.full_name,
        role = EXCLUDED.role
      RETURNING id
    `);
    console.log('Super Admin created:', userResult.rows[0].id);

    // 3. Create sample projects
    const projects = [
      { name: 'Marina Heights', location: 'Dubai Marina' },
      { name: 'Palm Residences', location: 'Palm Jumeirah' },
      { name: 'Downtown Views', location: 'Downtown Dubai' },
    ];

    for (const project of projects) {
      await client.query(`
        INSERT INTO projects (tenant_id, name, location)
        VALUES ('${tenantId}', '${project.name}', '${project.location}')
        ON CONFLICT DO NOTHING
      `);
    }
    console.log('Projects created');

    // 4. Create sample payment plan
    await client.query(`
      INSERT INTO payment_plans (tenant_id, name, description, milestones, is_default)
      VALUES (
        '${tenantId}',
        'Standard 4-Stage Plan',
        '20% on booking, 30% at 90 days, 30% at 180 days, 20% final',
        '[{"label":"Booking","percent":20,"due_days_from_booking":0},{"label":"Installment 1","percent":30,"due_days_from_booking":90},{"label":"Installment 2","percent":30,"due_days_from_booking":180},{"label":"Final","percent":20,"due_days_from_booking":365}]'::jsonb,
        true
      )
      ON CONFLICT DO NOTHING
    `);
    console.log('Payment plan created');

    // 5. Create sample units
    const projectResult = await client.query(`SELECT id FROM projects WHERE tenant_id = '${tenantId}' LIMIT 1`);
    const projectId = projectResult.rows[0]?.id;

    if (projectId) {
      const units = [
        { unit_number: 'A-101', unit_type: 'apartment', bedrooms: 2, bathrooms: 2, area_sqft: 1200, price: 1500000, status: 'available' },
        { unit_number: 'A-102', unit_type: 'apartment', bedrooms: 1, bathrooms: 1, area_sqft: 850, price: 950000, status: 'available' },
        { unit_number: 'V-201', unit_type: 'villa', bedrooms: 4, bathrooms: 4, area_sqft: 3500, price: 4500000, status: 'draft' },
        { unit_number: 'P-301', unit_type: 'plot', bedrooms: null, bathrooms: null, area_sqft: 5000, price: 2800000, status: 'available' },
      ];

      for (const unit of units) {
        await client.query(`
          INSERT INTO units (tenant_id, project_id, unit_number, unit_type, bedrooms, bathrooms, area_sqft, price, status, created_by)
          VALUES (
            '${tenantId}', '${projectId}', '${unit.unit_number}', '${unit.unit_type}',
            ${unit.bedrooms || 'NULL'}, ${unit.bathrooms || 'NULL'}, ${unit.area_sqft}, ${unit.price},
            '${unit.status}', '${userResult.rows[0].id}'
          )
          ON CONFLICT DO NOTHING
        `);
      }
      console.log('Units created');
    }

    // 6. Create sample buyers
    const buyers = [
      { full_name: 'Ahmed Al-Rashid', email: 'ahmed@example.com', phone: '+971501234567', emirates_id: '784-1234-567890-1', nationality: 'UAE' },
      { full_name: 'Sarah Johnson', email: 'sarah@example.com', phone: '+971502345678', emirates_id: '784-2345-678901-2', nationality: 'UK' },
      { full_name: 'Mohammed Khan', email: 'mohammed@example.com', phone: '+971503456789', emirates_id: '784-3456-789012-3', nationality: 'Pakistan' },
    ];

    for (const buyer of buyers) {
      await client.query(`
        INSERT INTO buyers (tenant_id, full_name, email, phone, emirates_id, nationality)
        VALUES ('${tenantId}', '${buyer.full_name}', '${buyer.email}', '${buyer.phone}', '${buyer.emirates_id}', '${buyer.nationality}')
        ON CONFLICT DO NOTHING
      `);
    }
    console.log('Buyers created');

    // 7. Create sample transactions
    const unitResult = await client.query(`SELECT id FROM units WHERE tenant_id = '${tenantId}' AND status = 'available' LIMIT 2`);
    const buyerResult = await client.query(`SELECT id FROM buyers WHERE tenant_id = '${tenantId}' LIMIT 2`);
    const planResult = await client.query(`SELECT id FROM payment_plans WHERE tenant_id = '${tenantId}' LIMIT 1`);
    
    if (unitResult.rows.length >= 2 && buyerResult.rows.length >= 2 && planResult.rows.length > 0) {
      const unit1 = unitResult.rows[0].id;
      const unit2 = unitResult.rows[1].id;
      const buyer1 = buyerResult.rows[0].id;
      const buyer2 = buyerResult.rows[1].id;
      const planId = planResult.rows[0].id;
      const adminId = userResult.rows[0].id;

      // Transaction 1: Confirmed
      const tx1 = await client.query(`
        INSERT INTO transactions (tenant_id, unit_id, buyer_id, payment_plan_id, agent_id, status, total_price, signed_at, portal_token)
        VALUES ('${tenantId}', '${unit1}', '${buyer1}', '${planId}', '${adminId}', 'confirmed', 1500000, NOW(), 'demo-token-1')
        RETURNING id
      `);

      // Transaction 2: EOI
      const tx2 = await client.query(`
        INSERT INTO transactions (tenant_id, unit_id, buyer_id, payment_plan_id, agent_id, status, total_price, eoi_amount, eoi_date, portal_token)
        VALUES ('${tenantId}', '${unit2}', '${buyer2}', '${planId}', '${adminId}', 'eoi', 950000, 50000, NOW(), 'demo-token-2')
        RETURNING id
      `);

      // Update unit statuses
      await client.query(`UPDATE units SET status = 'booked' WHERE id = '${unit1}'`);
      await client.query(`UPDATE units SET status = 'pre_booked' WHERE id = '${unit2}'`);

      // Payments for transaction 1
      await client.query(`
        INSERT INTO payments (tenant_id, transaction_id, amount, payment_method, status, confirmed_by, confirmed_at)
        VALUES ('${tenantId}', '${tx1.rows[0].id}', 300000, 'bank_transfer', 'confirmed', '${adminId}', NOW())
      `);

      // Create a handover for transaction 1
      await client.query(`
        INSERT INTO handovers (tenant_id, transaction_id, unit_id, status, bcc_uploaded_at, bcc_document_url, completion_notice_sent_at)
        VALUES ('${tenantId}', '${tx1.rows[0].id}', '${unit1}', 'payment_due', NOW(), 'https://example.com/bcc.pdf', NOW())
      `);

      // Create a termination case for demo
      await client.query(`
        INSERT INTO termination_cases (tenant_id, transaction_id, unit_id, buyer_id, initiated_by, reason, total_paid, deduction_amount, refund_amount, status, current_step)
        VALUES ('${tenantId}', '${tx2.rows[0].id}', '${unit2}', '${buyer2}', '${adminId}', 'Payment default', 50000, 10000, 40000, 'active', 1)
      `);

      console.log('Transactions, payments, handover, and termination created');
    }

    // 8. Create unit approval for draft unit
    const draftUnit = await client.query(`SELECT id FROM units WHERE tenant_id = '${tenantId}' AND status = 'draft' LIMIT 1`);
    if (draftUnit.rows.length > 0) {
      await client.query(`
        INSERT INTO unit_approvals (tenant_id, unit_id, requested_by, status)
        VALUES ('${tenantId}', '${draftUnit.rows[0].id}', '${userResult.rows[0].id}', 'pending')
        ON CONFLICT DO NOTHING
      `);
      console.log('Unit approval created');
    }

    console.log('');
    console.log('Seed completed successfully!');
    console.log('');
    console.log('Login credentials:');
    console.log('  Username: admin');
    console.log('  Password: admin123');
    console.log('  Email: admin@plinth.ae');

  } catch (err) {
    console.error('Seed failed:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

seed();
