"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, ShieldOff, ShieldX } from "lucide-react";
import { DecisionForm } from "@/components/DecisionForm";
import { decideFraudAlertAction } from "./actions";

interface Props {
  alertId: string;
  /** False when the alert is already dismissed/escalated (read-only). */
  open: boolean;
  /** Role hint only; the server re-checks fraud_alert.dismiss / fraud_alert.escalate. */
  canDecide: boolean;
  nextHref?: string | null;
}

export function FraudDecisionForm({ alertId, open, canDecide, nextHref }: Props) {
  const [nextAfterDecision] = useState(nextHref);
  return (
    <DecisionForm
      action={decideFraudAlertAction}
      successAction={
        nextAfterDecision && (
          <Link href={nextAfterDecision} className="btn btn-primary btn-sm" data-testid="next-case-after-decision">
            Next alert <ArrowRight size={16} />
          </Link>
        )
      }
      fields={{ alertId }}
      options={[
        { value: "escalate", label: "Escalate & Hold", variant: "danger", icon: <ShieldX size={16} /> },
        { value: "dismiss", label: "Dismiss alert", variant: "outline-secondary", icon: <ShieldOff size={16} /> },
      ]}
      noteLabel="Investigation reason (required)"
      notePlaceholder="e.g. Customer confirmed they did not make this transfer."
      readOnlyMessage={open ? undefined : "This alert has been decided and is read-only."}
      notice={
        <>
          {!canDecide && (
            <p className="small text-muted mb-2" data-testid="role-notice">
              Only Risk Admins may make fraud decisions; the server will reject this action for your demo role.
            </p>
          )}
          <p className="small text-muted mb-2">
            <strong>Escalate &amp; Hold</strong> places an account risk hold that pauses refund processing for this customer.{" "}
            <strong>Dismiss</strong> closes the alert with no hold.
          </p>
        </>
      }
    />
  );
}
