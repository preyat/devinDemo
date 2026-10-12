import Link from "next/link";
import { redirect } from "next/navigation";
import { Alert, Card, CardBody, CardHeader } from "react-bootstrap";
import { PageHeader } from "@/components/PageHeader";
import { QueueFilters, type FilterSelect } from "@/components/QueueFilters";
import { QueuePagination } from "@/components/QueuePagination";
import { QueueTable } from "@/components/QueueTable";
import { StatusBadge } from "@/components/StatusBadge";
import { SummaryCards } from "@/components/SummaryCards";
import { formatMoney } from "@/lib/format";
import { getDemoRole } from "@/lib/session";
import { withParams, type SearchParams } from "@/lib/url";
import { getDb } from "@/server/db";
import {
  getRefundSummary,
  listFeatureFlags,
  listPendingRefundIds,
  PAGE_SIZES,
  parseRefundQuery,
  searchRefunds,
} from "@/server/lookups";
import type { Role } from "@/server/roles";
import { can } from "@/server/permissions";
import { businessBlockers, canProcessRefund } from "@/server/refunds/service";
import { BulkProcessForm } from "./BulkProcessForm";

export const dynamic = "force-dynamic";

const FILTERS: FilterSelect[] = [
  {
    name: "status",
    label: "Refund status",
    options: [
      { value: "pending", label: "Pending" },
      { value: "processed", label: "Processed" },
      { value: "rejected", label: "Rejected" },
      { value: "all", label: "All statuses" },
    ],
  },
  {
    name: "kyc",
    label: "Customer KYC",
    options: [
      { value: "all", label: "Any KYC status" },
      { value: "approved", label: "KYC approved" },
      { value: "not_approved", label: "KYC not approved" },
    ],
  },
  {
    name: "assigned",
    label: "Assignment",
    options: [
      { value: "all", label: "Any assignment" },
      { value: "unassigned", label: "Unassigned" },
      { value: "claimed", label: "Claimed" },
    ],
  },
  {
    name: "sort",
    label: "Sort",
    options: [
      { value: "requested_desc", label: "Newest requests" },
      { value: "requested_asc", label: "Oldest requests" },
      { value: "amount_desc", label: "Largest amount" },
    ],
  },
  { name: "pageSize", label: "Page size", options: PAGE_SIZES.map((n) => ({ value: String(n), label: `${n} per page` })) },
];

export default async function RefundsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  // Legacy deep links (/refunds?refund=<id>) now live on the refund page.
  if (typeof params.refund === "string") redirect(withParams(`/refunds/${params.refund}`, params, { refund: null }));
  const db = getDb();
  const role = await getDemoRole();
  const query = parseRefundQuery(params);
  const { rows, total, page } = searchRefunds(db, query);
  const summary = getRefundSummary(db);
  const blockedPending = listPendingRefundIds(db).filter((id) => businessBlockers(canProcessRefund(db, role, id)).length > 0).length;
  const activeFlags = listFeatureFlags(db).filter((f) => f.enabled);
  const bulkEligible = rows
    .filter((r) => r.status === "pending" && businessBlockers(canProcessRefund(db, role, r.id)).length === 0)
    .map((r) => ({ id: r.id, label: `${r.customerName} · ${formatMoney(r.amountCents, r.currency)} · ${r.id}` }));

  return (
    <>
      <PageHeader title="Refunds" description="Process pending refunds. Eligibility is decided server-side by canProcessRefund; only Payments Operators may process." />
      <SummaryCards
        items={[
          { label: "Pending refunds", value: summary.pending, variant: "warning" },
          { label: "Pending amount", value: formatMoney(summary.pendingCents) },
          { label: "Blocked by rules", value: blockedPending, variant: "danger" },
          { label: "Processed", value: summary.processed, variant: "success" },
        ]}
      />
      <Alert variant={activeFlags.length ? "warning" : "secondary"} className="py-2 small" data-testid="active-flags">
        <strong>Active refund flags:</strong>{" "}
        {activeFlags.length
          ? activeFlags.map((f) => <code key={f.key} className="me-2" data-testid={`active-flag-${f.key}`}>{f.key}</code>)
          : "none"}{" "}
        · <Link href="/feature-flags">Manage in Feature Flags</Link>
      </Alert>
      <Card>
        <CardHeader as="h2" className="h6 mb-0">Refund queue</CardHeader>
        <CardBody>
          <QueueFilters searchPlaceholder="Customer, refund or transaction ID" selects={FILTERS} />
          <QueueTable
            rows={rows}
            getRowKey={(r) => r.id}
            getRowHref={(r) => withParams(`/refunds/${r.id}`, params)}
            emptyText="No refunds match these filters."
            columns={[
              { header: "Customer", render: (r) => r.customerName, className: "text-nowrap" },
              { header: "Amount", render: (r) => formatMoney(r.amountCents, r.currency), className: "text-nowrap" },
              { header: "Status", render: (r) => <StatusBadge status={r.status} /> },
              { header: "KYC", render: (r) => <StatusBadge status={r.customerKycStatus} /> },
              { header: "Eligibility", render: (r) => <EligibilityBadge refundId={r.id} status={r.status} role={role} /> },
              { header: "Assignee", render: (r) => r.assignedTo ?? <span className="text-muted small">—</span>, className: "text-nowrap" },
              { header: "Requested", render: (r) => r.createdAt.slice(0, 10), className: "text-nowrap" },
            ]}
          />
          <QueuePagination page={page} pageSize={query.pageSize} total={total} />
        </CardBody>
      </Card>
      <Card className="mt-3">
        <CardHeader as="h2" className="h6 mb-0">
          Bulk process <span className="small text-muted fw-normal">(eligible pending refunds on this page)</span>
        </CardHeader>
        <CardBody>
          <BulkProcessForm refunds={bulkEligible} canProcess={can(role, "refund.process")} />
        </CardBody>
      </Card>
    </>
  );
}

function EligibilityBadge({ refundId, status, role }: { refundId: string; status: string; role: Role | null }) {
  if (status !== "pending") return <span className="text-muted small">—</span>;
  const blockers = businessBlockers(canProcessRefund(getDb(), role, refundId));
  return blockers.length ? (
    <span data-testid={`blocked-${refundId}`}>
      {blockers.map((code) => <StatusBadge key={code} status="blocked" label={code} />)}
    </span>
  ) : (
    <StatusBadge status="eligible" label="Eligible" />
  );
}

