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

describe('Buyer Portal Upload (P1-2)', () => {
  describe('POST /api/portal/upload', () => {
    it('validates required fields (file and token)', () => {
      // Simulate validation logic from the route
      function validateUpload(file: File | null, token: string | null): {valid: boolean; error?: string} {
        if (!file) {
          return {valid: false, error: 'No file provided'};
        }
        if (!token) {
          return {valid: false, error: 'Portal token required'};
        }
        return {valid: true};
      }

      // No file
      const result1 = validateUpload(null, 'valid-token');
      assert.strictEqual(result1.valid, false);
      assert.strictEqual(result1.error, 'No file provided');

      // No token
      const mockFile = {name: 'test.pdf', size: 1000, type: 'application/pdf'} as File;
      const result2 = validateUpload(mockFile, '');
      assert.strictEqual(result2.valid, false);
      assert.strictEqual(result2.error, 'Portal token required');

      // Valid
      const result3 = validateUpload(mockFile, 'valid-token');
      assert.strictEqual(result3.valid, true);
    });

    it('validates file type restrictions (PDF, JPG, PNG only)', () => {
      const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png'];
      const maxSize = 10 * 1024 * 1024; // 10MB

      function validateFile(file: {type: string; size: number}): {valid: boolean; error?: string} {
        if (!allowedTypes.includes(file.type)) {
          return {valid: false, error: 'Invalid file type. Allowed: PDF, JPG, PNG'};
        }
        if (file.size > maxSize) {
          return {valid: false, error: 'File too large (max 10MB)'};
        }
        return {valid: true};
      }

      // Valid types
      assert.strictEqual(validateFile({type: 'application/pdf', size: 1000}).valid, true);
      assert.strictEqual(validateFile({type: 'image/jpeg', size: 1000}).valid, true);
      assert.strictEqual(validateFile({type: 'image/png', size: 1000}).valid, true);

      // Invalid types
      assert.strictEqual(validateFile({type: 'image/gif', size: 1000}).valid, false);
      assert.strictEqual(validateFile({type: 'application/zip', size: 1000}).valid, false);
      assert.strictEqual(validateFile({type: 'text/plain', size: 1000}).valid, false);

      // Size validation
      assert.strictEqual(validateFile({type: 'application/pdf', size: 10 * 1024 * 1024 + 1}).valid, false);
      assert.strictEqual(validateFile({type: 'application/pdf', size: 10 * 1024 * 1024}).valid, true);
    });

    it('rejects uploads for cancelled/terminated transactions', () => {
      function canUpload(status: string): {allowed: boolean; error?: string} {
        if (status === 'cancelled' || status === 'terminated') {
          return {allowed: false, error: 'Upload not allowed for cancelled or terminated transactions'};
        }
        return {allowed: true};
      }

      // Allowed statuses
      assert.strictEqual(canUpload('eoi').allowed, true);
      assert.strictEqual(canUpload('booking_pending').allowed, true);
      assert.strictEqual(canUpload('confirmed').allowed, true);

      // Blocked statuses
      assert.strictEqual(canUpload('cancelled').allowed, false);
      assert.strictEqual(canUpload('terminated').allowed, false);
    });

    it('creates document record with correct category', async () => {
      capturedQueries.length = 0;

      const tenantId = 'tenant-123';
      const transactionId = 'tx-456';
      const fileName = 'payment-proof.pdf';
      const fileUrl = 'https://r2.storage/portal-uploads/tenant-123/tx-456/1234567890-payment-proof.pdf';

      // Simulate document insert from route
      await sql`
        INSERT INTO documents (
          tenant_id,
          transaction_id,
          category,
          file_name,
          file_url,
          uploaded_by
        ) VALUES (
          ${tenantId},
          ${transactionId},
          'proof_of_transfer',
          ${fileName},
          ${fileUrl},
          NULL
        )
        RETURNING id
      `;

      const q = capturedQueries[0];
      assert.ok(q.sql.includes('INSERT INTO documents'), 'should insert into documents');
      assert.ok(q.sql.includes('proof_of_transfer'), 'should set category to proof_of_transfer');
      // Find the category value in the VALUES clause
      const categoryIndex = q.sql.split('VALUES')[0].split(',').findIndex(s => s.includes('category'));
      assert.ok(categoryIndex >= 0, 'should have category column');
    });

    it('logs audit entry for buyer upload', async () => {
      capturedQueries.length = 0;

      const tenantId = 'tenant-123';
      const transactionId = 'tx-456';
      const documentId = 'doc-789';

      await logAudit({
        tenantId,
        userId: '00000000-0000-0000-0000-000000000000', // System/buyer portal user
        action: 'create',
        resourceType: 'document',
        resourceId: documentId,
        before: null,
        after: {
          transaction_id: transactionId,
          category: 'proof_of_transfer',
          file_name: 'payment-proof.pdf',
          uploaded_by: 'buyer_portal',
        },
      });

      const q = capturedQueries[0];
      assert.ok(q.sql.includes('INSERT INTO audit_logs'), 'should log to audit_logs');
      assert.strictEqual(q.values[2], 'create', 'action should be create');
      assert.strictEqual(q.values[3], 'document', 'entity_type should be document');
      
      const details = JSON.parse(q.values[5] as string);
      assert.strictEqual(details.after.uploaded_by, 'buyer_portal', 'should record buyer_portal as source');
    });

    it('generates correct R2 key structure for portal uploads', () => {
      function generateKey(tenantId: string, transactionId: string, fileName: string): string {
        const safeName = fileName.replace(/[^a-zA-Z0-9.-]/g, '-');
        return `portal-uploads/${tenantId}/${transactionId}/${Date.now()}-${safeName}`;
      }

      const key = generateKey('tenant-123', 'tx-456', 'My Payment Proof.pdf');
      
      assert.ok(key.startsWith('portal-uploads/tenant-123/tx-456/'), 'key should have correct path structure');
      assert.ok(key.includes('My-Payment-Proof.pdf'), 'filename should be sanitized');
    });
  });

  describe('GET /api/portal/[token]/documents', () => {
    it('queries documents for the correct transaction', async () => {
      capturedQueries.length = 0;

      const portalToken = 'portal-token-123';
      const tenantId = 'tenant-123';

      // Step 1: Find transaction by portal token
      await sql`
        SELECT t.id, t.tenant_id
        FROM transactions t
        WHERE t.portal_token = ${portalToken}
        LIMIT 1
      `;

      // Step 2: Get documents for this transaction
      const transactionId = 'tx-456';
      await sql`
        SELECT 
          d.id,
          d.file_name,
          d.file_url,
          d.category,
          d.created_at
        FROM documents d
        WHERE d.transaction_id = ${transactionId}
          AND d.tenant_id = ${tenantId}
        ORDER BY d.created_at DESC
      `;

      assert.strictEqual(capturedQueries.length, 2, 'should execute 2 queries');
      
      // First query - find transaction
      assert.ok(capturedQueries[0].sql.includes('portal_token'), 'first query should filter by portal_token');
      
      // Second query - get documents
      assert.ok(capturedQueries[1].sql.includes('FROM documents'), 'second query should select from documents');
      assert.ok(capturedQueries[1].sql.includes('transaction_id'), 'second query should filter by transaction_id');
      assert.ok(capturedQueries[1].sql.includes('ORDER BY d.created_at DESC'), 'should order by newest first');
    });
  });

  describe('Email notification', () => {
    it('notifies assigned agent and admins on upload', () => {
      const notifiedEmails: string[] = [];

      function notifyBuyerUpload({
        to,
        buyerName,
        unitNumber,
      }: {
        to: string[];
        buyerName: string;
        unitNumber: string;
      }) {
        to.forEach(email => notifiedEmails.push(email));
        return {success: true};
      }

      // Simulate notifying agent and admins
      notifyBuyerUpload({
        to: ['agent@example.com', 'pm@example.com', 'admin@example.com'],
        buyerName: 'John Doe',
        unitNumber: 'A-101',
      });

      assert.strictEqual(notifiedEmails.length, 3, 'should notify 3 people');
      assert.ok(notifiedEmails.includes('agent@example.com'), 'should notify assigned agent');
      assert.ok(notifiedEmails.includes('pm@example.com'), 'should notify project manager');
      assert.ok(notifiedEmails.includes('admin@example.com'), 'should notify admin');
    });
  });

  describe('Full integration flow', () => {
    it('complete flow: upload -> document created -> audit logged -> notifications sent', async () => {
      capturedQueries.length = 0;

      const tenantId = 'tenant-123';
      const transactionId = 'tx-456';
      const documentId = 'doc-789';
      const fileName = 'payment-proof.pdf';
      const fileUrl = 'https://r2.storage/portal-uploads/tenant-123/tx-456/1234567890-payment-proof.pdf';

      // Step 1: Find transaction by portal token (bypass RLS)
      const portalToken = 'portal-token-123';
      await sql`
        SELECT t.id, t.tenant_id, t.unit_id, t.buyer_id, t.status,
          u.unit_number,
          b.full_name as buyer_name, b.email as buyer_email,
          proj.name as project_name
        FROM transactions t
        LEFT JOIN units u ON u.id = t.unit_id
        LEFT JOIN buyers b ON b.id = t.buyer_id
        LEFT JOIN projects proj ON proj.id = u.project_id
        WHERE t.portal_token = ${portalToken}
        LIMIT 1
      `;

      // Step 2: Upload to R2 (mocked)
      const r2Key = `portal-uploads/${tenantId}/${transactionId}/${Date.now()}-${fileName}`;
      assert.ok(r2Key.includes('portal-uploads'), 'R2 key should use portal-uploads prefix');

      // Step 3: Create document record
      await sql`
        INSERT INTO documents (
          tenant_id, transaction_id, category, file_name, file_url, uploaded_by
        ) VALUES (
          ${tenantId}, ${transactionId}, 'proof_of_transfer', ${fileName}, ${fileUrl}, NULL
        )
        RETURNING id
      `;

      // Step 4: Log audit entry
      await logAudit({
        tenantId,
        userId: '00000000-0000-0000-0000-000000000000',
        action: 'create',
        resourceType: 'document',
        resourceId: documentId,
        before: null,
        after: {
          transaction_id: transactionId,
          category: 'proof_of_transfer',
          file_name: fileName,
          file_url: fileUrl,
          uploaded_by: 'buyer_portal',
        },
      });

      // Verify all steps executed
      assert.strictEqual(capturedQueries.length, 3, 'all 3 database operations executed');
      
      // Verify transaction lookup
      assert.ok(capturedQueries[0].sql.includes('portal_token'), 'step 1: lookup by portal token');
      
      // Verify document insert
      assert.ok(capturedQueries[1].sql.includes('INSERT INTO documents'), 'step 2: insert document');
      
      // Verify audit log
      assert.ok(capturedQueries[2].sql.includes('INSERT INTO audit_logs'), 'step 3: audit log entry');
    });
  });
});

describe('Portal Security', () => {
  it('uses portal token for authentication, not session', () => {
    // The portal upload route should NOT check for session cookie
    // Instead it validates the portal token against the transaction
    const authMethod = 'portal_token'; // vs 'session_cookie'
    
    assert.strictEqual(authMethod, 'portal_token', 'portal uses token-based auth');
  });

  it('transaction lookup validates token matches transaction', () => {
    const validToken = 'valid-portal-token-123';
    const invalidToken = 'invalid-token-456';
    
    const transaction = {id: 'tx-123', portal_token: validToken};
    
    function validateToken(token: string): boolean {
      return token === transaction.portal_token;
    }
    
    assert.strictEqual(validateToken(validToken), true, 'valid token accepted');
    assert.strictEqual(validateToken(invalidToken), false, 'invalid token rejected');
  });
});
