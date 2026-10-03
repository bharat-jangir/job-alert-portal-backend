import { SetMetadata } from '@nestjs/common';
import { Action, Resource } from '../enums/role.enum';

/**
 * Metadata key used by PoliciesGuard to read required policies from route handlers.
 */
export const CHECK_POLICIES_KEY = 'check_policies';

/**
 * Interface for a policy check: an action on a resource.
 */
export interface PolicyCheck {
  action: Action;
  resource: Resource;
}

/**
 * Decorator to specify required policies on a route handler.
 *
 * Usage:
 *   @CheckPolicies({ action: Action.CREATE, resource: Resource.JOB })
 *   @Post()
 *   create(@Body() dto: CreateJobDto) { ... }
 *
 * Multiple policies (all must pass):
 *   @CheckPolicies(
 *     { action: Action.CREATE, resource: Resource.JOB },
 *     { action: Action.PUBLISH, resource: Resource.JOB },
 *   )
 */
export const CheckPolicies = (...policies: PolicyCheck[]) =>
  SetMetadata(CHECK_POLICIES_KEY, policies);
