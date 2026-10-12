import { z } from "zod";

// DEMO ONLY: the role comes from a browser cookie the user can set freely.
// It is an untrusted claim, NOT authentication. Every mutation re-checks it
// against server-side policy in permissions.ts.
export const ROLES = ["kyc_reviewer", "payments_operator", "risk_admin"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  kyc_reviewer: "KYC Reviewer",
  payments_operator: "Payments Operator",
  risk_admin: "Risk Admin",
};

export const DEMO_ROLE_COOKIE = "demo_role";
export const DEFAULT_ROLE: Role = "kyc_reviewer";

const roleSchema = z.enum(ROLES);

/** Parse an untrusted role claim. Unknown values become null (no permissions). */
export function parseRoleClaim(value: unknown): Role | null {
  const parsed = roleSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
