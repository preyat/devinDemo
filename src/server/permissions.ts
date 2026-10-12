import { OperationError } from "./errors";
import { ROLE_LABELS, type Role } from "./roles";

// Server-side policy: which roles may perform each permission.
// Add a permission here when adding a new mutating workflow.
export const PERMISSIONS = {
  "kyc.decide": ["kyc_reviewer"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: Role | null, permission: Permission): boolean {
  return role !== null && (PERMISSIONS[permission] as readonly Role[]).includes(role);
}

export function assertCan(role: Role | null, permission: Permission): void {
  if (!can(role, permission)) {
    const who = role ? ROLE_LABELS[role] : "Unknown role";
    throw new OperationError("forbidden", `${who} is not allowed to perform ${permission}.`);
  }
}
