"use client";

import { useActionState } from "react";
import { Button, Form } from "react-bootstrap";
import { Check, X } from "lucide-react";
import { OperationFeedback } from "@/components/OperationFeedback";
import type { KycStatus } from "@/server/lookups";
import { decideKycAction } from "./actions";

interface Props {
  customerId: string;
  status: KycStatus;
  canDecide: boolean;
}

export function KycDecisionForm({ customerId, status, canDecide }: Props) {
  const [result, formAction, pending] = useActionState(decideKycAction, null);
  return (
    <Form action={formAction}>
      <OperationFeedback result={result} />
      {status !== "pending" ? (
        <p className="small text-muted mb-0">KYC decision is final ({status}).</p>
      ) : (
        <>
          <input type="hidden" name="customerId" value={customerId} />
          <Form.Group className="mb-2" controlId="kyc-note">
            <Form.Label className="small">Decision note (required to reject)</Form.Label>
            <Form.Control as="textarea" name="note" rows={2} maxLength={500} />
          </Form.Group>
          {!canDecide && (
            <p className="small text-muted mb-2">
              Your demo role lacks <code>kyc.decide</code>; the server will reject these actions.
            </p>
          )}
          <div className="d-flex gap-2">
            <Button type="submit" name="decision" value="approve" variant="success" size="sm" disabled={pending}>
              <Check size={16} /> Approve
            </Button>
            <Button type="submit" name="decision" value="reject" variant="outline-danger" size="sm" disabled={pending}>
              <X size={16} /> Reject
            </Button>
          </div>
        </>
      )}
    </Form>
  );
}
