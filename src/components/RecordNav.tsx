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
  const linkClass = (href: string | null) => `btn btn-sm btn-outline-secondary${href ? "" : " disabled"}`;
  return (
    <nav className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3" aria-label={`${noun} navigation`}>
      <Link href={backHref} className="btn btn-sm btn-link px-0 text-decoration-none" data-testid="back-to-queue">
        ← {backLabel}
      </Link>
      <div className="d-flex align-items-center gap-2">
        <span className="small text-muted" data-testid="queue-position">
          {position ? `${noun[0].toUpperCase()}${noun.slice(1)} ${position} of ${total}` : `No longer in this queue · ${total} remaining`}
        </span>
        <Link href={prevHref ?? "#"} className={linkClass(prevHref)} aria-disabled={!prevHref} data-testid="prev-record">
          ← Previous
        </Link>
        <Link href={nextHref ?? "#"} className={linkClass(nextHref)} aria-disabled={!nextHref} data-testid="next-record">
          Next {noun} →
        </Link>
      </div>
    </nav>
  );
}
