import Link from "next/link";
import { Alert, Card, CardBody, CardHeader, Col, Row } from "react-bootstrap";
import { PageHeader } from "@/components/PageHeader";
import { QueueFilters, type FilterSelect } from "@/components/QueueFilters";
import { QueuePagination } from "@/components/QueuePagination";
import { QueueTable } from "@/components/QueueTable";
import { RecordDetail } from "@/components/RecordDetail";
import { StatusBadge } from "@/components/StatusBadge";
import { SummaryCards } from "@/components/SummaryCards";
import { VerificationChecklist } from "@/components/VerificationChecklist";
import { formatDateTime, formatMoney } from "@/lib/format";
import { getDemoRole } from "@/lib/session";
import { withParams, type SearchParams } from "@/lib/url";
import { listAuditEvents } from "@/server/audit";
import { getDb } from "@/server/db";
import {
  getRefundSummary,
  getTransaction,
  listFeatureFlags,
  listPayoutsForRefund,
  listPendingRefundIds,
  listRefundsForTransaction,
  PAGE_SIZES,
  parseRefundQuery,
  searchRefunds,
} from "@/server/lookups";
import { can } from "@/server/permissions";
import type { Role } from "@/server/roles";
import { businessBlockers, canProcessRefund } from "@/server/refunds/service";
import { BulkProcessForm } from "./BulkProcessForm";
import { ClaimRefundForm } from "./ClaimRefundForm";
import { ProcessRefundForm } from "./ProcessRefundForm";

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
  const selectedId = typeof params.refund === "string" ? params.refund : undefined;
  const db = getDb();
  const role = await getDemoRole();
  const query = parseRefundQuery(params);
  const { rows, total, page } = searchRefunds(db, query);
  const summary = getRefundSummary(db);
  const blockedPending = listPendingRefundIds(db).filter((id) => businessBlockers(canProcessRefund(db, role, id)).length > 0).length;
  const activeFlags = listFeatureFlags(db).filter((f) => f.enabled);
  const selected = selectedId ? canProcessRefund(db, role, selectedId) : null;
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
      <Row className="g-3">
        <Col xl={7}>
          <Card>
            <CardHeader as="h2" className="h6 mb-0">Refund queue</CardHeader>
            <CardBody>
              <QueueFilters searchPlaceholder="Customer, refund or transaction ID" selects={FILTERS} />
              <QueueTable
                rows={rows}
                getRowKey={(r) => r.id}
                getRowHref={(r) => withParams("/refunds", params, { refund: r.id })}
                selectedKey={selected?.refund?.id}
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
        </Col>
        <Col xl={5}>
          {!selected ? (
            <Card body className="text-muted">Select a refund to review.</Card>
          ) : !selected.refund ? (
            <Card body className="text-muted">Refund {selectedId} not found.</Card>
          ) : (
            <RefundDetail refundId={selected.refund.id} role={role} />
          )}
        </Col>
      </Row>
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

function RefundDetail({ refundId, role }: { refundId: string; role: Role | null }) {
  const db = getDb();
  const eligibility = canProcessRefund(db, role, refundId);
  const r = eligibility.refund!;
  const txn = getTransaction(db, r.transactionId)!;
  const siblings = listRefundsForTransaction(db, r.transactionId).filter((s) => s.id !== r.id);
  const payouts = listPayoutsForRefund(db, r.id);
  const blockers = businessBlockers(eligibility);

  return (
    <div className="d-grid gap-3">
      <RecordDetail
        title={
          <span className="d-flex justify-content-between align-items-center">
            <span>{r.customerName}</span>
            <span className="d-flex gap-1">
              <StatusBadge status={r.status} />
            </span>
          </span>
        }
        fields={[
          { label: "Refund ID", value: <code>{r.id}</code> },
          { label: "Amount requested", value: formatMoney(r.amountCents, r.currency) },
          ...(r.approvedAmountCents !== null
            ? [{ label: "Amount paid", value: `${formatMoney(r.approvedAmountCents, r.currency)}${r.approvedAmountCents < r.amountCents ? " (partial)" : ""}` }]
            : []),
          { label: "Assignee", value: r.assignedTo ? `${r.assignedTo} (since ${formatDateTime(r.assignedAt)})` : "Unassigned" },
          { label: "Reason", value: r.reason },
          { label: "Requested", value: formatDateTime(r.createdAt) },
          { label: "Customer", value: <Link href={`/kyc?customer=${r.customerId}&status=all`}>{r.customerId}</Link> },
          { label: "Customer KYC", value: <StatusBadge status={r.customerKycStatus} /> },
          { label: "Transaction", value: `${txn.id} · ${txn.description} · ${formatMoney(txn.amountCents, txn.currency)} (${txn.createdAt.slice(0, 10)})` },
          ...(r.status !== "pending"
            ? [
                { label: "Decided", value: `${formatDateTime(r.processedAt)} by ${r.processedByRole ?? "—"}` },
                { label: "Note", value: r.processingNote ?? "—" },
              ]
            : []),
        ]}
      />

      <Card>
        <CardHeader as="h2" className="h6 mb-0">
          Eligibility <span className="small text-muted fw-normal">(canProcessRefund)</span>
        </CardHeader>
        <CardBody className="py-1" data-testid="eligibility">
          <VerificationChecklist
            items={eligibility.checks.map((c) => ({
              label: c.label,
              status: c.passed ? "passed" : "failed",
              detail: c.message ?? c.code,
            }))}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader as="h2" className="h6 mb-0">Process or reject</CardHeader>
        <CardBody>
          <ProcessRefundForm
            key={r.id}
            refundId={r.id}
            requestedDollars={(r.amountCents / 100).toFixed(2)}
            open={r.status === "pending"}
            canProcess={can(role, "refund.process")}
            blocked={blockers.length > 0}
          />
        </CardBody>
      </Card>

      {r.status === "pending" && (
        <Card>
          <CardHeader as="h2" className="h6 mb-0">Claim</CardHeader>
          <CardBody>
            <ClaimRefundForm key={r.id} refundId={r.id} assignedTo={r.assignedTo} />
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader as="h2" className="h6 mb-0">Payout</CardHeader>
        <CardBody>
          <QueueTable
            rows={payouts}
            getRowKey={(p) => String(p.id)}
            emptyText="No payout issued."
            columns={[
              { header: "When", render: (p) => formatDateTime(p.createdAt), className: "text-nowrap" },
              { header: "Amount", render: (p) => formatMoney(p.amountCents, p.currency) },
              { header: "By", render: (p) => p.createdByRole },
            ]}
          />
        </CardBody>
      </Card>

      {siblings.length > 0 && (
        <Card>
          <CardHeader as="h2" className="h6 mb-0">Other refunds on {txn.id}</CardHeader>
          <CardBody>
            <QueueTable
              rows={siblings}
              getRowKey={(s) => s.id}
              getRowHref={(s) => `/refunds?status=all&refund=${s.id}`}
              columns={[
                { header: "Refund", render: (s) => <code>{s.id}</code> },
                { header: "Amount", render: (s) => formatMoney(s.amountCents, s.currency) },
                { header: "Status", render: (s) => <StatusBadge status={s.status} /> },
                { header: "Requested", render: (s) => s.createdAt.slice(0, 10) },
              ]}
            />
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader as="h2" className="h6 mb-0">Audit trail</CardHeader>
        <CardBody>
          <QueueTable
            rows={listAuditEvents(db, { entityType: "refund", entityId: r.id, limit: 20 })}
            getRowKey={(e) => String(e.id)}
            emptyText="No audit events yet."
            columns={[
              { header: "When", render: (e) => formatDateTime(e.occurredAt), className: "text-nowrap" },
              { header: "Role", render: (e) => e.actorRole ?? "—" },
              { header: "Outcome", render: (e) => <StatusBadge status={e.outcome} /> },
              { header: "Message", render: (e) => e.message },
            ]}
          />
        </CardBody>
      </Card>
    </div>
  );
}
