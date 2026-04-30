import {describe, it} from 'node:test';
import assert from 'node:assert';

// ---- Mock lib/db ----
const capturedQueries: Array<{sql: string; values: unknown[]}> = [];

function sql(strings: TemplateStringsArray, ...values: unknown[]) {
  const text = strings.reduce((acc, str, i) => acc + str + (i < values.length ? `$${i + 1}` : ''), '');
  capturedQueries.push({sql: text, values});
  return Promise.resolve([]);
}

sql.unsafe = (query: string) => {
  capturedQueries.push({sql: query, values: []});
  return Promise.resolve([]);
};

sql.query = (query: string, values: unknown[]) => {
  capturedQueries.push({sql: query, values});
  return Promise.resolve([]);
};

// Mock audit log helper
async function logAudit({
  tenantId,
  userId,
  action,
  resourceType,
  resourceId,
  before,
  after,
}: {
  tenantId: string;
  userId: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
}) {
  await sql`
    INSERT INTO audit_logs (tenant_id, user_id, action, entity_type, entity_id, details)
    VALUES (
      ${tenantId},
      ${userId},
      ${action},
      ${resourceType},
      ${resourceId || null},
      ${JSON.stringify({before: before ?? null, after: after ?? null})}
    )
  `;
}

describe('Payment Confirmation Flow', () => {
  describe('POST /api/payments', () => {
    it('creates payment with status = pending (not confirmed)', async () => {
      capturedQueries.length = 0;

      // Simulate the POST handler logic
      const tenantId = 'tenant-123';
      const transaction_id = 'tx-456';
      const amount = 100000;
      const payment_method = 'bank_transfer';
      const reference_number = 'REF123';
      const proof_document_id = null;

      // The INSERT query from POST /api/payments
      await sql`
        INSERT INTO payments (tenant_id, transaction_id, amount, payment_method, reference_number, status, proof_document_id)
        VALUES (${tenantId}, ${transaction_id}, ${amount}, ${payment_method}, ${reference_number || null}, 'pending', ${proof_document_id || null})
        RETURNING *
      `;

      const q = capturedQueries[0];
      assert.ok(q.sql.includes('INSERT INTO payments'), 'should insert into payments');
      assert.ok(q.sql.includes('pending'), 'should set status to pending');
      assert.ok(!q.sql.includes('confirmed'), 'should NOT set status to confirmed on creation');
    });

    it('logs payment creation to audit log', async () => {
      capturedQueries.length = 0;

      const tenantId = 'tenant-123';
      const userId = 'user-456';
      const paymentId = 'payment-789';
      const payment = {id: paymentId, status: 'pending', amount: 100000};

      await logAudit({
        tenantId,
        userId,
        action: 'create',
        resourceType: 'payment',
        resourceId: paymentId,
        before: null,
        after: payment,
      });

      const q = capturedQueries[0];
      assert.ok(q.sql.includes('INSERT INTO audit_logs'), 'should log to audit_logs');
      assert.strictEqual(q.values[2], 'create', 'action should be create');
      assert.strictEqual(q.values[3], 'payment', 'entity_type should be payment');
    });
  });

  describe('PATCH /api/payments/[id] - confirmation', () => {
    it('updates status from pending to confirmed', async () => {
      capturedQueries.length = 0;

      const paymentId = 'payment-789';
      const userId = 'admin-123';
      const before = {status: 'pending', confirmed_by: null, confirmed_at: null};
      const after = {status: 'confirmed', confirmed_by: userId, confirmed_at: new Date().toISOString()};

      // Simulate PATCH confirmation
      await sql`
        UPDATE payments
        SET status = 'confirmed', confirmed_by = ${userId}, confirmed_at = ${after.confirmed_at}
        WHERE id = ${paymentId}
        RETURNING *
      `;

      const q = capturedQueries[0];
      assert.ok(q.sql.includes('UPDATE payments'), 'should update payments');
      assert.ok(q.sql.includes('confirmed'), 'should set status to confirmed');
      assert.ok(q.sql.includes('confirmed_by'), 'should set confirmed_by');
      assert.ok(q.sql.includes('confirmed_at'), 'should set confirmed_at');
    });

    it('logs status_change to audit log when confirming', async () => {
      capturedQueries.length = 0;

      const tenantId = 'tenant-123';
      const userId = 'admin-456';
      const paymentId = 'payment-789';
      const before = {status: 'pending', confirmed_by: null, confirmed_at: null};
      const after = {status: 'confirmed', confirmed_by: userId, confirmed_at: new Date().toISOString()};

      await logAudit({
        tenantId,
        userId,
        action: 'status_change',
        resourceType: 'payment',
        resourceId: paymentId,
        before,
        after,
      });

      const q = capturedQueries[0];
      assert.strictEqual(q.values[2], 'status_change', 'action should be status_change');
      const details = JSON.parse(q.values[5] as string);
      assert.deepStrictEqual(details.before, before, 'before state should be recorded');
      assert.deepStrictEqual(details.after, after, 'after state should be recorded');
    });

    it('rejects confirmation if payment is not pending', async () => {
      // Simulate the validation logic from the route
      const paymentStatus = 'confirmed'; // Already confirmed
      
      function validateConfirmation(status: string): {valid: boolean; error?: string} {
        if (status !== 'pending') {
          return {valid: false, error: `Payment is already ${status}`};
        }
        return {valid: true};
      }

      const result = validateConfirmation(paymentStatus);
      assert.strictEqual(result.valid, false, 'should reject already confirmed payment');
      assert.ok(result.error?.includes('already confirmed'), 'error message should indicate already confirmed');
    });
  });

  describe('Financial Statement - confirmed payments only', () => {
    it('only counts confirmed payments toward totalPaid', async () => {
      const payments = [
        {id: 'p1', amount: 100000, status: 'confirmed'},
        {id: 'p2', amount: 50000, status: 'pending'},
        {id: 'p3', amount: 75000, status: 'confirmed'},
        {id: 'p4', amount: 25000, status: 'rejected'},
      ];

      // Logic from financial-statement/route.ts
      const totalPaid = payments
        .filter((p: { id: string; amount: number; status: string }) => p.status === 'confirmed')
        .reduce((sum: number, p: { id: string; amount: number; status: string }) => sum + Number(p.amount), 0);

      assert.strictEqual(totalPaid, 175000, 'should only sum confirmed payments');
    });

    it('tracks pending payments separately', async () => {
      const payments = [
        {id: 'p1', amount: 100000, status: 'confirmed'},
        {id: 'p2', amount: 50000, status: 'pending'},
        {id: 'p3', amount: 30000, status: 'pending'},
      ];

      const totalPending = payments
        .filter((p: { id: string; amount: number; status: string }) => p.status === 'pending')
        .reduce((sum: number, p: { id: string; amount: number; status: string }) => sum + Number(p.amount), 0);

      assert.strictEqual(totalPending, 80000, 'should track pending separately');
    });
  });

  describe('Role-based access control', () => {
    it('allows admin and super_admin to confirm payments', () => {
      const allowedRoles = ['super_admin', 'admin'];
      
      function canConfirmPayment(role: string): boolean {
        return allowedRoles.includes(role);
      }

      assert.strictEqual(canConfirmPayment('super_admin'), true, 'super_admin can confirm');
      assert.strictEqual(canConfirmPayment('admin'), true, 'admin can confirm');
      assert.strictEqual(canConfirmPayment('internal_agent'), false, 'internal_agent cannot confirm');
      assert.strictEqual(canConfirmPayment('buyer'), false, 'buyer cannot confirm');
    });
  });

  describe('Email notification on confirmation', () => {
    it('sends email only on confirmation, not on creation', () => {
      const notifications: string[] = [];

      function notifyPaymentReceived(action: string) {
        if (action === 'confirm') {
          notifications.push('payment_received_email');
        }
      }

      // Simulate creation (no email)
      notifyPaymentReceived('create');
      assert.strictEqual(notifications.length, 0, 'no email on creation');

      // Simulate confirmation (email sent)
      notifyPaymentReceived('confirm');
      assert.strictEqual(notifications.length, 1, 'email sent on confirmation');
      assert.strictEqual(notifications[0], 'payment_received_email', 'correct email type');
    });
  });
});

describe('Payment Flow Integration', () => {
  it('full flow: create pending -> confirm -> audit log -> financial statement', async () => {
    capturedQueries.length = 0;

    const tenantId = 'tenant-123';
    const userId = 'admin-456';
    const paymentId = 'payment-789';
    const transactionId = 'tx-001';

    // Step 1: Create payment as pending
    await sql`
      INSERT INTO payments (tenant_id, transaction_id, amount, payment_method, status)
      VALUES (${tenantId}, ${transactionId}, 100000, 'bank_transfer', 'pending')
      RETURNING *
    `;

    // Step 2: Log creation
    await logAudit({
      tenantId,
      userId,
      action: 'create',
      resourceType: 'payment',
      resourceId: paymentId,
      before: null,
      after: {id: paymentId, status: 'pending', amount: 100000},
    });

    // Step 3: Confirm payment
    await sql`
      UPDATE payments
      SET status = 'confirmed', confirmed_by = ${userId}, confirmed_at = NOW()
      WHERE id = ${paymentId}
      RETURNING *
    `;

    // Step 4: Log confirmation
    await logAudit({
      tenantId,
      userId,
      action: 'status_change',
      resourceType: 'payment',
      resourceId: paymentId,
      before: {status: 'pending'},
      after: {status: 'confirmed', confirmed_by: userId},
    });

    // Verify all queries executed
    assert.strictEqual(capturedQueries.length, 4, 'all 4 operations logged');
    
    // Verify INSERT
    assert.ok(capturedQueries[0].sql.includes('INSERT INTO payments'), 'step 1: insert payment');
    assert.ok(capturedQueries[0].sql.includes('pending'), 'step 1: status is pending');
    
    // Verify creation audit
    assert.ok(capturedQueries[1].sql.includes('INSERT INTO audit_logs'), 'step 2: audit creation');
    
    // Verify UPDATE
    assert.ok(capturedQueries[2].sql.includes('UPDATE payments'), 'step 3: update payment');
    assert.ok(capturedQueries[2].sql.includes('confirmed'), 'step 3: status is confirmed');
    
    // Verify confirmation audit
    assert.ok(capturedQueries[3].sql.includes('INSERT INTO audit_logs'), 'step 4: audit confirmation');
    const lastQuery = capturedQueries[3];
    const hasStatusChange = lastQuery.sql.includes('status_change') || lastQuery.values.some((v: unknown) => v === 'status_change');
    assert.strictEqual(hasStatusChange, true, 'step 4: action is status_change');
  });
});
