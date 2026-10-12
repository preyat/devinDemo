"use client";

import { Banknote } from "lucide-react";
import { DecisionForm } from "@/components/DecisionForm";
import { processRefundAction } from "./actions";

interface Props {
  refundId: string;
  /** False when the refund is closed (processed/rejected). */
  open: boolean;
  /** Role hint only; the server re-checks via canProcessRefund. */
  canProcess: boolean;
  /** Business blockers from canProcessRefund (shown, but the button stays so the server can be exercised). */
  blocked: boolean;
}

export function ProcessRefundForm({ refundId, open, canProcess, blocked }: Props) {
  return (
    <DecisionForm
      action={processRefundAction}
      fields={{ refundId }}
      options={[{ value: "process", label: "Process refund", variant: blocked ? "outline-secondary" : "success", icon: <Banknote size={16} /> }]}
      noteLabel="Processing note (required)"
      notePlaceholder="e.g. Verified with customer; refund to original card."
      readOnlyMessage={open ? undefined : "This refund is closed and read-only."}
      notice={
        <>
          {!canProcess && (
            <p className="small text-muted mb-2" data-testid="role-notice">
              Your demo role lacks <code>refund.process</code>; the server will reject this action.
            </p>
          )}
          {canProcess && blocked && (
            <p className="small text-warning-emphasis mb-2" data-testid="blocked-notice">
              Eligibility checks are failing; the server will reject processing until they pass.
            </p>
          )}
        </>
      }
    />
  );
}
