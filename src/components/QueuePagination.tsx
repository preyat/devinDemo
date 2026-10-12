"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Pagination } from "react-bootstrap";

/** Prev/next + page numbers that preserve the other URL params. */
export function QueuePagination({ page, pageSize, total }: { page: number; pageSize: number; total: number }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const href = (p: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(p));
    return `${pathname}?${params.toString()}`;
  };
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  return (
    <div className="d-flex justify-content-between align-items-center mt-2 small">
      <span className="text-muted" data-testid="queue-range">
        Showing {start}–{end} of {total}
      </span>
      {pages > 1 && (
        <Pagination size="sm" className="mb-0">
          <Pagination.Prev as={Link} href={href(page - 1)} disabled={page <= 1} />
          {Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
            <Pagination.Item key={p} as={Link} href={href(p)} active={p === page}>
              {p}
            </Pagination.Item>
          ))}
          <Pagination.Next as={Link} href={href(page + 1)} disabled={page >= pages} />
        </Pagination>
      )}
    </div>
  );
}
