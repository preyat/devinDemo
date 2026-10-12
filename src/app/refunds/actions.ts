"use server";

import { revalidatePath } from "next/cache";
import { getDemoRole } from "@/lib/session";
import { getDb } from "@/server/db";
import type { OperationResult } from "@/server/operation";
import { bulkProcessRefunds, claimRefund, processRefund, rejectRefund } from "@/server/refunds/service";

// Thin adapters: read untrusted inputs, delegate to the service, revalidate.
export async function decideRefundAction(_prev: OperationResult | null, formData: FormData): Promise<OperationResult> {
  const db = getDb();
  const role = await getDemoRole();
  const refundId = formData.get("refundId");
  const note = formData.get("note") ?? "";
  const result =
    formData.get("decision") === "reject"
      ? rejectRefund(db, role, { refundId, note })
      : processRefund(db, role, { refundId, note, amount: formData.get("amount") });
  revalidatePath("/refunds");
  return result;
}

export async function claimRefundAction(_prev: OperationResult | null, formData: FormData): Promise<OperationResult> {
  const result = claimRefund(getDb(), await getDemoRole(), {
    refundId: formData.get("refundId"),
    decision: formData.get("decision"),
    assignee: formData.get("assignee") ?? "",
    note: formData.get("note") ?? "",
  });
  revalidatePath("/refunds");
  return result;
}

export async function bulkProcessRefundsAction(_prev: OperationResult | null, formData: FormData): Promise<OperationResult> {
  const result = bulkProcessRefunds(getDb(), await getDemoRole(), {
    refundIds: formData.getAll("refundIds"),
    note: formData.get("note") ?? "",
  });
  revalidatePath("/refunds");
  return result.ok ? { ok: true, message: result.message } : { ok: false, code: result.code, message: result.message };
}
