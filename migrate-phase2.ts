import { Client } from '@neondatabase/serverless';

async function migrate() {
  const client = new Client(process.env.DATABASE_URL);
  await client.connect();

  try {
    console.log('Running Phase 2 migrations...');

    // 1. Unit approval workflow tracking
    await client.query(`
      CREATE TABLE IF NOT EXISTS unit_approvals (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
        unit_id UUID REFERENCES units(id) ON DELETE CASCADE,
        requested_by UUID REFERENCES users(id),
        reviewed_by UUID REFERENCES users(id),
        status TEXT DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
        notes TEXT,
        requested_at TIMESTAMPTZ DEFAULT NOW(),
        reviewed_at TIMESTAMPTZ,
        UNIQUE(tenant_id, unit_id)
      );
      CREATE INDEX IF NOT EXISTS idx_unit_approvals_tenant ON unit_approvals(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_unit_approvals_unit ON unit_approvals(unit_id);
      ALTER TABLE unit_approvals ENABLE ROW LEVEL SECURITY;
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tenant_isolation' AND tablename = 'unit_approvals') THEN
          CREATE POLICY tenant_isolation ON unit_approvals FOR ALL USING (tenant_id = current_setting('app.current_tenant_id')::UUID);
        END IF;
      END $$;
    `);

    // 2. Penalties for late payments
    await client.query(`
      CREATE TABLE IF NOT EXISTS penalties (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
        transaction_id UUID REFERENCES transactions(id) ON DELETE CASCADE,
        milestone_label TEXT NOT NULL,
        due_date DATE NOT NULL,
        days_overdue INTEGER NOT NULL DEFAULT 0,
        penalty_amount NUMERIC NOT NULL DEFAULT 0,
        penalty_rate NUMERIC NOT NULL DEFAULT 0,
        status TEXT DEFAULT 'active' CHECK (status IN ('active','waived','paid')),
        waived_by UUID REFERENCES users(id),
        waived_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_penalties_tenant ON penalties(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_penalties_transaction ON penalties(transaction_id);
      ALTER TABLE penalties ENABLE ROW LEVEL SECURITY;
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tenant_isolation' AND tablename = 'penalties') THEN
          CREATE POLICY tenant_isolation ON penalties FOR ALL USING (tenant_id = current_setting('app.current_tenant_id')::UUID);
        END IF;
      END $$;
    `);

    // 3. Handover management
    await client.query(`
      CREATE TABLE IF NOT EXISTS handovers (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
        transaction_id UUID REFERENCES transactions(id) ON DELETE CASCADE,
        unit_id UUID REFERENCES units(id) ON DELETE CASCADE,
        bcc_uploaded_at TIMESTAMPTZ,
        bcc_document_url TEXT,
        completion_notice_sent_at TIMESTAMPTZ,
        handover_payment_amount NUMERIC,
        handover_payment_paid_at TIMESTAMPTZ,
        dld_registration_confirmed BOOLEAN DEFAULT false,
        oqood_paid BOOLEAN DEFAULT false,
        utility_registration_confirmed BOOLEAN DEFAULT false,
        inspection_date TIMESTAMPTZ,
        inspection_notes TEXT,
        inspection_photos JSONB DEFAULT '[]',
        key_handover_signed_at TIMESTAMPTZ,
        key_handover_document_url TEXT,
        status TEXT DEFAULT 'pending_bcc' CHECK (status IN ('pending_bcc','payment_due','registration','inspection_scheduled','snagging','ready_for_handover','completed')),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_handovers_tenant ON handovers(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_handovers_transaction ON handovers(transaction_id);
      CREATE INDEX IF NOT EXISTS idx_handovers_status ON handovers(status);
      ALTER TABLE handovers ENABLE ROW LEVEL SECURITY;
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tenant_isolation' AND tablename = 'handovers') THEN
          CREATE POLICY tenant_isolation ON handovers FOR ALL USING (tenant_id = current_setting('app.current_tenant_id')::UUID);
        END IF;
      END $$;
    `);

    // 4. Snagging tickets
    await client.query(`
      CREATE TABLE IF NOT EXISTS snagging_tickets (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
        handover_id UUID REFERENCES handovers(id) ON DELETE CASCADE,
        unit_id UUID REFERENCES units(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        description TEXT,
        severity TEXT DEFAULT 'minor' CHECK (severity IN ('minor','major','critical')),
        photos JSONB DEFAULT '[]',
        assigned_to UUID REFERENCES users(id),
        status TEXT DEFAULT 'open' CHECK (status IN ('open','in_progress','resolved','closed')),
        buyer_comments TEXT,
        engineer_comments TEXT,
        resolved_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_snagging_tickets_tenant ON snagging_tickets(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_snagging_tickets_handover ON snagging_tickets(handover_id);
      CREATE INDEX IF NOT EXISTS idx_snagging_tickets_status ON snagging_tickets(status);
      ALTER TABLE snagging_tickets ENABLE ROW LEVEL SECURITY;
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tenant_isolation' AND tablename = 'snagging_tickets') THEN
          CREATE POLICY tenant_isolation ON snagging_tickets FOR ALL USING (tenant_id = current_setting('app.current_tenant_id')::UUID);
        END IF;
      END $$;
    `);

    // 5. Termination cases
    await client.query(`
      CREATE TABLE IF NOT EXISTS termination_cases (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
        transaction_id UUID REFERENCES transactions(id) ON DELETE CASCADE,
        unit_id UUID REFERENCES units(id) ON DELETE CASCADE,
        buyer_id UUID REFERENCES buyers(id) ON DELETE CASCADE,
        initiated_by UUID REFERENCES users(id),
        reason TEXT,
        total_paid NUMERIC DEFAULT 0,
        deduction_amount NUMERIC DEFAULT 0,
        refund_amount NUMERIC DEFAULT 0,
        status TEXT DEFAULT 'active' CHECK (status IN ('active','completed','cancelled')),
        current_step INTEGER DEFAULT 1,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_termination_cases_tenant ON termination_cases(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_termination_cases_transaction ON termination_cases(transaction_id);
      CREATE INDEX IF NOT EXISTS idx_termination_cases_status ON termination_cases(status);
      ALTER TABLE termination_cases ENABLE ROW LEVEL SECURITY;
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tenant_isolation' AND tablename = 'termination_cases') THEN
          CREATE POLICY tenant_isolation ON termination_cases FOR ALL USING (tenant_id = current_setting('app.current_tenant_id')::UUID);
        END IF;
      END $$;
    `);

    // 6. Termination steps (4-step DLD process)
    await client.query(`
      CREATE TABLE IF NOT EXISTS termination_steps (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
        termination_case_id UUID REFERENCES termination_cases(id) ON DELETE CASCADE,
        step_number INTEGER NOT NULL CHECK (step_number BETWEEN 1 AND 4),
        step_name TEXT NOT NULL,
        status TEXT DEFAULT 'pending' CHECK (status IN ('pending','in_progress','completed')),
        notice_sent_at TIMESTAMPTZ,
        notice_method TEXT,
        courier_tracking TEXT,
        airway_bill_url TEXT,
        email_proof_url TEXT,
        receipt_confirmed_at TIMESTAMPTZ,
        deadline_date DATE,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        completed_at TIMESTAMPTZ,
        UNIQUE(tenant_id, termination_case_id, step_number)
      );
      CREATE INDEX IF NOT EXISTS idx_termination_steps_tenant ON termination_steps(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_termination_steps_case ON termination_steps(termination_case_id);
      ALTER TABLE termination_steps ENABLE ROW LEVEL SECURITY;
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tenant_isolation' AND tablename = 'termination_steps') THEN
          CREATE POLICY tenant_isolation ON termination_steps FOR ALL USING (tenant_id = current_setting('app.current_tenant_id')::UUID);
        END IF;
      END $$;
    `);

    // 7. Notifications
    await client.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        category TEXT DEFAULT 'general' CHECK (category IN ('general','approval','payment','handover','termination','snagging')),
        entity_type TEXT,
        entity_id UUID,
        is_read BOOLEAN DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
      CREATE INDEX IF NOT EXISTS idx_notifications_tenant ON notifications(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id, is_read);
      ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tenant_isolation' AND tablename = 'notifications') THEN
          CREATE POLICY tenant_isolation ON notifications FOR ALL USING (tenant_id = current_setting('app.current_tenant_id')::UUID);
        END IF;
      END $$;
    `);

    // Add penalty_rate to payment_plans for late payment calculation
    await client.query(`
      ALTER TABLE payment_plans
      ADD COLUMN IF NOT EXISTS penalty_rate NUMERIC DEFAULT 0.08;
    `);

    // Add reviewed_by and approved_at to units for approval workflow
    await client.query(`
      ALTER TABLE units
      ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES users(id),
      ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
    `);

    console.log('Phase 2 migrations complete.');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

migrate();
