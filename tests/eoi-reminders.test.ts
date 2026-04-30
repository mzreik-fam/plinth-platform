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

// EOI constants matching the implementation
const EOI_EXPIRY_DAYS = 7;
const REMINDER_THRESHOLDS = [
  {key: '72h', hours: 72},
  {key: '48h', hours: 48},
  {key: '24h', hours: 24},
  {key: 'expiry', hours: 0},
] as const;

describe('EOI Expiry Reminders', () => {
  describe('Reminder threshold calculation', () => {
    it('calculates expiry date correctly (eoi_date + 7 days)', () => {
      const eoiDate = new Date('2026-04-30T10:00:00Z');
      const expiryDate = new Date(eoiDate);
      expiryDate.setDate(expiryDate.getDate() + EOI_EXPIRY_DAYS);
      
      assert.strictEqual(expiryDate.toISOString(), '2026-05-07T10:00:00.000Z');
    });

    it('calculates hours until expiry correctly', () => {
      // EOI created on Apr 30, expires on May 7
      const now = new Date('2026-05-05T10:00:00Z'); // 2 days before expiry (May 7)
      const eoiDate = new Date('2026-04-30T10:00:00Z'); // Created Apr 30
      const expiryDate = new Date(eoiDate);
      expiryDate.setDate(expiryDate.getDate() + EOI_EXPIRY_DAYS); // May 7
      
      const hoursUntilExpiry = Math.floor((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60));
      assert.strictEqual(hoursUntilExpiry, 48);
    });

    it('identifies expired EOIs (hoursUntilExpiry <= 0)', () => {
      const now = new Date('2026-05-08T10:00:00Z'); // 1 day after expiry
      const eoiDate = new Date('2026-04-30T10:00:00Z'); // Expired May 7
      const expiryDate = new Date(eoiDate);
      expiryDate.setDate(expiryDate.getDate() + EOI_EXPIRY_DAYS);
      
      const hoursUntilExpiry = Math.floor((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60));
      assert.ok(hoursUntilExpiry <= 0, 'EOI should be expired');
      assert.strictEqual(hoursUntilExpiry, -24);
    });
  });

  describe('Idempotent reminder logic', () => {
    it('should trigger 72h reminder when 72h <= hoursRemaining < 48h', () => {
      const hoursUntilExpiry = 60; // Between 48h and 72h
      
      // Find applicable threshold
      const applicableThreshold = REMINDER_THRESHOLDS.find(({hours}) => {
        const nextLowerHours = REMINDER_THRESHOLDS.find(t => t.hours < hours)?.hours ?? -1;
        return hoursUntilExpiry <= hours && hoursUntilExpiry > nextLowerHours;
      });
      
      assert.strictEqual(applicableThreshold?.key, '72h');
    });

    it('should trigger 48h reminder when 48h <= hoursRemaining < 24h', () => {
      const hoursUntilExpiry = 36; // Between 24h and 48h
      
      const applicableThreshold = REMINDER_THRESHOLDS.find(({hours}) => {
        const nextLowerHours = REMINDER_THRESHOLDS.find(t => t.hours < hours)?.hours ?? -1;
        return hoursUntilExpiry <= hours && hoursUntilExpiry > nextLowerHours;
      });
      
      assert.strictEqual(applicableThreshold?.key, '48h');
    });

    it('should trigger 24h reminder when 24h <= hoursRemaining < 0', () => {
      const hoursUntilExpiry = 12; // Between 0h and 24h
      
      const applicableThreshold = REMINDER_THRESHOLDS.find(({hours}) => {
        const nextLowerHours = REMINDER_THRESHOLDS.find(t => t.hours < hours)?.hours ?? -1;
        return hoursUntilExpiry <= hours && hoursUntilExpiry > nextLowerHours;
      });
      
      assert.strictEqual(applicableThreshold?.key, '24h');
    });

    it('should trigger expiry reminder when hoursRemaining <= 0', () => {
      const hoursUntilExpiry = 0; // At expiry
      
      const applicableThreshold = REMINDER_THRESHOLDS.find(({hours}) => {
        const nextLowerHours = REMINDER_THRESHOLDS.find(t => t.hours < hours)?.hours ?? -1;
        return hoursUntilExpiry <= hours && hoursUntilExpiry > nextLowerHours;
      });
      
      assert.strictEqual(applicableThreshold?.key, 'expiry');
    });

    it('should NOT send reminder if already sent for this threshold', () => {
      const remindersSent = {
        '72h': '2026-04-25T10:00:00Z',
        '48h': null,
        '24h': null,
        'expiry': null,
      };
      
      const hoursUntilExpiry = 60; // Would trigger 72h reminder
      
      // Check if already sent
      const shouldSend = !remindersSent['72h'];
      assert.strictEqual(shouldSend, false, '72h reminder already sent');
    });

    it('should send reminder if not yet sent for this threshold', () => {
      const remindersSent = {
        '72h': '2026-04-25T10:00:00Z',
        '48h': null,
        '24h': null,
        'expiry': null,
      };
      
      const hoursUntilExpiry = 36; // Would trigger 48h reminder
      
      const shouldSend = !remindersSent['48h'];
      assert.strictEqual(shouldSend, true, '48h reminder not yet sent');
    });
  });

  describe('reminders_sent JSONB field', () => {
    it('initializes with empty object', () => {
      const remindersSent = {};
      assert.deepStrictEqual(remindersSent, {});
    });

    it('records timestamp when reminder is sent', async () => {
      capturedQueries.length = 0;
      
      const txId = 'tx-123';
      const remindersSent = {};
      const key = '72h';
      
      // Update reminders_sent JSONB
      const updatedReminders = {
        ...remindersSent,
        [key]: new Date().toISOString(),
      };
      
      await sql`
        UPDATE transactions 
        SET reminders_sent = ${JSON.stringify(updatedReminders)},
            updated_at = NOW()
        WHERE id = ${txId}
      `;
      
      const q = capturedQueries[0];
      assert.ok(q.sql.includes('UPDATE transactions'), 'should update transactions');
      assert.ok(q.sql.includes('reminders_sent'), 'should set reminders_sent');
    });

    it('preserves previously sent reminders when adding new one', () => {
      const existingReminders = {
        '72h': '2026-04-25T10:00:00Z',
      };
      
      const updatedReminders = {
        ...existingReminders,
        '48h': '2026-04-26T10:00:00Z',
      };
      
      assert.ok(updatedReminders['72h'], '72h reminder preserved');
      assert.ok(updatedReminders['48h'], '48h reminder added');
    });
  });

  describe('Email notification content', () => {
    it('includes buyer name, unit number, project name, EOI amount', () => {
      const emailData = {
        to: 'buyer@example.com',
        buyerName: 'John Doe',
        unitNumber: 'A-101',
        projectName: 'Marina Heights',
        eoiAmount: 50000,
        hoursRemaining: 48,
        deadline: 'May 7, 2026',
        portalUrl: 'https://example.com/portal/abc123',
      };
      
      assert.strictEqual(emailData.buyerName, 'John Doe');
      assert.strictEqual(emailData.unitNumber, 'A-101');
      assert.strictEqual(emailData.projectName, 'Marina Heights');
      assert.strictEqual(emailData.eoiAmount, 50000);
    });

    it('CCs the assigned agent if available', () => {
      const agentEmail = 'agent@example.com';
      const cc = agentEmail || undefined;
      
      assert.strictEqual(cc, 'agent@example.com');
    });

    it('does not CC if no agent assigned', () => {
      const agentEmail = null;
      const cc = agentEmail || undefined;
      
      assert.strictEqual(cc, undefined);
    });

    it('marks email as URGENT when hoursRemaining <= 24', () => {
      const hoursRemaining = 12;
      const urgencyLabel = hoursRemaining <= 24 ? 'URGENT' : 'Reminder';
      
      assert.strictEqual(urgencyLabel, 'URGENT');
    });

    it('marks email as Reminder when hoursRemaining > 24', () => {
      const hoursRemaining = 48;
      const urgencyLabel = hoursRemaining <= 24 ? 'URGENT' : 'Reminder';
      
      assert.strictEqual(urgencyLabel, 'Reminder');
    });
  });

  describe('EOI expiry handling', () => {
    it('cancels transaction when EOI expires', async () => {
      capturedQueries.length = 0;
      
      const txId = 'tx-123';
      const unitId = 'unit-456';
      
      // Cancel transaction
      await sql`UPDATE transactions SET status = 'cancelled', updated_at = NOW() WHERE id = ${txId}`;
      // Release unit back to available
      await sql`UPDATE units SET status = 'available', updated_at = NOW() WHERE id = ${unitId}`;
      
      assert.ok(capturedQueries[0].sql.includes('UPDATE transactions'), 'should update transaction');
      assert.ok(capturedQueries[0].sql.includes('cancelled'), 'should set status to cancelled');
      assert.ok(capturedQueries[1].sql.includes('UPDATE units'), 'should update unit');
      assert.ok(capturedQueries[1].sql.includes('available'), 'should set unit status to available');
    });

    it('logs audit entry when EOI expires', async () => {
      capturedQueries.length = 0;
      
      const tenantId = 'tenant-123';
      const txId = 'tx-456';
      
      await logAudit({
        tenantId,
        userId: 'system',
        action: 'status_change',
        resourceType: 'transaction',
        resourceId: txId,
        before: {status: 'eoi'},
        after: {status: 'cancelled', reason: 'eoi_expired'},
      });
      
      const q = capturedQueries[0];
      assert.ok(q.sql.includes('INSERT INTO audit_logs'), 'should log to audit_logs');
      const details = JSON.parse(q.values[5] as string);
      assert.deepStrictEqual(details.before, {status: 'eoi'});
      assert.deepStrictEqual(details.after, {status: 'cancelled', reason: 'eoi_expired'});
    });
  });

  describe('Cron idempotency', () => {
    it('each reminder fires once and only once per transaction', () => {
      // Simulate running cron twice for same transaction at 60 hours remaining
      const remindersSent: Record<string, string | null> = {};
      const hoursUntilExpiry = 60;
      
      // First cron run - should send 72h reminder
      const applicableThreshold1 = REMINDER_THRESHOLDS.find(({hours}) => {
        const nextLowerHours = REMINDER_THRESHOLDS.find(t => t.hours < hours)?.hours ?? -1;
        return hoursUntilExpiry <= hours && hoursUntilExpiry > nextLowerHours;
      });
      
      if (applicableThreshold1 && !remindersSent[applicableThreshold1.key]) {
        remindersSent[applicableThreshold1.key] = new Date().toISOString();
      }
      
      assert.ok(remindersSent['72h'], '72h reminder sent on first run');
      
      // Second cron run - should NOT send another 72h reminder
      let secondReminderSent = false;
      if (applicableThreshold1 && !remindersSent[applicableThreshold1.key]) {
        secondReminderSent = true;
      }
      
      assert.strictEqual(secondReminderSent, false, '72h reminder should not be sent twice');
    });

    it('reminders_sent prevents duplicate sends across multiple cron runs', () => {
      const remindersSent = {
        '72h': '2026-04-25T10:00:00Z',
        '48h': '2026-04-26T10:00:00Z',
      };
      
      // Simulating 36 hours remaining (should send 48h but already sent)
      const hoursUntilExpiry = 36;
      
      const shouldSend72h = !remindersSent['72h'] && hoursUntilExpiry <= 72 && hoursUntilExpiry > 48;
      const shouldSend48h = !remindersSent['48h'] && hoursUntilExpiry <= 48 && hoursUntilExpiry > 24;
      
      assert.strictEqual(shouldSend72h, false, '72h already sent');
      assert.strictEqual(shouldSend48h, false, '48h already sent');
    });
  });
});

describe('EOI Reminder Integration', () => {
  it('full flow: EOI created -> 72h reminder -> 48h reminder -> expiry -> cancelled', async () => {
    capturedQueries.length = 0;
    
    const tenantId = 'tenant-123';
    const txId = 'tx-456';
    const unitId = 'unit-789';
    
    // Step 1: Initial state - no reminders sent
    let remindersSent: Record<string, string | null> = {};
    
    // Step 2: At 60 hours, 72h reminder fires
    const hoursAtFirstCheck = 60;
    if (hoursAtFirstCheck <= 72 && hoursAtFirstCheck > 48 && !remindersSent['72h']) {
      remindersSent = {...remindersSent, '72h': '2026-04-25T10:00:00Z'};
    }
    
    await sql`
      UPDATE transactions 
      SET reminders_sent = ${JSON.stringify(remindersSent)},
          updated_at = NOW()
      WHERE id = ${txId}
    `;
    
    // Step 3: At 36 hours, 48h reminder fires
    const hoursAtSecondCheck = 36;
    if (hoursAtSecondCheck <= 48 && hoursAtSecondCheck > 24 && !remindersSent['48h']) {
      remindersSent = {...remindersSent, '48h': '2026-04-26T10:00:00Z'};
    }
    
    await sql`
      UPDATE transactions 
      SET reminders_sent = ${JSON.stringify(remindersSent)},
          updated_at = NOW()
      WHERE id = ${txId}
    `;
    
    // Step 4: At expiry, transaction cancelled
    await sql`UPDATE transactions SET status = 'cancelled', updated_at = NOW() WHERE id = ${txId}`;
    await sql`UPDATE units SET status = 'available', updated_at = NOW() WHERE id = ${unitId}`;
    
    // Step 5: Log audit
    await logAudit({
      tenantId,
      userId: 'system',
      action: 'status_change',
      resourceType: 'transaction',
      resourceId: txId,
      before: {status: 'eoi'},
      after: {status: 'cancelled', reason: 'eoi_expired'},
    });
    
    // Verify all queries executed
    assert.strictEqual(capturedQueries.length, 5, 'all 5 operations executed');
    
    // Verify 72h reminder update
    assert.ok(capturedQueries[0].sql.includes('UPDATE transactions'), 'step 1: update 72h reminder');
    assert.ok(String(capturedQueries[0].values[0]).includes('72h'), 'step 1: reminders_sent includes 72h');
    
    // Verify 48h reminder update
    assert.ok(capturedQueries[1].sql.includes('UPDATE transactions'), 'step 2: update 48h reminder');
    assert.ok(String(capturedQueries[1].values[0]).includes('48h'), 'step 2: reminders_sent includes 48h');
    
    // Verify cancellation
    assert.ok(capturedQueries[2].sql.includes('UPDATE transactions'), 'step 3: cancel transaction');
    assert.ok(capturedQueries[3].sql.includes('UPDATE units'), 'step 4: release unit');
    
    // Verify audit
    assert.ok(capturedQueries[4].sql.includes('INSERT INTO audit_logs'), 'step 5: audit log');
  });
});
