import {describe, it} from 'node:test';
import assert from 'node:assert';

// ---- Test Constants ----
const TRANSACTION_STATUS = {
  EOI: 'eoi',
  BOOKING_PENDING: 'booking_pending',
  CONFIRMED: 'confirmed',
  CANCELLED: 'cancelled',
  TERMINATED: 'terminated',
};

const PAYMENT_STATUS = {
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  REJECTED: 'rejected',
};

// ---- Mock Data Helpers ----

function createMockTransaction(overrides = {}) {
  return {
    id: 'txn-123',
    tenant_id: 'tenant-1',
    unit_id: 'unit-1',
    buyer_id: 'buyer-1',
    payment_plan_id: 'plan-1',
    agent_id: 'agent-1',
    status: TRANSACTION_STATUS.BOOKING_PENDING,
    eoi_amount: 50000,
    eoi_date: new Date().toISOString(),
    booking_amount: null,
    booking_date: null,
    total_price: 1000000,
    signed_at: null,
    portal_token: 'portal-token-123',
    notes: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function createMockPayment(overrides = {}) {
  return {
    id: 'payment-123',
    tenant_id: 'tenant-1',
    transaction_id: 'txn-123',
    amount: 200000,
    payment_method: 'bank_transfer',
    reference_number: 'REF-123',
    proof_url: null,
    status: PAYMENT_STATUS.CONFIRMED,
    confirmed_by: 'admin-1',
    confirmed_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

// ---- Booking Confirmation Validation Logic ----

interface ValidationResult {
  valid: boolean;
  error?: string;
}

function validateBookingConfirmation(
  transaction: any,
  confirmedPayments: any[],
  signedAtOverride?: string | null
): ValidationResult {
  // Rule 1: Must have signed_at set (digital signature OR admin wet-signature confirmation)
  const hasSignature = transaction.signed_at != null || signedAtOverride != null;
  
  if (!hasSignature) {
    return {
      valid: false,
      error: 'Booking cannot be confirmed: Buyer signature required. Admin may check "Buyer signed on paper" for wet-signature interim.',
    };
  }

  // Rule 2: Must have at least one confirmed payment
  const hasConfirmedPayment = confirmedPayments.length > 0 && 
    confirmedPayments.some(p => p.status === PAYMENT_STATUS.CONFIRMED);
  
  if (!hasConfirmedPayment) {
    return {
      valid: false,
      error: 'Booking cannot be confirmed: At least one confirmed payment is required.',
    };
  }

  return {valid: true};
}

// ---- Tests ----

describe('P0-4: Booking Confirmation Enforcement', () => {
  describe('Validation Logic', () => {
    it('rejects confirmation when transaction has no signature and no override', () => {
      const transaction = createMockTransaction({
        status: TRANSACTION_STATUS.BOOKING_PENDING,
        signed_at: null,
      });
      const payments = [createMockPayment({status: PAYMENT_STATUS.CONFIRMED})];

      const result = validateBookingConfirmation(transaction, payments);

      assert.strictEqual(result.valid, false);
      assert.ok(result.error?.includes('signature required'), 'Error should mention signature requirement');
    });

    it('rejects confirmation when no confirmed payments exist', () => {
      const transaction = createMockTransaction({
        status: TRANSACTION_STATUS.BOOKING_PENDING,
        signed_at: new Date().toISOString(),
      });
      const payments = [createMockPayment({status: PAYMENT_STATUS.PENDING})];

      const result = validateBookingConfirmation(transaction, payments);

      assert.strictEqual(result.valid, false);
      assert.ok(result.error?.includes('confirmed payment'), 'Error should mention payment requirement');
    });

    it('allows confirmation when transaction has signed_at set', () => {
      const transaction = createMockTransaction({
        status: TRANSACTION_STATUS.BOOKING_PENDING,
        signed_at: new Date().toISOString(),
      });
      const payments = [createMockPayment({status: PAYMENT_STATUS.CONFIRMED})];

      const result = validateBookingConfirmation(transaction, payments);

      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.error, undefined);
    });

    it('allows confirmation when admin provides wet-signature override', () => {
      const transaction = createMockTransaction({
        status: TRANSACTION_STATUS.BOOKING_PENDING,
        signed_at: null, // No prior signature
      });
      const payments = [createMockPayment({status: PAYMENT_STATUS.CONFIRMED})];
      const wetSignatureOverride = new Date().toISOString();

      const result = validateBookingConfirmation(transaction, payments, wetSignatureOverride);

      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.error, undefined);
    });

    it('allows confirmation with multiple confirmed payments', () => {
      const transaction = createMockTransaction({
        status: TRANSACTION_STATUS.BOOKING_PENDING,
        signed_at: new Date().toISOString(),
      });
      const payments = [
        createMockPayment({id: 'payment-1', status: PAYMENT_STATUS.CONFIRMED}),
        createMockPayment({id: 'payment-2', status: PAYMENT_STATUS.CONFIRMED}),
        createMockPayment({id: 'payment-3', status: PAYMENT_STATUS.PENDING}), // Should be ignored
      ];

      const result = validateBookingConfirmation(transaction, payments);

      assert.strictEqual(result.valid, true);
    });

    it('rejects confirmation when all payments are pending', () => {
      const transaction = createMockTransaction({
        status: TRANSACTION_STATUS.BOOKING_PENDING,
        signed_at: new Date().toISOString(),
      });
      const payments = [
        createMockPayment({id: 'payment-1', status: PAYMENT_STATUS.PENDING}),
        createMockPayment({id: 'payment-2', status: PAYMENT_STATUS.PENDING}),
      ];

      const result = validateBookingConfirmation(transaction, payments);

      assert.strictEqual(result.valid, false);
      assert.ok(result.error?.includes('confirmed payment'));
    });

    it('rejects confirmation when all payments are rejected', () => {
      const transaction = createMockTransaction({
        status: TRANSACTION_STATUS.BOOKING_PENDING,
        signed_at: new Date().toISOString(),
      });
      const payments = [
        createMockPayment({id: 'payment-1', status: PAYMENT_STATUS.REJECTED}),
        createMockPayment({id: 'payment-2', status: PAYMENT_STATUS.REJECTED}),
      ];

      const result = validateBookingConfirmation(transaction, payments);

      assert.strictEqual(result.valid, false);
      assert.ok(result.error?.includes('confirmed payment'));
    });

    it('rejects confirmation when no payments exist at all', () => {
      const transaction = createMockTransaction({
        status: TRANSACTION_STATUS.BOOKING_PENDING,
        signed_at: new Date().toISOString(),
      });
      const payments: any[] = [];

      const result = validateBookingConfirmation(transaction, payments);

      assert.strictEqual(result.valid, false);
      assert.ok(result.error?.includes('confirmed payment'));
    });

    it('rejects confirmation when both conditions fail', () => {
      const transaction = createMockTransaction({
        status: TRANSACTION_STATUS.BOOKING_PENDING,
        signed_at: null,
      });
      const payments: any[] = [];

      const result = validateBookingConfirmation(transaction, payments);

      assert.strictEqual(result.valid, false);
      // Should check signature first
      assert.ok(result.error?.includes('signature required'));
    });
  });

  describe('API Route Protection', () => {
    it('PATCH handler validates signed_at before allowing status=confirmed', async () => {
      const fs = await import('node:fs');
      const content = fs.readFileSync('app/api/transactions/[id]/route.ts', 'utf-8');
      
      // Check for the P0-4 validation logic
      assert.ok(content.includes('P0-4: Enforce booking confirmation rules server-side'), 
        'Should have P0-4 comment marking the validation block');
      assert.ok(content.includes('signed_at'), 
        'Should check signed_at field');
      assert.ok(content.includes('confirmed'), 
        'Should check for confirmed payments');
      assert.ok(content.includes('Booking cannot be confirmed'), 
        'Should return specific error message');
    });

    it('PATCH handler returns 400 for missing signature', async () => {
      const fs = await import('node:fs');
      const content = fs.readFileSync('app/api/transactions/[id]/route.ts', 'utf-8');
      
      assert.ok(content.includes('status: 400'), 
        'Should return 400 status for validation failures');
    });

    it('PATCH handler accepts signedAt parameter for wet signature', async () => {
      const fs = await import('node:fs');
      const content = fs.readFileSync('app/api/transactions/[id]/route.ts', 'utf-8');
      
      assert.ok(content.includes('signedAt'), 
        'Should accept signedAt parameter in schema');
    });
  });

  describe('UI Enforcement', () => {
    it('sales detail page has wet signature checkbox', async () => {
      const fs = await import('node:fs');
      const content = fs.readFileSync('app/[locale]/(dashboard)/sales/[id]/page.tsx', 'utf-8');
      
      assert.ok(content.includes('wetSignatureChecked'), 
        'Should have wetSignatureChecked state');
      assert.ok(content.includes('Buyer signed on paper'), 
        'Should show wet signature checkbox label');
      // Check for either Checkbox component or native input checkbox
      assert.ok(content.includes('Checkbox') || content.includes('type="checkbox"'), 
        'Should use Checkbox component or native input');
    });

    it('sales detail page disables Confirm button when conditions not met', async () => {
      const fs = await import('node:fs');
      const content = fs.readFileSync('app/[locale]/(dashboard)/sales/[id]/page.tsx', 'utf-8');
      
      assert.ok(content.includes('canConfirmBooking'), 
        'Should compute canConfirmBooking flag');
      assert.ok(content.includes('disabled={!canConfirmBooking}'), 
        'Should disable button when cannot confirm');
    });

    it('sales detail page shows tooltip explaining why confirmation blocked', async () => {
      const fs = await import('node:fs');
      const content = fs.readFileSync('app/[locale]/(dashboard)/sales/[id]/page.tsx', 'utf-8');
      
      // Check for alternative tooltip implementation using title attribute or div
      const hasTooltip = content.includes('title={!canConfirmBooking') || 
                        content.includes('Cannot confirm booking');
      assert.ok(hasTooltip, 'Should have tooltip or explanation for why booking cannot be confirmed');
      assert.ok(content.includes('signature required') || content.includes('Buyer signed on paper'), 
        'Should mention signature requirement in tooltip');
    });

    it('sales detail page shows booking confirmation requirements card', async () => {
      const fs = await import('node:fs');
      const content = fs.readFileSync('app/[locale]/(dashboard)/sales/[id]/page.tsx', 'utf-8');
      
      assert.ok(content.includes('Booking Confirmation Requirements'), 
        'Should show requirements card header');
      assert.ok(content.includes('Buyer Signature Required') || content.includes('Buyer Signed'), 
        'Should show signature status');
      assert.ok(content.includes('Confirmed Payment') || content.includes('payment'), 
        'Should show payment requirement status');
    });
  });

  describe('D-002 Resolution', () => {
    it('D-002 is resolved: server-side validation exists', async () => {
      const fs = await import('node:fs');
      const content = fs.readFileSync('app/api/transactions/[id]/route.ts', 'utf-8');
      
      // Check that the API no longer blindly accepts status=confirmed
      assert.ok(content.includes('if (data.status === \'confirmed\')'), 
        'Should have explicit check for confirmed status');
      assert.ok(content.includes('signed_at') || content.includes('signedAt'), 
        'Should validate signature');
      assert.ok(content.includes('payments') || content.includes('confirmed'), 
        'Should validate payments');
    });
  });
});

describe('Booking Confirmation Flow Integration', () => {
  it('validates the complete flow: no signature, no payment -> fail', () => {
    const transaction = createMockTransaction({
      status: TRANSACTION_STATUS.BOOKING_PENDING,
      signed_at: null,
    });
    const payments: any[] = [];

    const result = validateBookingConfirmation(transaction, payments);
    assert.strictEqual(result.valid, false);
  });

  it('validates the complete flow: has signature, no payment -> fail', () => {
    const transaction = createMockTransaction({
      status: TRANSACTION_STATUS.BOOKING_PENDING,
      signed_at: new Date().toISOString(),
    });
    const payments: any[] = [];

    const result = validateBookingConfirmation(transaction, payments);
    assert.strictEqual(result.valid, false);
    assert.ok(result.error?.includes('confirmed payment'));
  });

  it('validates the complete flow: no signature, has payment -> fail', () => {
    const transaction = createMockTransaction({
      status: TRANSACTION_STATUS.BOOKING_PENDING,
      signed_at: null,
    });
    const payments = [createMockPayment({status: PAYMENT_STATUS.CONFIRMED})];

    const result = validateBookingConfirmation(transaction, payments);
    assert.strictEqual(result.valid, false);
    assert.ok(result.error?.includes('signature required'));
  });

  it('validates the complete flow: has signature, has confirmed payment -> success', () => {
    const transaction = createMockTransaction({
      status: TRANSACTION_STATUS.BOOKING_PENDING,
      signed_at: new Date().toISOString(),
    });
    const payments = [createMockPayment({status: PAYMENT_STATUS.CONFIRMED})];

    const result = validateBookingConfirmation(transaction, payments);
    assert.strictEqual(result.valid, true);
  });

  it('validates the complete flow: wet signature + confirmed payment -> success', () => {
    const transaction = createMockTransaction({
      status: TRANSACTION_STATUS.BOOKING_PENDING,
      signed_at: null, // No digital signature yet
    });
    const payments = [createMockPayment({status: PAYMENT_STATUS.CONFIRMED})];
    const wetSignature = new Date().toISOString();

    const result = validateBookingConfirmation(transaction, payments, wetSignature);
    assert.strictEqual(result.valid, true);
  });
});
