import {Role} from './roles';

export class ForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ForbiddenError';
  }
}

export interface SessionUser {
  userId: string;
  email?: string;
  role: Role | string;
  tenantId: string;
}

/**
 * Creates a role guard function that checks if the session user has one of the required roles.
 * Throws ForbiddenError if the user lacks the required role.
 * 
 * Usage:
 *   const guard = requireRole(['super_admin']);
 *   guard(session); // throws if not super_admin
 * 
 * Or in API routes:
 *   const guard = requireRole(['super_admin']);
 *   try {
 *     guard(auth);
 *   } catch (e) {
 *     if (e instanceof ForbiddenError) {
 *       return NextResponse.json({error: e.message}, {status: 403});
 *     }
 *     throw e;
 *   }
 */
export function requireRole(allowedRoles: Role[]) {
  return (session: SessionUser | null): void => {
    if (!session) {
      throw new ForbiddenError('Authentication required');
    }
    if (!allowedRoles.includes(session.role as Role)) {
      throw new ForbiddenError(`Requires one of: ${allowedRoles.join(', ')}`);
    }
  };
}

/**
 * Convenience guard for Super Admin only actions.
 * Covers: cancellation, termination, payment plan management.
 */
export function requireSuperAdmin(session: SessionUser | null): void {
  return requireRole(['super_admin'])(session);
}

/**
 * Higher-order helper for API routes that returns a NextResponse
 * instead of throwing. Use when you want concise inline guards.
 * 
 * Usage:
 *   const forbid = roleGuard(['super_admin']);
 *   const forbidden = forbid(auth);
 *   if (forbidden) return forbidden;
 */
export function roleGuard(allowedRoles: Role[]) {
  return (session: SessionUser | null): {error: string; status: number} | null => {
    if (!session) {
      return {error: 'Authentication required', status: 401};
    }
    if (!allowedRoles.includes(session.role as Role)) {
      return {error: `Requires one of: ${allowedRoles.join(', ')}`, status: 403};
    }
    return null;
  };
}
