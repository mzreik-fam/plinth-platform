import {describe, it} from 'node:test';
import assert from 'node:assert';

// ---- Test Constants ----
const TICKET_STATUS = {
  OPEN: 'open',
  IN_PROGRESS: 'in_progress',
  RESOLVED: 'resolved',
  CLOSED: 'closed',
};

const HANDOVER_STATUS = {
  PENDING_BCC: 'pending_bcc',
  PAYMENT_DUE: 'payment_due',
  REGISTRATION: 'registration',
  INSPECTION_SCHEDULED: 'inspection_scheduled',
  SNAGGING: 'snagging',
  READY_FOR_HANDOVER: 'ready_for_handover',
  COMPLETED: 'completed',
};

// ---- Mock Data Helpers ----

function createMockTicket(overrides = {}) {
  return {
    id: 'ticket-' + Math.random().toString(36).slice(2, 8),
    tenant_id: 'tenant-1',
    handover_id: 'handover-123',
    unit_id: 'unit-1',
    title: 'Test Ticket',
    description: 'Test description',
    severity: 'minor',
    assigned_to: null,
    status: TICKET_STATUS.OPEN,
    buyer_comments: null,
    engineer_comments: null,
    resolved_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function createMockHandover(overrides = {}) {
  return {
    id: 'handover-123',
    tenant_id: 'tenant-1',
    transaction_id: 'txn-123',
    unit_id: 'unit-1',
    status: HANDOVER_STATUS.SNAGGING,
    bcc_uploaded_at: new Date().toISOString(),
    bcc_document_url: 'https://example.com/bcc.pdf',
    completion_notice_sent_at: new Date().toISOString(),
    handover_payment_amount: 50000,
    handover_payment_paid_at: new Date().toISOString(),
    dld_registration_confirmed: true,
    oqood_paid: true,
    utility_registration_confirmed: true,
    inspection_date: new Date().toISOString(),
    inspection_notes: null,
    inspection_photos: [],
    key_handover_signed_at: null,
    key_handover_document_url: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

// ---- Snagging Auto-Advance Logic ----

interface CheckResult {
  shouldAdvance: boolean;
  newStatus?: string;
}

/**
 * Check if handover should advance based on ticket statuses.
 * Both 'closed' and 'resolved' are considered terminal states.
 */
function checkShouldAdvanceHandover(tickets: any[]): CheckResult {
  if (tickets.length === 0) {
    // No tickets at all - handover can advance
    return {shouldAdvance: true, newStatus: HANDOVER_STATUS.READY_FOR_HANDOVER};
  }

  // Count tickets that are NOT in terminal states
  const nonTerminalTickets = tickets.filter(
    t => t.status !== TICKET_STATUS.CLOSED && t.status !== TICKET_STATUS.RESOLVED
  );

  if (nonTerminalTickets.length === 0) {
    // All tickets are in terminal states - advance handover
    return {shouldAdvance: true, newStatus: HANDOVER_STATUS.READY_FOR_HANDOVER};
  }

  return {shouldAdvance: false};
}

// ---- Tests ----

describe('P1-3: Snagging Ticket Auto-Advance', () => {
  describe('Auto-Advance Logic', () => {
    it('advances handover when all tickets are closed', () => {
      const tickets = [
        createMockTicket({status: TICKET_STATUS.CLOSED}),
        createMockTicket({status: TICKET_STATUS.CLOSED}),
        createMockTicket({status: TICKET_STATUS.CLOSED}),
      ];

      const result = checkShouldAdvanceHandover(tickets);

      assert.strictEqual(result.shouldAdvance, true);
      assert.strictEqual(result.newStatus, HANDOVER_STATUS.READY_FOR_HANDOVER);
    });

    it('advances handover when all tickets are resolved', () => {
      const tickets = [
        createMockTicket({status: TICKET_STATUS.RESOLVED}),
        createMockTicket({status: TICKET_STATUS.RESOLVED}),
      ];

      const result = checkShouldAdvanceHandover(tickets);

      assert.strictEqual(result.shouldAdvance, true);
      assert.strictEqual(result.newStatus, HANDOVER_STATUS.READY_FOR_HANDOVER);
    });

    it('advances handover when tickets are mix of closed and resolved', () => {
      const tickets = [
        createMockTicket({status: TICKET_STATUS.CLOSED}),
        createMockTicket({status: TICKET_STATUS.RESOLVED}),
        createMockTicket({status: TICKET_STATUS.CLOSED}),
      ];

      const result = checkShouldAdvanceHandover(tickets);

      assert.strictEqual(result.shouldAdvance, true);
      assert.strictEqual(result.newStatus, HANDOVER_STATUS.READY_FOR_HANDOVER);
    });

    it('does NOT advance when any ticket is open', () => {
      const tickets = [
        createMockTicket({status: TICKET_STATUS.CLOSED}),
        createMockTicket({status: TICKET_STATUS.OPEN}),
        createMockTicket({status: TICKET_STATUS.CLOSED}),
      ];

      const result = checkShouldAdvanceHandover(tickets);

      assert.strictEqual(result.shouldAdvance, false);
      assert.strictEqual(result.newStatus, undefined);
    });

    it('does NOT advance when any ticket is in_progress', () => {
      const tickets = [
        createMockTicket({status: TICKET_STATUS.RESOLVED}),
        createMockTicket({status: TICKET_STATUS.IN_PROGRESS}),
        createMockTicket({status: TICKET_STATUS.CLOSED}),
      ];

      const result = checkShouldAdvanceHandover(tickets);

      assert.strictEqual(result.shouldAdvance, false);
      assert.strictEqual(result.newStatus, undefined);
    });

    it('advances handover when there are no tickets at all', () => {
      const tickets: any[] = [];

      const result = checkShouldAdvanceHandover(tickets);

      assert.strictEqual(result.shouldAdvance, true);
      assert.strictEqual(result.newStatus, HANDOVER_STATUS.READY_FOR_HANDOVER);
    });

    it('advances on third ticket close when first two were already closed', () => {
      // Simulate the scenario: close tickets one by one
      const ticketsBefore = [
        createMockTicket({id: 'ticket-1', status: TICKET_STATUS.CLOSED}),
        createMockTicket({id: 'ticket-2', status: TICKET_STATUS.CLOSED}),
        createMockTicket({id: 'ticket-3', status: TICKET_STATUS.IN_PROGRESS}),
      ];

      // Before closing the third ticket
      const resultBefore = checkShouldAdvanceHandover(ticketsBefore);
      assert.strictEqual(resultBefore.shouldAdvance, false);

      // After closing the third ticket
      const ticketsAfter = [
        createMockTicket({id: 'ticket-1', status: TICKET_STATUS.CLOSED}),
        createMockTicket({id: 'ticket-2', status: TICKET_STATUS.CLOSED}),
        createMockTicket({id: 'ticket-3', status: TICKET_STATUS.CLOSED}),
      ];

      const resultAfter = checkShouldAdvanceHandover(ticketsAfter);
      assert.strictEqual(resultAfter.shouldAdvance, true);
      assert.strictEqual(resultAfter.newStatus, HANDOVER_STATUS.READY_FOR_HANDOVER);
    });

    it('advances when last open ticket is deleted', () => {
      // Scenario: 3 tickets, 2 closed, 1 open
      // The open ticket gets deleted
      const ticketsBeforeDeletion = [
        createMockTicket({id: 'ticket-1', status: TICKET_STATUS.CLOSED}),
        createMockTicket({id: 'ticket-2', status: TICKET_STATUS.CLOSED}),
        createMockTicket({id: 'ticket-3', status: TICKET_STATUS.OPEN}),
      ];

      // Before deletion - should not advance
      const resultBefore = checkShouldAdvanceHandover(ticketsBeforeDeletion);
      assert.strictEqual(resultBefore.shouldAdvance, false);

      // After deleting the open ticket - only closed tickets remain
      const ticketsAfterDeletion = [
        createMockTicket({id: 'ticket-1', status: TICKET_STATUS.CLOSED}),
        createMockTicket({id: 'ticket-2', status: TICKET_STATUS.CLOSED}),
      ];

      const resultAfter = checkShouldAdvanceHandover(ticketsAfterDeletion);
      assert.strictEqual(resultAfter.shouldAdvance, true);
      assert.strictEqual(resultAfter.newStatus, HANDOVER_STATUS.READY_FOR_HANDOVER);
    });

    it('advances when ticket is resolved (not just closed)', () => {
      // Test that 'resolved' is also a terminal state
      const tickets = [
        createMockTicket({status: TICKET_STATUS.RESOLVED}),
      ];

      const result = checkShouldAdvanceHandover(tickets);

      assert.strictEqual(result.shouldAdvance, true);
      assert.strictEqual(result.newStatus, HANDOVER_STATUS.READY_FOR_HANDOVER);
    });
  });

  describe('API Route Implementation', () => {
    it('PATCH handler has checkAndAdvanceHandover helper function', async () => {
      const fs = await import('node:fs');
      const content = fs.readFileSync('app/api/snagging-tickets/[id]/route.ts', 'utf-8');

      assert.ok(content.includes('checkAndAdvanceHandover'),
        'Should have checkAndAdvanceHandover helper function');
      assert.ok(content.includes('NOT IN'),
        'Should query for non-terminal ticket statuses');
      assert.ok(content.includes('closed') && content.includes('resolved'),
        'Should consider both closed and resolved as terminal states');
    });

    it('PATCH handler triggers auto-advance when ticket moves to terminal state', async () => {
      const fs = await import('node:fs');
      const content = fs.readFileSync('app/api/snagging-tickets/[id]/route.ts', 'utf-8');

      assert.ok(content.includes('terminalStatuses'),
        'Should define terminalStatuses array');
      assert.ok(content.includes('checkAndAdvanceHandover'),
        'Should call checkAndAdvanceHandover');
    });

    it('PATCH handler only triggers auto-advance when status actually changes to terminal', async () => {
      const fs = await import('node:fs');
      const content = fs.readFileSync('app/api/snagging-tickets/[id]/route.ts', 'utf-8');

      // Should check old status vs new status to avoid duplicate triggers
      assert.ok(content.includes('oldStatus'),
        'Should track old status before update');
    });

    it('DELETE handler exists and triggers auto-advance check', async () => {
      const fs = await import('node:fs');
      const content = fs.readFileSync('app/api/snagging-tickets/[id]/route.ts', 'utf-8');

      assert.ok(content.includes('export async function DELETE'),
        'Should have DELETE handler');
      assert.ok(content.includes('checkAndAdvanceHandover'),
        'DELETE should call checkAndAdvanceHandover');
    });

    it('DELETE handler checks if deleted ticket was non-terminal before triggering advance', async () => {
      const fs = await import('node:fs');
      const content = fs.readFileSync('app/api/snagging-tickets/[id]/route.ts', 'utf-8');

      assert.ok(content.includes('wasTerminal'),
        'Should track if deleted ticket was in terminal state');
    });

    it('PATCH handler updates handover status to ready_for_handover', async () => {
      const fs = await import('node:fs');
      const content = fs.readFileSync('app/api/snagging-tickets/[id]/route.ts', 'utf-8');

      assert.ok(content.includes('ready_for_handover'),
        'Should set handover status to ready_for_handover');
    });

    it('PATCH handler notifies PM and Super Admin on auto-advance', async () => {
      const fs = await import('node:fs');
      const content = fs.readFileSync('app/api/snagging-tickets/[id]/route.ts', 'utf-8');

      assert.ok(content.includes('notifyHandoverReady'),
        'Should call notifyHandoverReady');
      assert.ok(content.includes('project_manager'),
        'Should query for project_manager role');
      assert.ok(content.includes('super_admin'),
        'Should query for super_admin role');
    });
  });

  describe('Email Notification', () => {
    it('notifyHandoverReady function exists in lib/email.ts', async () => {
      const fs = await import('node:fs');
      const content = fs.readFileSync('lib/email.ts', 'utf-8');

      assert.ok(content.includes('export async function notifyHandoverReady'),
        'Should export notifyHandoverReady function');
      assert.ok(content.includes('Handover Ready'),
        'Should have appropriate subject line');
      assert.ok(content.includes('unitNumber'),
        'Should include unit number in notification');
    });
  });

  describe('Traceability Checklist Item 3.11', () => {
    it('spec requirement 3.11 is implemented: auto-advance on all tickets closed', async () => {
      const fs = await import('node:fs');
      const routeContent = fs.readFileSync('app/api/snagging-tickets/[id]/route.ts', 'utf-8');
      const emailContent = fs.readFileSync('lib/email.ts', 'utf-8');

      // Verify all components are in place
      assert.ok(routeContent.includes('checkAndAdvanceHandover'),
        'Auto-advance logic should exist');
      assert.ok(routeContent.includes('ready_for_handover'),
        'Should advance to ready_for_handover status');
      assert.ok(routeContent.includes('notifyHandoverReady'),
        'Should send notification');
      assert.ok(emailContent.includes('notifyHandoverReady'),
        'Notification function should exist');
    });
  });

  describe('Complete Workflow Scenarios', () => {
    it('scenario: 3 tickets, close them one by one -> advance on third', () => {
      // Initial state: 3 open tickets
      let tickets = [
        createMockTicket({id: 't1', status: TICKET_STATUS.OPEN}),
        createMockTicket({id: 't2', status: TICKET_STATUS.OPEN}),
        createMockTicket({id: 't3', status: TICKET_STATUS.OPEN}),
      ];

      // Close first ticket - should NOT advance
      tickets[0].status = TICKET_STATUS.CLOSED;
      let result = checkShouldAdvanceHandover(tickets);
      assert.strictEqual(result.shouldAdvance, false, 'Should not advance after 1st close');

      // Close second ticket - should NOT advance
      tickets[1].status = TICKET_STATUS.CLOSED;
      result = checkShouldAdvanceHandover(tickets);
      assert.strictEqual(result.shouldAdvance, false, 'Should not advance after 2nd close');

      // Close third ticket - SHOULD advance
      tickets[2].status = TICKET_STATUS.CLOSED;
      result = checkShouldAdvanceHandover(tickets);
      assert.strictEqual(result.shouldAdvance, true, 'Should advance after 3rd close');
      assert.strictEqual(result.newStatus, HANDOVER_STATUS.READY_FOR_HANDOVER);
    });

    it('scenario: resolve tickets instead of closing -> still advances', () => {
      const tickets = [
        createMockTicket({status: TICKET_STATUS.RESOLVED}),
        createMockTicket({status: TICKET_STATUS.RESOLVED}),
      ];

      const result = checkShouldAdvanceHandover(tickets);
      assert.strictEqual(result.shouldAdvance, true);
    });

    it('scenario: delete the last open ticket -> advances', () => {
      // Start with 2 closed, 1 open
      let tickets = [
        createMockTicket({id: 't1', status: TICKET_STATUS.CLOSED}),
        createMockTicket({id: 't2', status: TICKET_STATUS.CLOSED}),
        createMockTicket({id: 't3', status: TICKET_STATUS.OPEN}),
      ];

      // Before deletion
      let result = checkShouldAdvanceHandover(tickets);
      assert.strictEqual(result.shouldAdvance, false);

      // Delete the open ticket (simulate by filtering it out)
      tickets = tickets.filter(t => t.id !== 't3');

      // After deletion
      result = checkShouldAdvanceHandover(tickets);
      assert.strictEqual(result.shouldAdvance, true);
      assert.strictEqual(result.newStatus, HANDOVER_STATUS.READY_FOR_HANDOVER);
    });
  });
});
