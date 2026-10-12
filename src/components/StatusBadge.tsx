import { Badge } from "react-bootstrap";

const VARIANTS: Record<string, string> = {
  pending: "warning",
  info_requested: "info",
  approved: "success",
  processed: "success",
  completed: "success",
  success: "success",
  passed: "success",
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
  released: "secondary",
};

const LABELS: Record<string, string> = {
  info_requested: "Awaiting info",
  review_required: "Review required",
  request_info: "Request info",
};

export function statusLabel(status: string): string {
  return LABELS[status] ?? status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, " ");
}

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const variant = VARIANTS[status] ?? "secondary";
  return (
    <Badge bg={variant} text={variant === "warning" || variant === "info" ? "dark" : undefined}>
      {label ?? statusLabel(status)}
    </Badge>
  );
}
