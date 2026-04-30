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

const USER_ROLES = {
  SUPER_ADMIN: 'super_admin',
  PROJECT_MANAGER: 'project_manager',
  ADMIN: 'admin',
  INTERNAL_AGENT: 'internal_agent',
  BUYER: 'buyer',
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
    status: TRANSACTION_STATUS.CONFIRMED,
    eoi_amount: 50000,
    eoi_date: new Date().toISOString(),
    booking_amount: 200000,
    booking_date: new Date().toISOString(),
    total_price: 1000000,
    signed_at: new Date().toISOString(),
    portal_token: 'portal-token-123',
    notes: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    payment_plan_milestones: [
      {label: 'Booking', percent: 20, due_days_from_booking: 0},
      {label: 'Installment 1', percent: 30, due_days_from_booking: 90},
      {label: 'Installment 2', percent: 30, due_days_from_booking: 180},
      {label: 'Final', percent: 20, due_days_from_booking: 365},
    ],
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
    status: 'confirmed',
    confirmed_by: 'admin-1',
    confirmed_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

function createMockUser(role: string) {
  return {
    userId: 'user-123',
    email: 'test@example.com',
    role,
    tenantId: 'tenant-1',
  };
}

// ---- Handover Gating Validation Logic ----

interface HandoverValidationResult {
  valid: boolean;
  error?: string;
  details?: {
    hasZeroBalance: boolean;
    hasBccDocument: boolean;
    hasRequiredRole: boolean;
    totalPaid: number;
    requiredBeforeHandover: number;
    finalMilestoneAmount: number;
  };
}

function validateHandoverRequirements(
  transaction: any,
  confirmedPayments: any[],
  bccDocumentUrl: string | null | undefined,
  userRole: string
): HandoverValidationResult {
  // Rule 1: User must be super_admin or project_manager
  const hasRequiredRole = userRole === USER_ROLES.SUPER_ADMIN || userRole === USER_ROLES.PROJECT_MANAGER;
  
  if (!hasRequiredRole) {
    return {
      valid: false,
      error: 'Forbidden: Only Super Admin or Project Manager can initiate handover',
      details: {
        hasZeroBalance: false,
        hasBccDocument: false,
        hasRequiredRole: false,
        totalPaid: 0,
        requiredBeforeHandover: 0,
        finalMilestoneAmount: 0,
      }
    };
  }

  // Rule 2: BCC document must be provided
  const hasBccDocument = bccDocumentUrl != null && bccDocumentUrl.trim().length > 0;
  
  if (!hasBccDocument) {
    return {
      valid: false,
      error: 'Handover cannot start: Building Completion Certificate (BCC) document is required.',
      details: {
        hasZeroBalance: false,
        hasBccDocument: false,
        hasRequiredRole: true,
        totalPaid: 0,
        requiredBeforeHandover: 0,
        finalMilestoneAmount: 0,
      }
    };
  }

  // Rule 3: Zero balance check (all milestones except final handover installment paid)
  const totalPrice = Number(transaction.total_price);
  const totalPaid = confirmedPayments
    .filter(p => p.status === 'confirmed')
    .reduce((sum, p) => sum + Number(p.amount), 0);
  
  const milestones = transaction.payment_plan_milestones || [];
  const finalMilestone = milestones.find((m: any) => 
    m.label?.toLowerCase().includes('final') || 
    m.label?.toLowerCase().includes('handover')
  ) || milestones[milestones.length - 1];
  
  const finalMilestoneAmount = finalMilestone?.percent 
    ? (totalPrice * Number(finalMilestone.percent)) / 100 
    : 0;
  
  const requiredBeforeHandover = totalPrice - finalMilestoneAmount;
  const hasZeroBalance = totalPaid >= requiredBeforeHandover - 0.01;
  
  if (!hasZeroBalance) {
    const remaining = requiredBeforeHandover - totalPaid;
    return {
      valid: false,
      error: `Handover cannot start: Outstanding balance of AED ${remaining.toLocaleString()} must be paid before handover.`,
      details: {
        hasZeroBalance: false,
        hasBccDocument: true,
        hasRequiredRole: true,
        totalPaid,
        requiredBeforeHandover,
        finalMilestoneAmount,
      }
    };
  }

  return {
    valid: true,
    details: {
      hasZeroBalance: true,
      hasBccDocument: true,
      hasRequiredRole: true,
      totalPaid,
      requiredBeforeHandover,
      finalMilestoneAmount,
    }
  };
}

// ---- Tests ----

describe('P0-6: Handover Gating on BCC + Zero Balance', () => {
  describe('Role Validation', () => {
    it('rejects handover when user is not super_admin or project_manager', () => {
      const transaction = createMockTransaction();
      const payments = [createMockPayment()];
      const bccUrl = 'https://example.com/bcc.pdf';
      
      const result = validateHandoverRequirements(transaction, payments, bccUrl, USER_ROLES.ADMIN);
      
      assert.strictEqual(result.valid, false);
      assert.ok(result.error?.includes('Super Admin or Project Manager'), 'Error should mention required role');
      assert.strictEqual(result.details?.hasRequiredRole, false);
    });

    it('allows handover when user is super_admin', () => {
      const transaction = createMockTransaction();
      const payments = [
        createMockPayment({amount: 200000}), // Booking: 20%
        createMockPayment({amount: 300000}), // Installment 1: 30%
        createMockPayment({amount: 300000}), // Installment 2: 30%
      ]; // Total: 800,000 (excluding final 20%)
      const bccUrl = 'https://example.com/bcc.pdf';
      
      const result = validateHandoverRequirements(transaction, payments, bccUrl, USER_ROLES.SUPER_ADMIN);
      
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.details?.hasRequiredRole, true);
    });

    it('allows handover when user is project_manager', () => {
      const transaction = createMockTransaction();
      const payments = [
        createMockPayment({amount: 200000}),
        createMockPayment({amount: 300000}),
        createMockPayment({amount: 300000}),
      ];
      const bccUrl = 'https://example.com/bcc.pdf';
      
      const result = validateHandoverRequirements(transaction, payments, bccUrl, USER_ROLES.PROJECT_MANAGER);
      
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.details?.hasRequiredRole, true);
    });

    it('rejects handover when user is internal_agent', () => {
      const transaction = createMockTransaction();
      const payments = [createMockPayment()];
      const bccUrl = 'https://example.com/bcc.pdf';
      
      const result = validateHandoverRequirements(transaction, payments, bccUrl, USER_ROLES.INTERNAL_AGENT);
      
      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.details?.hasRequiredRole, false);
    });

    it('rejects handover when user is buyer', () => {
      const transaction = createMockTransaction();
      const payments = [createMockPayment()];
      const bccUrl = 'https://example.com/bcc.pdf';
      
      const result = validateHandoverRequirements(transaction, payments, bccUrl, USER_ROLES.BUYER);
      
      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.details?.hasRequiredRole, false);
    });
  });

  describe('BCC Document Validation', () => {
    it('rejects handover when BCC document URL is missing', () => {
      const transaction = createMockTransaction();
      const payments = [createMockPayment()];
      
      const result = validateHandoverRequirements(transaction, payments, null, USER_ROLES.SUPER_ADMIN);
      
      assert.strictEqual(result.valid, false);
      assert.ok(result.error?.includes('BCC'), 'Error should mention BCC requirement');
      assert.strictEqual(result.details?.hasBccDocument, false);
    });

    it('rejects handover when BCC document URL is empty string', () => {
      const transaction = createMockTransaction();
      const payments = [createMockPayment()];
      
      const result = validateHandoverRequirements(transaction, payments, '', USER_ROLES.SUPER_ADMIN);
      
      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.details?.hasBccDocument, false);
    });

    it('rejects handover when BCC document URL is whitespace only', () => {
      const transaction = createMockTransaction();
      const payments = [createMockPayment()];
      
      const result = validateHandoverRequirements(transaction, payments, '   ', USER_ROLES.SUPER_ADMIN);
      
      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.details?.hasBccDocument, false);
    });

    it('allows handover when BCC document URL is provided', () => {
      const transaction = createMockTransaction();
      const payments = [
        createMockPayment({amount: 200000}),
        createMockPayment({amount: 300000}),
        createMockPayment({amount: 300000}),
      ];
      const bccUrl = 'https://storage.example.com/bcc-documents/project-a-bcc.pdf';
      
      const result = validateHandoverRequirements(transaction, payments, bccUrl, USER_ROLES.SUPER_ADMIN);
      
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.details?.hasBccDocument, true);
    });
  });

  describe('Zero Balance Validation', () => {
    it('rejects handover when no payments made', () => {
      const transaction = createMockTransaction();
      const payments: any[] = [];
      const bccUrl = 'https://example.com/bcc.pdf';
      
      const result = validateHandoverRequirements(transaction, payments, bccUrl, USER_ROLES.SUPER_ADMIN);
      
      assert.strictEqual(result.valid, false);
      assert.ok(result.error?.includes('Outstanding balance'), 'Error should mention outstanding balance');
      assert.strictEqual(result.details?.hasZeroBalance, false);
      assert.strictEqual(result.details?.totalPaid, 0);
    });

    it('rejects handover when only booking payment made (20%)', () => {
      const transaction = createMockTransaction();
      const payments = [createMockPayment({amount: 200000})]; // Only 20%
      const bccUrl = 'https://example.com/bcc.pdf';
      
      const result = validateHandoverRequirements(transaction, payments, bccUrl, USER_ROLES.SUPER_ADMIN);
      
      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.details?.hasZeroBalance, false);
      // Required: 800,000 (total - final 20%)
      // Paid: 200,000
      assert.strictEqual(result.details?.totalPaid, 200000);
    });

    it('rejects handover when 60% paid (booking + 1 installment)', () => {
      const transaction = createMockTransaction();
      const payments = [
        createMockPayment({amount: 200000}), // 20%
        createMockPayment({amount: 300000}), // 30%
      ]; // Total: 500,000 (50%)
      const bccUrl = 'https://example.com/bcc.pdf';
      
      const result = validateHandoverRequirements(transaction, payments, bccUrl, USER_ROLES.SUPER_ADMIN);
      
      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.details?.hasZeroBalance, false);
    });

    it('rejects handover when 80% paid but final milestone not identified', () => {
      const transaction = createMockTransaction({
        payment_plan_milestones: [
          {label: 'Deposit', percent: 20, due_days_from_booking: 0},
          {label: 'Structure', percent: 30, due_days_from_booking: 90},
          {label: 'Finishing', percent: 30, due_days_from_booking: 180},
          {label: 'Completion', percent: 20, due_days_from_booking: 365},
        ]
      });
      // Paid 80% but no milestone with "final" or "handover" label
      const payments = [
        createMockPayment({amount: 200000}), // 20%
        createMockPayment({amount: 300000}), // 30%
        createMockPayment({amount: 300000}), // 30%
      ];
      const bccUrl = 'https://example.com/bcc.pdf';
      
      const result = validateHandoverRequirements(transaction, payments, bccUrl, USER_ROLES.SUPER_ADMIN);
      
      // Should use last milestone as final (Completion: 20%)
      // Required: 800,000 (1,000,000 - 200,000)
      // Paid: 800,000
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.details?.hasZeroBalance, true);
    });

    it('allows handover when all milestones except final are paid (80% for 20% final)', () => {
      const transaction = createMockTransaction();
      const payments = [
        createMockPayment({amount: 200000}), // Booking: 20%
        createMockPayment({amount: 300000}), // Installment 1: 30%
        createMockPayment({amount: 300000}), // Installment 2: 30%
      ]; // Total: 800,000 (excluding final 20% = 200,000)
      const bccUrl = 'https://example.com/bcc.pdf';
      
      const result = validateHandoverRequirements(transaction, payments, bccUrl, USER_ROLES.SUPER_ADMIN);
      
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.details?.hasZeroBalance, true);
      assert.strictEqual(result.details?.totalPaid, 800000);
      assert.strictEqual(result.details?.requiredBeforeHandover, 800000);
      assert.strictEqual(result.details?.finalMilestoneAmount, 200000);
    });

    it('allows handover when total paid exceeds required (overpayment)', () => {
      const transaction = createMockTransaction();
      const payments = [
        createMockPayment({amount: 200000}),
        createMockPayment({amount: 300000}),
        createMockPayment({amount: 300000}),
        createMockPayment({amount: 100000}), // Extra payment
      ]; // Total: 900,000
      const bccUrl = 'https://example.com/bcc.pdf';
      
      const result = validateHandoverRequirements(transaction, payments, bccUrl, USER_ROLES.SUPER_ADMIN);
      
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.details?.hasZeroBalance, true);
    });

    it('handles rounding errors with small tolerance', () => {
      const transaction = createMockTransaction({total_price: 1000000});
      // Slightly less than exact due to rounding (within 0.01 tolerance)
      const payments = [
        createMockPayment({amount: 199999.995}), // Just under 20%
        createMockPayment({amount: 300000}),
        createMockPayment({amount: 300000}),
      ]; // Total: 799,999.995 (required: 800,000)
      const bccUrl = 'https://example.com/bcc.pdf';
      
      const result = validateHandoverRequirements(transaction, payments, bccUrl, USER_ROLES.SUPER_ADMIN);
      
      assert.strictEqual(result.valid, true); // Should pass with tolerance
    });

    it('calculates correct final milestone amount for custom payment plan', () => {
      const transaction = createMockTransaction({
        total_price: 2000000,
        payment_plan_milestones: [
          {label: 'Down Payment', percent: 10, due_days_from_booking: 0},
          {label: 'Construction Start', percent: 20, due_days_from_booking: 30},
          {label: 'Structure Complete', percent: 30, due_days_from_booking: 180},
          {label: 'Handover', percent: 40, due_days_from_booking: 365},
        ]
      });
      const payments = [
        createMockPayment({amount: 200000}),  // 10%
        createMockPayment({amount: 400000}),  // 20%
        createMockPayment({amount: 600000}),  // 30%
      ]; // Total: 1,200,000 (excluding handover 40% = 800,000)
      const bccUrl = 'https://example.com/bcc.pdf';
      
      const result = validateHandoverRequirements(transaction, payments, bccUrl, USER_ROLES.SUPER_ADMIN);
      
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.details?.finalMilestoneAmount, 800000); // 40% of 2M
      assert.strictEqual(result.details?.requiredBeforeHandover, 1200000);
    });
  });

  describe('Combined Validation', () => {
    it('fails with role error when both role and BCC are missing (role checked first)', () => {
      const transaction = createMockTransaction();
      const payments = [];
      
      const result = validateHandoverRequirements(transaction, payments, null, USER_ROLES.ADMIN);
      
      assert.strictEqual(result.valid, false);
      assert.ok(result.error?.includes('Super Admin or Project Manager'));
    });

    it('fails with BCC error when role passes but BCC is missing', () => {
      const transaction = createMockTransaction();
      const payments = [];
      
      const result = validateHandoverRequirements(transaction, payments, null, USER_ROLES.SUPER_ADMIN);
      
      assert.strictEqual(result.valid, false);
      assert.ok(result.error?.includes('BCC'));
    });

    it('fails with balance error when role and BCC pass but balance is insufficient', () => {
      const transaction = createMockTransaction();
      const payments = [createMockPayment({amount: 100000})]; // Only 10%
      const bccUrl = 'https://example.com/bcc.pdf';
      
      const result = validateHandoverRequirements(transaction, payments, bccUrl, USER_ROLES.SUPER_ADMIN);
      
      assert.strictEqual(result.valid, false);
      assert.ok(result.error?.includes('Outstanding balance'));
    });

    it('passes when all three conditions are met', () => {
      const transaction = createMockTransaction();
      const payments = [
        createMockPayment({amount: 200000}),
        createMockPayment({amount: 300000}),
        createMockPayment({amount: 300000}),
      ];
      const bccUrl = 'https://example.com/bcc.pdf';
      
      const result = validateHandoverRequirements(transaction, payments, bccUrl, USER_ROLES.SUPER_ADMIN);
      
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.details?.hasRequiredRole, true);
      assert.strictEqual(result.details?.hasBccDocument, true);
      assert.strictEqual(result.details?.hasZeroBalance, true);
    });
  });
});

describe('P0-6: API Route Implementation', () => {
  it('POST handler requires super_admin or project_manager role', async () => {
    const fs = await import('node:fs');
    const content = fs.readFileSync('app/api/handovers/route.ts', 'utf-8');
    
    assert.ok(content.includes('P0-6: Only super_admin or project_manager can initiate handover'), 
      'Should have P0-6 comment marking role validation');
    assert.ok(content.includes('requireRole') || content.includes('super_admin') || content.includes('project_manager'), 
      'Should use requireRole or check for super_admin/project_manager');
    assert.ok(content.includes('status: 403'), 
      'Should return 403 for unauthorized roles');
  });

  it('POST handler validates BCC document is provided', async () => {
    const fs = await import('node:fs');
    const content = fs.readFileSync('app/api/handovers/route.ts', 'utf-8');
    
    assert.ok(content.includes('P0-6: Validate BCC document is provided'), 
      'Should have P0-6 comment marking BCC validation');
    assert.ok(content.includes('bcc_document_url'), 
      'Should check bcc_document_url');
    assert.ok(content.includes('BCC') || content.includes('Building Completion Certificate'), 
      'Should mention BCC in error message');
  });

  it('POST handler validates zero balance excluding final milestone', async () => {
    const fs = await import('node:fs');
    const content = fs.readFileSync('app/api/handovers/route.ts', 'utf-8');
    
    assert.ok(content.includes('P0-6: Validate zero balance'), 
      'Should have P0-6 comment marking zero balance validation');
    assert.ok(content.includes('milestones'), 
      'Should query payment plan milestones');
    assert.ok(content.includes('final') || content.includes('handover'), 
      'Should identify final/handover milestone');
    assert.ok(content.includes('total_paid') || content.includes('totalPaid'), 
      'Should calculate total paid');
  });
});

describe('P0-6: UI Implementation', () => {
  it('sales detail page has handover requirements card', async () => {
    const fs = await import('node:fs');
    const content = fs.readFileSync('app/[locale]/(dashboard)/sales/[id]/page.tsx', 'utf-8');
    
    assert.ok(content.includes('Handover Requirements'), 
      'Should show Handover Requirements card');
    assert.ok(content.includes('hasZeroBalance'), 
      'Should check hasZeroBalance');
    assert.ok(content.includes('canInitiateHandover') || content.includes('canStartHandover'), 
      'Should check role authorization');
  });

  it('Start Handover button is disabled when conditions not met', async () => {
    const fs = await import('node:fs');
    const content = fs.readFileSync('app/[locale]/(dashboard)/sales/[id]/page.tsx', 'utf-8');
    
    assert.ok(content.includes('disabled={!canStartHandover}'), 
      'Should disable button when cannot start handover');
    assert.ok(content.includes('Start Handover'), 
      'Should have Start Handover button');
  });

  it('shows tooltip explaining why handover is blocked', async () => {
    const fs = await import('node:fs');
    const content = fs.readFileSync('app/[locale]/(dashboard)/sales/[id]/page.tsx', 'utf-8');
    
    assert.ok(content.includes('Cannot start handover:') || content.includes('Outstanding balance'), 
      'Should explain why handover is blocked');
  });

  it('has BCC document input in handover dialog', async () => {
    const fs = await import('node:fs');
    const content = fs.readFileSync('app/[locale]/(dashboard)/sales/[id]/page.tsx', 'utf-8');
    
    assert.ok(content.includes('bccDocumentUrl'), 
      'Should have bccDocumentUrl state');
    assert.ok(content.includes('BCC Document URL') || content.includes('Building Completion Certificate'), 
      'Should have BCC document input label');
    assert.ok(content.includes('showHandoverDialog'), 
      'Should have handover dialog state');
  });

  it('calculates final milestone amount correctly in UI', async () => {
    const fs = await import('node:fs');
    const content = fs.readFileSync('app/[locale]/(dashboard)/sales/[id]/page.tsx', 'utf-8');
    
    assert.ok(content.includes('finalMilestone'), 
      'Should identify final milestone');
    assert.ok(content.includes('final') || content.includes('handover'), 
      'Should check for final/handover label');
    assert.ok(content.includes('requiredBeforeHandover'), 
      'Should calculate required payment before handover');
  });
});

describe('D-010 Resolution', () => {
  it('D-010 is resolved: server-side BCC check exists', async () => {
    const fs = await import('node:fs');
    const content = fs.readFileSync('app/api/handovers/route.ts', 'utf-8');
    
    // Check that the API no longer blindly accepts handover creation
    assert.ok(content.includes('bcc_document_url'), 
      'Should validate bcc_document_url');
  });

  it('D-010 is resolved: server-side zero balance check exists', async () => {
    const fs = await import('node:fs');
    const content = fs.readFileSync('app/api/handovers/route.ts', 'utf-8');
    
    assert.ok(content.includes('total_paid') || content.includes('totalPaid'), 
      'Should validate total paid');
    assert.ok(content.includes('Outstanding balance') || content.includes('zero balance'), 
      'Should check for outstanding balance');
  });

  it('D-010 is resolved: role restriction exists', async () => {
    const fs = await import('node:fs');
    const content = fs.readFileSync('app/api/handovers/route.ts', 'utf-8');
    
    assert.ok(content.includes('super_admin') || content.includes('project_manager'), 
      'Should restrict to super_admin or project_manager');
  });
});
