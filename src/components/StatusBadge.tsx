import { Badge } from "react-bootstrap";

const VARIANTS: Record<string, string> = {
  pending: "warning",
  approved: "success",
  processed: "success",
  completed: "success",
  success: "success",
  rejected: "danger",
  denied: "danger",
  failed: "danger",
  active: "danger",
  released: "secondary",
};

export function StatusBadge({ status }: { status: string }) {
  const variant = VARIANTS[status] ?? "secondary";
  return (
    <Badge bg={variant} text={variant === "warning" ? "dark" : undefined} className="text-capitalize">
      {status}
    </Badge>
  );
}
