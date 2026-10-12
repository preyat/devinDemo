"use client";

import Link from "next/link";
import { Alert } from "react-bootstrap";
import { ArrowRight, Check, MessageSquareMore, X } from "lucide-react";
import { DecisionForm, type DecisionOption } from "@/components/DecisionForm";
import type { KycDecision } from "@/server/kyc/service";
import { decideKycAction } from "./actions";

const OPTIONS: Record<KycDecision, DecisionOption> = {
  approve: { value: "approve", label: "Approve", variant: "success", icon: <Check size={16} /> },
  request_info: { value: "request_info", label: "Request more information", variant: "outline-primary", icon: <MessageSquareMore size={16} /> },
  reject: { value: "reject", label: "Reject", variant: "outline-danger", icon: <X size={16} /> },
};

interface Props {
  customerId: string;
  /** From allowedKycDecisions(status) — empty means the case is final. */
  allowed: KycDecision[];
  /** From formatApprovalBlockers(getApprovalBlockers(checks)), or null when approval is allowed. */
  approvalBlockedReason: string | null;
  canDecide: boolean;
  finalStatusLabel: string;
  /** Next case in the reviewer's filtered queue, offered after a successful decision. */
  nextHref?: string | null;
}

export function KycDecisionForm({ customerId, allowed, approvalBlockedReason, canDecide, finalStatusLabel, nextHref }: Props) {
  return (
    <DecisionForm
      action={decideKycAction}
      successAction={
        nextHref && (
          <Link href={nextHref} className="btn btn-primary btn-sm" data-testid="next-case-after-decision">
            Next case <ArrowRight size={16} />
          </Link>
        )
      }
      fields={{ customerId }}
      options={allowed.map((d) => OPTIONS[d])}
      noteLabel="Decision note (required). For information requests, state what the customer must provide."
      notePlaceholder="e.g. Passport and utility bill verified / Provide a bank statement dated within 3 months"
      readOnlyMessage={allowed.length === 0 ? `Case is closed (${finalStatusLabel}) and read-only.` : undefined}
      notice={
        <>
          {approvalBlockedReason && allowed.includes("approve") && (
            <Alert variant="warning" className="py-2 small" data-testid="approval-blocked">
              {approvalBlockedReason}
            </Alert>
          )}
          {!canDecide && (
            <p className="small text-muted mb-2">
              Your demo role lacks <code>kyc.decide</code>; the server will reject these actions.
            </p>
          )}
        </>
      }
    />
  );
}
