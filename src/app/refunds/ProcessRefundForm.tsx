"use client";

import { Banknote, Ban } from "lucide-react";
import { Form, InputGroup } from "react-bootstrap";
import { DecisionForm } from "@/components/DecisionForm";
import { decideRefundAction } from "./actions";

interface Props {
  refundId: string;
  /** Requested amount in dollars, shown as the partial-refund placeholder. */
  requestedDollars: string;
  /** False when the refund is closed (processed/rejected). */
  open: boolean;
  /** Role hint only; the server re-checks via canProcessRefund / canRejectRefund. */
  canProcess: boolean;
  /** Business blockers from canProcessRefund (shown, but the button stays so the server can be exercised). */
  blocked: boolean;
}

export function ProcessRefundForm({ refundId, requestedDollars, open, canProcess, blocked }: Props) {
  return (
    <DecisionForm
      action={decideRefundAction}
      fields={{ refundId }}
      options={[
        { value: "process", label: "Process refund", variant: blocked ? "outline-secondary" : "success", icon: <Banknote size={16} /> },
        { value: "reject", label: "Reject refund", variant: "outline-danger", icon: <Ban size={16} /> },
      ]}
      noteLabel="Decision note (required)"
      notePlaceholder="e.g. Verified with customer; refund to original card."
      readOnlyMessage={open ? undefined : "This refund is closed and read-only."}
      extraFields={
        <Form.Group className="mb-2" controlId="refund-amount">
          <Form.Label className="small">Refund amount (leave blank for the full amount; lower = partial refund)</Form.Label>
          <InputGroup size="sm">
            <InputGroup.Text>$</InputGroup.Text>
            <Form.Control name="amount" inputMode="decimal" placeholder={requestedDollars} />
          </InputGroup>
        </Form.Group>
      }
      notice={
        <>
          {!canProcess && (
            <p className="small text-muted mb-2" data-testid="role-notice">
              Your demo role lacks <code>refund.process</code>; the server will reject this action.
            </p>
          )}
          {canProcess && blocked && (
            <p className="small text-warning-emphasis mb-2" data-testid="blocked-notice">
              Eligibility checks are failing; the server will reject processing until they pass. Rejecting is still allowed.
            </p>
          )}
        </>
      }
    />
  );
}
