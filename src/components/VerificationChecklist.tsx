import { ListGroup, ListGroupItem } from "react-bootstrap";
import { StatusBadge } from "./StatusBadge";

export interface ChecklistItem {
  label: string;
  status: string;
  detail: string;
}

/** Label + status badge + explanation per check. Works for any verification/control list. */
export function VerificationChecklist({ items }: { items: ChecklistItem[] }) {
  return (
    <ListGroup variant="flush">
      {items.map((item) => (
        <ListGroupItem key={item.label} className="px-0 d-flex justify-content-between align-items-start gap-3" data-testid={`check-${item.label}`}>
          <div>
            <div className="fw-semibold small">{item.label}</div>
            <div className="small text-muted">{item.detail}</div>
          </div>
          <StatusBadge status={item.status} />
        </ListGroupItem>
      ))}
    </ListGroup>
  );
}
