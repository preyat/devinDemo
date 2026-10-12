"use server";

import { revalidatePath } from "next/cache";
import { getDemoRole } from "@/lib/session";
import { getDb } from "@/server/db";
import { decideKyc } from "@/server/kyc/service";
import type { OperationResult } from "@/server/operation";

// Thin adapter: read untrusted inputs, delegate to the service, revalidate.
export async function decideKycAction(_prev: OperationResult | null, formData: FormData): Promise<OperationResult> {
  const role = await getDemoRole();
  const result = decideKyc(getDb(), role, {
    customerId: formData.get("customerId"),
    decision: formData.get("decision"),
    note: formData.get("note") ?? "",
  });
  revalidatePath("/kyc");
  return result;
}
