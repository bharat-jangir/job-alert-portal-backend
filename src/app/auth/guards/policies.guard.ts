import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  CHECK_POLICIES_KEY,
  PolicyCheck,
} from '../decorators/policies.decorator';
import { AdminRole, hasPermission } from '../enums/role.enum';

/**
 * PoliciesGuard — Attribute-Based Access Control (ABAC) guard.
 *
 * Must be used AFTER JwtAuthGuard (so req.user is populated).
 *
 * Reads @CheckPolicies() metadata from the handler and evaluates
 * whether the authenticated user's role grants the required permissions.
 *
 * If no @CheckPolicies() decorator is present, the guard allows access
 * (assumes the route only needs JWT authentication, not specific policies).
 */
@Injectable()
export class PoliciesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPolicies = this.reflector.getAllAndOverride<PolicyCheck[]>(
      CHECK_POLICIES_KEY,
      [context.getHandler(), context.getClass()],
    );

    // If no policies are specified, allow (only JWT auth is needed)
    if (!requiredPolicies || requiredPolicies.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();

    if (!user || !user.role) {
      throw new ForbiddenException('No role assigned to user');
    }

    const userRole = user.role as AdminRole;

    // Validate that the role is a known AdminRole
    if (!Object.values(AdminRole).includes(userRole)) {
      throw new ForbiddenException(`Unknown role: ${userRole}`);
    }

    // All policies must be satisfied
    const allPoliciesMet = requiredPolicies.every((policy) =>
      hasPermission(userRole, policy.action, policy.resource),
    );

    if (!allPoliciesMet) {
      throw new ForbiddenException(
        `Insufficient permissions. Required: ${requiredPolicies.map((p) => `${p.action}:${p.resource}`).join(', ')}`,
      );
    }

    return true;
  }
}
