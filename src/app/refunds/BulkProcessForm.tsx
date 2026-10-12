"use client";

import { Layers } from "lucide-react";
import { Form } from "react-bootstrap";
import { DecisionForm } from "@/components/DecisionForm";
import { bulkProcessRefundsAction } from "./actions";

interface Props {
  /** Pending refunds on the current page that pass canProcessRefund's business rules. */
  refunds: { id: string; label: string }[];
  /** Role hint only; the server re-checks refund.process and every refund's rules. */
  canProcess: boolean;
}

export function BulkProcessForm({ refunds, canProcess }: Props) {
  return (
    <DecisionForm
      action={bulkProcessRefundsAction}
      fields={{}}
      options={[{ value: "bulk", label: "Process selected", variant: "success", icon: <Layers size={16} /> }]}
      noteId="bulk-note"
      noteLabel="Batch note (required, applied to each refund)"
      notePlaceholder="e.g. Daily refund run, all verified."
      extraFields={
        <div className="mb-2" data-testid="bulk-list">
          {refunds.length === 0 && <p className="small text-muted mb-0">No eligible pending refunds on this page.</p>}
          {refunds.map((r) => (
            <Form.Check key={r.id} type="checkbox" id={`bulk-${r.id}`} name="refundIds" value={r.id} defaultChecked label={r.label} className="small" />
          ))}
        </div>
      }
      notice={
        !canProcess && (
          <p className="small text-muted mb-2" data-testid="bulk-role-notice">
            Your demo role lacks <code>refund.process</code>; the server will reject this batch.
          </p>
        )
      }
    />
  );
}
