"use server";

import { revalidatePath } from "next/cache";
import { getDemoRole } from "@/lib/session";
import { getDb } from "@/server/db";
import type { OperationResult } from "@/server/operation";
import { processRefund } from "@/server/refunds/service";

// Thin adapter: read untrusted inputs, delegate to the service, revalidate.
export async function processRefundAction(_prev: OperationResult | null, formData: FormData): Promise<OperationResult> {
  const result = processRefund(getDb(), await getDemoRole(), {
    refundId: formData.get("refundId"),
    note: formData.get("note") ?? "",
  });
  revalidatePath("/refunds");
  return result;
}
