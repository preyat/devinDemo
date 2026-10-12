"use server";

import { cookies } from "next/headers";
import { DEMO_ROLE_COOKIE, parseRoleClaim } from "@/server/roles";

export async function setDemoRole(value: string): Promise<void> {
  const role = parseRoleClaim(value);
  if (!role) return;
  (await cookies()).set(DEMO_ROLE_COOKIE, role, { path: "/", sameSite: "lax" });
}
