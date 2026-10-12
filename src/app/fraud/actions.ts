"use server";

import { revalidatePath } from "next/cache";
import { getDemoRole } from "@/lib/session";
import { getDb } from "@/server/db";
import { decideFraudAlert } from "@/server/fraud/service";
import type { OperationResult } from "@/server/operation";

// Thin adapter: read untrusted inputs, delegate to the fraud service, revalidate fraud + refunds (holds block refunds).
export async function decideFraudAlertAction(_prev: OperationResult | null, formData: FormData): Promise<OperationResult> {
  const result = decideFraudAlert(getDb(), await getDemoRole(), {
    alertId: formData.get("alertId"),
    decision: formData.get("decision"),
    note: formData.get("note") ?? "",
  });
  revalidatePath("/fraud", "layout");
  revalidatePath("/refunds", "layout");
  return result;
}
