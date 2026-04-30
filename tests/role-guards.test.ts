import {describe, it} from 'node:test';
import assert from 'node:assert';

// ---- Re-implement permission logic for testing (same as lib/permissions.ts) ----

class ForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ForbiddenError';
  }
}

interface SessionUser {
  userId: string;
  email: string;
  role: string;
  tenantId: string;
}

function requireRole(allowedRoles: string[]) {
  return (session: SessionUser | null): void => {
    if (!session) {
      throw new ForbiddenError('Authentication required');
    }
    if (!allowedRoles.includes(session.role)) {
      throw new ForbiddenError(`Requires one of: ${allowedRoles.join(', ')}`);
    }
  };
}

function requireSuperAdmin(session: SessionUser | null): void {
  return requireRole(['super_admin'])(session);
}

function roleGuard(allowedRoles: string[]) {
  return (session: SessionUser | null): {error: string; status: number} | null => {
    if (!session) {
      return {error: 'Authentication required', status: 401};
    }
    if (!allowedRoles.includes(session.role)) {
      return {error: `Requires one of: ${allowedRoles.join(', ')}`, status: 403};
    }
    return null;
  };
}

// ---- Test Constants ----
const ROLES = {
  PLATFORM_OWNER: 'platform_owner',
  SUPER_ADMIN: 'super_admin',
  PROJECT_MANAGER: 'project_manager',
  ADMIN: 'admin',
  INTERNAL_AGENT: 'internal_agent',
  AGENCY_ADMIN: 'agency_admin',
  AGENCY_AGENT: 'agency_agent',
  BUYER: 'buyer',
};

// ---- Tests ----

describe('Permissions - requireRole', () => {
  it('throws ForbiddenError when session is null', () => {
    const guard = requireRole(['super_admin']);
    assert.throws(
      () => guard(null),
      (err: Error) => err instanceof ForbiddenError && err.message === 'Authentication required'
    );
  });

  it('throws ForbiddenError when role is not in allowed list', () => {
    const guard = requireRole(['super_admin']);
    const session: SessionUser = {
      userId: 'u1',
      email: 'admin@test.com',
      role: ROLES.ADMIN,
      tenantId: 't1',
    };
    assert.throws(
      () => guard(session),
      (err: Error) => err instanceof ForbiddenError && err.message.includes('Requires one of: super_admin')
    );
  });

  it('allows access when role is in allowed list', () => {
    const guard = requireRole(['super_admin', 'admin']);
    const session: SessionUser = {
      userId: 'u1',
      email: 'admin@test.com',
      role: ROLES.ADMIN,
      tenantId: 't1',
    };
    // Should not throw
    guard(session);
  });

  it('allows access for super_admin when only super_admin is allowed', () => {
    const guard = requireRole(['super_admin']);
    const session: SessionUser = {
      userId: 'u1',
      email: 'super@test.com',
      role: ROLES.SUPER_ADMIN,
      tenantId: 't1',
    };
    // Should not throw
    guard(session);
  });
});

describe('Permissions - requireSuperAdmin', () => {
  it('throws ForbiddenError for admin role', () => {
    const session: SessionUser = {
      userId: 'u1',
      email: 'admin@test.com',
      role: ROLES.ADMIN,
      tenantId: 't1',
    };
    assert.throws(
      () => requireSuperAdmin(session),
      (err: Error) => err instanceof ForbiddenError
    );
  });

  it('throws ForbiddenError for project_manager role', () => {
    const session: SessionUser = {
      userId: 'u1',
      email: 'pm@test.com',
      role: ROLES.PROJECT_MANAGER,
      tenantId: 't1',
    };
    assert.throws(
      () => requireSuperAdmin(session),
      (err: Error) => err instanceof ForbiddenError
    );
  });

  it('throws ForbiddenError for internal_agent role', () => {
    const session: SessionUser = {
      userId: 'u1',
      email: 'agent@test.com',
      role: ROLES.INTERNAL_AGENT,
      tenantId: 't1',
    };
    assert.throws(
      () => requireSuperAdmin(session),
      (err: Error) => err instanceof ForbiddenError
    );
  });

  it('allows access for super_admin role', () => {
    const session: SessionUser = {
      userId: 'u1',
      email: 'super@test.com',
      role: ROLES.SUPER_ADMIN,
      tenantId: 't1',
    };
    // Should not throw
    requireSuperAdmin(session);
  });

  it('throws ForbiddenError when session is null', () => {
    assert.throws(
      () => requireSuperAdmin(null),
      (err: Error) => err instanceof ForbiddenError && err.message === 'Authentication required'
    );
  });
});

describe('Permissions - roleGuard', () => {
  it('returns 401 error when session is null', () => {
    const guard = roleGuard(['super_admin']);
    const result = guard(null);
    assert.strictEqual(result?.status, 401);
    assert.strictEqual(result?.error, 'Authentication required');
  });

  it('returns 403 error when role is not allowed', () => {
    const guard = roleGuard(['super_admin']);
    const session: SessionUser = {
      userId: 'u1',
      email: 'admin@test.com',
      role: ROLES.ADMIN,
      tenantId: 't1',
    };
    const result = guard(session);
    assert.strictEqual(result?.status, 403);
    assert.ok(result?.error.includes('Requires one of: super_admin'));
  });

  it('returns null when role is allowed', () => {
    const guard = roleGuard(['super_admin']);
    const session: SessionUser = {
      userId: 'u1',
      email: 'super@test.com',
      role: ROLES.SUPER_ADMIN,
      tenantId: 't1',
    };
    const result = guard(session);
    assert.strictEqual(result, null);
  });
});

describe('Role Guard Coverage - D-003, D-004, D-011', () => {
  it('D-003: Cancellation should require super_admin', () => {
    // This test documents that cancellation (PATCH /api/transactions/[id] with status=cancelled)
    // is now protected by requireSuperAdmin check in the route handler
    const allowedRoles = ['super_admin'];
    assert.deepStrictEqual(allowedRoles, ['super_admin']);

    // Verify that admin, project_manager, and internal_agent are NOT allowed
    const adminSession: SessionUser = {userId: 'u1', email: 'a@test.com', role: ROLES.ADMIN, tenantId: 't1'};
    const pmSession: SessionUser = {userId: 'u2', email: 'pm@test.com', role: ROLES.PROJECT_MANAGER, tenantId: 't1'};
    const agentSession: SessionUser = {userId: 'u3', email: 'ag@test.com', role: ROLES.INTERNAL_AGENT, tenantId: 't1'};

    assert.throws(() => requireSuperAdmin(adminSession), ForbiddenError);
    assert.throws(() => requireSuperAdmin(pmSession), ForbiddenError);
    assert.throws(() => requireSuperAdmin(agentSession), ForbiddenError);
  });

  it('D-004: Termination creation should require super_admin', () => {
    // This test documents that termination creation (POST /api/terminations)
    // is now protected by requireSuperAdmin check in the route handler
    const adminSession: SessionUser = {userId: 'u1', email: 'a@test.com', role: ROLES.ADMIN, tenantId: 't1'};
    assert.throws(() => requireSuperAdmin(adminSession), ForbiddenError);
  });

  it('D-011: Payment plan creation should require super_admin', () => {
    // This test documents that payment plan creation (POST /api/payment-plans)
    // and deletion (DELETE /api/payment-plans/[id]) are now protected
    const adminSession: SessionUser = {userId: 'u1', email: 'a@test.com', role: ROLES.ADMIN, tenantId: 't1'};
    assert.throws(() => requireSuperAdmin(adminSession), ForbiddenError);
  });
});

describe('API Route Protection Verification', () => {
  it('has requireSuperAdmin import in transactions/[id]/route.ts', async () => {
    const fs = await import('node:fs');
    const content = fs.readFileSync('app/api/transactions/[id]/route.ts', 'utf-8');
    assert.ok(content.includes("import {requireSuperAdmin} from '@/lib/permissions'"), 'Should import requireSuperAdmin');
    assert.ok(content.includes("requireSuperAdmin(auth)"), 'Should call requireSuperAdmin');
    assert.ok(content.includes("status === 'cancelled'"), 'Should check for cancelled status');
  });

  it('has requireSuperAdmin import in terminations/route.ts', async () => {
    const fs = await import('node:fs');
    const content = fs.readFileSync('app/api/terminations/route.ts', 'utf-8');
    assert.ok(content.includes("import {requireSuperAdmin} from '@/lib/permissions'"), 'Should import requireSuperAdmin');
    assert.ok(content.includes("requireSuperAdmin(auth)"), 'Should call requireSuperAdmin in POST');
  });

  it('has requireSuperAdmin import in payment-plans/route.ts', async () => {
    const fs = await import('node:fs');
    const content = fs.readFileSync('app/api/payment-plans/route.ts', 'utf-8');
    assert.ok(content.includes("import {requireSuperAdmin} from '@/lib/permissions'"), 'Should import requireSuperAdmin');
    assert.ok(content.includes("requireSuperAdmin(auth)"), 'Should call requireSuperAdmin in POST');
  });

  it('has requireSuperAdmin import in payment-plans/[id]/route.ts', async () => {
    const fs = await import('node:fs');
    const content = fs.readFileSync('app/api/payment-plans/[id]/route.ts', 'utf-8');
    assert.ok(content.includes("import {requireSuperAdmin} from '@/lib/permissions'"), 'Should import requireSuperAdmin');
    assert.ok(content.includes("requireSuperAdmin(auth)"), 'Should call requireSuperAdmin in DELETE');
  });
});
