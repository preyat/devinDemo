"use client";

import { Hand, Undo2 } from "lucide-react";
import { Form } from "react-bootstrap";
import { DecisionForm } from "@/components/DecisionForm";
import { claimRefundAction } from "./actions";

interface Props {
  refundId: string;
  assignedTo: string | null;
}

export function ClaimRefundForm({ refundId, assignedTo }: Props) {
  return (
    <DecisionForm
      action={claimRefundAction}
      fields={{ refundId }}
      options={
        assignedTo
          ? [{ value: "release", label: `Release (claimed by ${assignedTo})`, variant: "outline-secondary", icon: <Undo2 size={16} /> }]
          : [{ value: "claim", label: "Claim refund", variant: "outline-primary", icon: <Hand size={16} /> }]
      }
      noteId="claim-note"
      noteLabel="Note (optional)"
      extraFields={
        !assignedTo && (
          <Form.Group className="mb-2" controlId="claim-assignee">
            <Form.Label className="small">Your name</Form.Label>
            <Form.Control size="sm" name="assignee" maxLength={60} placeholder="e.g. Sam R." />
          </Form.Group>
        )
      }
      notice={<p className="small text-muted mb-2">Claiming shows the queue who is working this refund; it does not lock processing.</p>}
    />
  );
}
