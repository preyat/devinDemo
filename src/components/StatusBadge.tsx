import { Badge } from "react-bootstrap";
import { statusLabel } from "@/lib/labels";

const VARIANTS: Record<string, string> = {
  pending: "warning",
  info_requested: "info",
  approved: "success",
  processed: "success",
  completed: "success",
  success: "success",
  passed: "success",
  eligible: "success",
  on: "warning",
  off: "secondary",
  blocked: "danger",
  clear: "success",
  low: "success",
  medium: "warning",
  missing: "warning",
  review_required: "warning",
  high: "danger",
  rejected: "danger",
  denied: "danger",
  failed: "danger",
  active: "danger",
  open: "primary",
  escalated: "danger",
  dismissed: "secondary",
  released: "secondary",
};

// Categorical (non-status) values render as subtle badges.
const SUBTLE: Record<string, string> = {
  onboarding: "primary",
  periodic_refresh: "secondary",
  triggered: "warning",
  simulated: "info",
};

export { statusLabel };

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const subtle = SUBTLE[status];
  if (subtle) {
    return (
      <Badge bg={`${subtle}-subtle`} text={`${subtle}-emphasis`} className="border">
        {label ?? statusLabel(status)}
      </Badge>
    );
  }
  const variant = VARIANTS[status] ?? "secondary";
  return (
    <Badge bg={variant} text={variant === "warning" || variant === "info" ? "dark" : undefined}>
      {label ?? statusLabel(status)}
    </Badge>
  );
}
