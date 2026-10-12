import Link from "next/link";

interface RecordNavProps {
  backHref: string;
  backLabel: string;
  prevHref: string | null;
  nextHref: string | null;
  /** 1-based position in the filtered queue; null when the record no longer matches the filters. */
  position: number | null;
  total: number;
  noun: string;
}

/** Case-page navigation: back to the (filtered) queue plus previous/next record in that queue. */
export function RecordNav({ backHref, backLabel, prevHref, nextHref, position, total, noun }: RecordNavProps) {
  const navButton = (href: string | null, label: string, testId: string) =>
    href ? (
      <Link href={href} className="btn btn-sm btn-outline-secondary" data-testid={testId}>
        {label}
      </Link>
    ) : (
      <span className="btn btn-sm btn-outline-secondary disabled" aria-disabled="true" data-testid={testId}>
        {label}
      </span>
    );
  return (
    <nav className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3" aria-label={`${noun} navigation`}>
      <Link href={backHref} className="btn btn-sm btn-link px-0 text-decoration-none" data-testid="back-to-queue">
        ← {backLabel}
      </Link>
      <div className="d-flex align-items-center gap-2">
        <span className="small text-muted" data-testid="queue-position">
          {position ? `${noun[0].toUpperCase()}${noun.slice(1)} ${position} of ${total}` : `No longer in this queue · ${total} remaining`}
        </span>
        {navButton(prevHref, "← Previous", "prev-record")}
        {navButton(nextHref, `Next ${noun} →`, "next-record")}
      </div>
    </nav>
  );
}
