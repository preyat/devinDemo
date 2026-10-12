// Human-readable status labels. Plain module: usable by services, server and client components.
const LABELS: Record<string, string> = {
  periodic_refresh: "Periodic refresh",
  open_review: "Review opened",
  info_requested: "Awaiting info",
  review_required: "Review required",
  request_info: "Request info",
};

export function statusLabel(status: string): string {
  return LABELS[status] ?? status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, " ");
}
