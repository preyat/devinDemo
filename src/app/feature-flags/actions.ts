"use server";

import { revalidatePath } from "next/cache";
import { getDemoRole } from "@/lib/session";
import { getDb } from "@/server/db";
import { toggleFeatureFlag } from "@/server/feature-flags/service";
import type { OperationResult } from "@/server/operation";

// Thin adapter. Flags affect other workflows, so revalidate Refunds too.
export async function toggleFeatureFlagAction(_prev: OperationResult | null, formData: FormData): Promise<OperationResult> {
  const result = toggleFeatureFlag(getDb(), await getDemoRole(), {
    key: formData.get("key"),
    decision: formData.get("decision"),
    note: formData.get("note") ?? "",
  });
  revalidatePath("/feature-flags");
  revalidatePath("/refunds");
  return result;
}
