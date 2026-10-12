import Link from "next/link";
import type { ReactNode } from "react";
import { Table } from "react-bootstrap";
import { ClickableRow } from "./ClickableRow";

export interface Column<T> {
  header: string;
  render: (row: T) => ReactNode;
  /** Applied to the header and every cell, e.g. "text-nowrap". */
  className?: string;
}

interface QueueTableProps<T> {
  rows: T[];
  columns: Column<T>[];
  getRowKey: (row: T) => string;
  /** When set, the whole row (and a first-column link) opens this href. */
  getRowHref?: (row: T) => string;
  selectedKey?: string | null;
  emptyText?: string;
}

export function QueueTable<T>({ rows, columns, getRowKey, getRowHref, selectedKey, emptyText = "Nothing to show." }: QueueTableProps<T>) {
  if (rows.length === 0) return <p className="text-muted mb-0">{emptyText}</p>;
  return (
    <Table hover size="sm" responsive className="mb-0 align-middle">
      <thead>
        <tr>
          {columns.map((c) => (
            <th key={c.header} className={c.className}>{c.header}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const key = getRowKey(row);
          const href = getRowHref?.(row);
          const className = key === selectedKey ? "table-active" : undefined;
          const cells = columns.map((c, i) => (
            <td key={c.header} className={c.className}>
              {i === 0 && href ? <Link href={href}>{c.render(row)}</Link> : c.render(row)}
            </td>
          ));
          return href ? (
            <ClickableRow key={key} href={href} className={className} data-testid={`row-${key}`}>
              {cells}
            </ClickableRow>
          ) : (
            <tr key={key} className={className} data-testid={`row-${key}`}>
              {cells}
            </tr>
          );
        })}
      </tbody>
    </Table>
  );
}
