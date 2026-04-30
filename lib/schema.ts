import { sql } from '@/lib/db';

export const schemaSQL = `
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
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, email),
  UNIQUE(tenant_id, username)
);

CREATE TABLE IF NOT EXISTS areas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, name)
);

CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  area_id UUID REFERENCES areas(id) ON DELETE SET NULL,
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
  milestones JSONB NOT NULL DEFAULT '[{"label":"Booking","percent":20,"due_days_from_booking":0},{"label":"Installment 1","percent":30,"due_days_from_booking":90},{"label":"Installment 2","percent":30,"due_days_from_booking":180},{"label":"Final","percent":20,"due_days_from_booking":365}]',
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

ALTER TABLE users ADD COLUMN IF NOT EXISTS invite_token TEXT UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS invite_expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_areas_tenant ON areas(tenant_id);
CREATE INDEX IF NOT EXISTS idx_projects_area ON projects(area_id);
CREATE INDEX IF NOT EXISTS idx_units_tenant ON units(tenant_id);
CREATE INDEX IF NOT EXISTS idx_units_project ON units(project_id);
CREATE INDEX IF NOT EXISTS idx_units_status ON units(status);
CREATE INDEX IF NOT EXISTS idx_transactions_tenant ON transactions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_transactions_unit ON transactions(unit_id);
CREATE INDEX IF NOT EXISTS idx_transactions_buyer ON transactions(buyer_id);
CREATE INDEX IF NOT EXISTS idx_payments_transaction ON payments(transaction_id);
CREATE INDEX IF NOT EXISTS idx_documents_transaction ON documents(transaction_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant ON audit_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_unit_approvals_tenant ON unit_approvals(tenant_id);
CREATE INDEX IF NOT EXISTS idx_unit_approvals_unit ON unit_approvals(unit_id);
CREATE INDEX IF NOT EXISTS idx_penalties_tenant ON penalties(tenant_id);
CREATE INDEX IF NOT EXISTS idx_penalties_transaction ON penalties(transaction_id);
CREATE INDEX IF NOT EXISTS idx_handovers_tenant ON handovers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_handovers_transaction ON handovers(transaction_id);
CREATE INDEX IF NOT EXISTS idx_handovers_status ON handovers(status);
CREATE INDEX IF NOT EXISTS idx_snagging_tickets_tenant ON snagging_tickets(tenant_id);
CREATE INDEX IF NOT EXISTS idx_snagging_tickets_handover ON snagging_tickets(handover_id);
CREATE INDEX IF NOT EXISTS idx_snagging_tickets_status ON snagging_tickets(status);
CREATE INDEX IF NOT EXISTS idx_termination_cases_tenant ON termination_cases(tenant_id);
CREATE INDEX IF NOT EXISTS idx_termination_cases_transaction ON termination_cases(transaction_id);
CREATE INDEX IF NOT EXISTS idx_termination_cases_status ON termination_cases(status);
CREATE INDEX IF NOT EXISTS idx_termination_steps_tenant ON termination_steps(tenant_id);
CREATE INDEX IF NOT EXISTS idx_termination_steps_case ON termination_steps(termination_case_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_tenant ON notifications(tenant_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id, is_read);

-- RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE units ENABLE ROW LEVEL SECURITY;
ALTER TABLE buyers ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE unit_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE penalties ENABLE ROW LEVEL SECURITY;
ALTER TABLE handovers ENABLE ROW LEVEL SECURITY;
ALTER TABLE snagging_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE termination_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE termination_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tenant_isolation' AND tablename = 'users') THEN
    CREATE POLICY tenant_isolation ON users FOR ALL USING (tenant_id = current_setting('app.current_tenant_id')::UUID);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tenant_isolation' AND tablename = 'areas') THEN
    CREATE POLICY tenant_isolation ON areas FOR ALL USING (tenant_id = current_setting('app.current_tenant_id')::UUID);
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
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tenant_isolation' AND tablename = 'unit_approvals') THEN
    CREATE POLICY tenant_isolation ON unit_approvals FOR ALL USING (tenant_id = current_setting('app.current_tenant_id')::UUID);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tenant_isolation' AND tablename = 'penalties') THEN
    CREATE POLICY tenant_isolation ON penalties FOR ALL USING (tenant_id = current_setting('app.current_tenant_id')::UUID);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tenant_isolation' AND tablename = 'handovers') THEN
    CREATE POLICY tenant_isolation ON handovers FOR ALL USING (tenant_id = current_setting('app.current_tenant_id')::UUID);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tenant_isolation' AND tablename = 'snagging_tickets') THEN
    CREATE POLICY tenant_isolation ON snagging_tickets FOR ALL USING (tenant_id = current_setting('app.current_tenant_id')::UUID);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tenant_isolation' AND tablename = 'termination_cases') THEN
    CREATE POLICY tenant_isolation ON termination_cases FOR ALL USING (tenant_id = current_setting('app.current_tenant_id')::UUID);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tenant_isolation' AND tablename = 'termination_steps') THEN
    CREATE POLICY tenant_isolation ON termination_steps FOR ALL USING (tenant_id = current_setting('app.current_tenant_id')::UUID);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tenant_isolation' AND tablename = 'notifications') THEN
    CREATE POLICY tenant_isolation ON notifications FOR ALL USING (tenant_id = current_setting('app.current_tenant_id')::UUID);
  END IF;
END
$$;
`;

export async function migrate() {
  await sql.unsafe(schemaSQL);
}
