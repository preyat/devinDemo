import { cookies } from "next/headers";
import { DEFAULT_ROLE, DEMO_ROLE_COOKIE, parseRoleClaim, type Role } from "@/server/roles";

/** Read the DEMO role claim from the cookie. Untrusted: always enforce with permissions.ts. */
export async function getDemoRole(): Promise<Role | null> {
  const store = await cookies();
  const value = store.get(DEMO_ROLE_COOKIE)?.value;
  return value === undefined ? DEFAULT_ROLE : parseRoleClaim(value);
}
