/**
 * Canonical role enum for the admin system.
 * Hierarchy: SUPER_ADMIN > PUBLISHER > EDITOR > VIEWER
 *
 * This is the SINGLE SOURCE OF TRUTH for roles.
 * Do NOT copy-paste these values elsewhere.
 */
export enum AdminRole {
  SUPER_ADMIN = 'super-admin',
  PUBLISHER = 'publisher',
  EDITOR = 'editor',
  VIEWER = 'viewer',
}

/**
 * CRUD actions for policy checks.
 */
export enum Action {
  CREATE = 'create',
  READ = 'read',
  UPDATE = 'update',
  DELETE = 'delete',
  PUBLISH = 'publish',
  MANAGE = 'manage', // super-admin wildcard
}

/**
 * Resources that policies can be applied to.
 */
export enum Resource {
  JOB = 'Job',
  ORGANIZATION = 'Organization',
  REDIRECT_LINK = 'RedirectLink',
  JOB_CATEGORY = 'JobCategory',
  FAQ = 'Faq',
  CONTACT = 'Contact',
  USER = 'User',
}

/**
 * Role hierarchy — higher roles inherit all permissions of lower roles.
 */
export const ROLE_HIERARCHY: Record<AdminRole, AdminRole[]> = {
  [AdminRole.SUPER_ADMIN]: [AdminRole.PUBLISHER, AdminRole.EDITOR, AdminRole.VIEWER],
  [AdminRole.PUBLISHER]: [AdminRole.EDITOR, AdminRole.VIEWER],
  [AdminRole.EDITOR]: [AdminRole.VIEWER],
  [AdminRole.VIEWER]: [],
};

/**
 * Policy definition: which roles can perform which actions on which resources.
 *
 * If a role has MANAGE action, it can do everything on that resource.
 * Role hierarchy is applied — e.g., SUPER_ADMIN inherits all PUBLISHER permissions.
 */
export interface PolicyRule {
  action: Action;
  resource: Resource;
}

export const ROLE_POLICIES: Record<AdminRole, PolicyRule[]> = {
  [AdminRole.SUPER_ADMIN]: [
    // Wildcard: manage everything
    { action: Action.MANAGE, resource: Resource.JOB },
    { action: Action.MANAGE, resource: Resource.ORGANIZATION },
    { action: Action.MANAGE, resource: Resource.REDIRECT_LINK },
    { action: Action.MANAGE, resource: Resource.JOB_CATEGORY },
    { action: Action.MANAGE, resource: Resource.FAQ },
    { action: Action.MANAGE, resource: Resource.CONTACT },
    { action: Action.MANAGE, resource: Resource.USER },
  ],
  [AdminRole.PUBLISHER]: [
    { action: Action.CREATE, resource: Resource.JOB },
    { action: Action.READ, resource: Resource.JOB },
    { action: Action.UPDATE, resource: Resource.JOB },
    { action: Action.DELETE, resource: Resource.JOB },
    { action: Action.PUBLISH, resource: Resource.JOB },
    { action: Action.CREATE, resource: Resource.ORGANIZATION },
    { action: Action.READ, resource: Resource.ORGANIZATION },
    { action: Action.UPDATE, resource: Resource.ORGANIZATION },
    { action: Action.DELETE, resource: Resource.ORGANIZATION },
    { action: Action.CREATE, resource: Resource.REDIRECT_LINK },
    { action: Action.READ, resource: Resource.REDIRECT_LINK },
    { action: Action.UPDATE, resource: Resource.REDIRECT_LINK },
    { action: Action.DELETE, resource: Resource.REDIRECT_LINK },
    { action: Action.CREATE, resource: Resource.JOB_CATEGORY },
    { action: Action.READ, resource: Resource.JOB_CATEGORY },
    { action: Action.UPDATE, resource: Resource.JOB_CATEGORY },
    { action: Action.DELETE, resource: Resource.JOB_CATEGORY },
    { action: Action.CREATE, resource: Resource.FAQ },
    { action: Action.READ, resource: Resource.FAQ },
    { action: Action.UPDATE, resource: Resource.FAQ },
    { action: Action.DELETE, resource: Resource.FAQ },
    { action: Action.READ, resource: Resource.CONTACT },
    { action: Action.DELETE, resource: Resource.CONTACT },
  ],
  [AdminRole.EDITOR]: [
    { action: Action.CREATE, resource: Resource.JOB },
    { action: Action.READ, resource: Resource.JOB },
    { action: Action.UPDATE, resource: Resource.JOB },
    // Editors CANNOT delete or publish
    { action: Action.READ, resource: Resource.ORGANIZATION },
    { action: Action.READ, resource: Resource.REDIRECT_LINK },
    { action: Action.CREATE, resource: Resource.REDIRECT_LINK },
    { action: Action.UPDATE, resource: Resource.REDIRECT_LINK },
    { action: Action.READ, resource: Resource.JOB_CATEGORY },
    { action: Action.CREATE, resource: Resource.FAQ },
    { action: Action.READ, resource: Resource.FAQ },
    { action: Action.UPDATE, resource: Resource.FAQ },
    { action: Action.READ, resource: Resource.CONTACT },
  ],
  [AdminRole.VIEWER]: [
    { action: Action.READ, resource: Resource.JOB },
    { action: Action.READ, resource: Resource.ORGANIZATION },
    { action: Action.READ, resource: Resource.REDIRECT_LINK },
    { action: Action.READ, resource: Resource.JOB_CATEGORY },
    { action: Action.READ, resource: Resource.FAQ },
    { action: Action.READ, resource: Resource.CONTACT },
  ],
};

/**
 * Check if a role has permission to perform an action on a resource.
 * Considers role hierarchy (inherited permissions).
 */
export function hasPermission(
  role: AdminRole,
  action: Action,
  resource: Resource,
): boolean {
  // Check own policies
  const policies = ROLE_POLICIES[role] || [];
  const hasOwn = policies.some(
    (p) =>
      (p.action === action || p.action === Action.MANAGE) &&
      p.resource === resource,
  );
  if (hasOwn) return true;

  // Check inherited roles
  const inherited = ROLE_HIERARCHY[role] || [];
  return inherited.some((inheritedRole) =>
    hasPermission(inheritedRole, action, resource),
  );
}
