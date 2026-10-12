import { Alert, Card, CardBody, CardHeader, Col, Row } from "react-bootstrap";
import { PageHeader } from "@/components/PageHeader";
import { QueueFilters, type FilterSelect } from "@/components/QueueFilters";
import { QueuePagination } from "@/components/QueuePagination";
import { QueueTable } from "@/components/QueueTable";
import { RecordFields } from "@/components/RecordDetail";
import { RecordTabs } from "@/components/RecordTabs";
import { StatusBadge, statusLabel } from "@/components/StatusBadge";
import { SummaryCards } from "@/components/SummaryCards";
import { VerificationChecklist } from "@/components/VerificationChecklist";
import { formatDateTime, formatMoney } from "@/lib/format";
import { getDemoRole } from "@/lib/session";
import { withParams, type SearchParams } from "@/lib/url";
import { listAuditEvents } from "@/server/audit";
import { getDb } from "@/server/db";
import { allowedKycDecisions, formatApprovalBlockers, getApprovalBlockers } from "@/server/kyc/service";
import {
  getCustomer,
  getKycSummary,
  listKycDecisions,
  listRefundsForCustomer,
  listTransactionsForCustomer,
  listVerificationChecks,
  PAGE_SIZES,
  parseCustomerQuery,
  searchCustomers,
  type CheckType,
} from "@/server/lookups";
import { can } from "@/server/permissions";
import { KycDecisionForm } from "./KycDecisionForm";

export const dynamic = "force-dynamic";

const CHECK_LABELS: Record<CheckType, string> = {
  identity: "Identity verification",
  address: "Address verification",
  sanctions: "Sanctions screening",
  pep: "PEP screening",
};

const FILTERS: FilterSelect[] = [
  {
    name: "status",
    label: "KYC status",
    options: [
      { value: "all", label: "All statuses" },
      { value: "open", label: "Open (pending + awaiting info)" },
      { value: "pending", label: "Pending review" },
      { value: "info_requested", label: "Awaiting info" },
      { value: "approved", label: "Approved" },
      { value: "rejected", label: "Rejected" },
    ],
  },
  {
    name: "risk",
    label: "Risk",
    options: [
      { value: "all", label: "All risk levels" },
      { value: "high", label: "High" },
      { value: "medium", label: "Medium" },
      { value: "low", label: "Low" },
    ],
  },
  {
    name: "review",
    label: "Review type",
    options: [
      { value: "all", label: "All review types" },
      { value: "onboarding", label: "Onboarding" },
      { value: "periodic_refresh", label: "Periodic refresh" },
      { value: "triggered", label: "Triggered" },
    ],
  },
  {
    name: "sort",
    label: "Sort",
    options: [
      { value: "opened_desc", label: "Newest cases" },
      { value: "opened_asc", label: "Oldest cases" },
      { value: "updated_desc", label: "Recently updated" },
    ],
  },
  { name: "pageSize", label: "Page size", options: PAGE_SIZES.map((n) => ({ value: String(n), label: `${n} per page` })) },
];

export default async function KycPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const selectedId = typeof params.customer === "string" ? params.customer : undefined;
  const db = getDb();
  const role = await getDemoRole();
  const query = parseCustomerQuery(params);
  const { rows, total, page } = searchCustomers(db, query);
  const summary = getKycSummary(db);
  const selected = selectedId ? getCustomer(db, selectedId) : null;

  return (
    <>
      <PageHeader title="KYC Review" description="Review synthetic customer identity checks. Only KYC Reviewers may decide." />
      <SummaryCards
        items={[
          { label: "Pending review", value: summary.pending, variant: "warning" },
          { label: "Awaiting information", value: summary.infoRequested, variant: "info" },
          { label: "High risk open cases", value: summary.highRiskOpen, variant: "danger" },
          { label: "Total customers", value: summary.total },
        ]}
      />
      <Card className="mb-4">
        <CardHeader as="h2" className="h6 mb-0">Customer queue</CardHeader>
        <CardBody>
          <QueueFilters searchPlaceholder="Name or customer ID" selects={FILTERS} />
          <QueueTable
            rows={rows}
            getRowKey={(c) => c.id}
            getRowHref={(c) => `${withParams("/kyc", params, { customer: c.id })}#customer-details`}
            selectedKey={selected?.id}
            emptyText="No customers match these filters."
            columns={[
              { header: "Customer", render: (c) => c.name, className: "text-nowrap" },
              { header: "Country", render: (c) => c.country },
              { header: "Review", render: (c) => <StatusBadge status={c.reviewType} />, className: "text-nowrap" },
              { header: "KYC status", render: (c) => <StatusBadge status={c.kycStatus} />, className: "text-nowrap" },
              { header: "Risk", render: (c) => <StatusBadge status={c.riskLevel} /> },
              { header: "Opened", render: (c) => c.reviewOpenedAt.slice(0, 10), className: "text-nowrap" },
              { header: "Updated", render: (c) => c.updatedAt.slice(0, 10), className: "text-nowrap" },
            ]}
          />
          <QueuePagination page={page} pageSize={query.pageSize} total={total} />
        </CardBody>
      </Card>

      <section id="customer-details" aria-label="Customer details" style={{ scrollMarginTop: 72 }}>
        {!selected ? (
          <Card body className="text-muted text-center py-4 border-dashed">
            {selectedId ? `Customer ${selectedId} not found.` : "Select a customer in the queue to see their details here."}
          </Card>
        ) : (
          <CustomerCase customerId={selected.id} canDecide={can(role, "kyc.decide")} />
        )}
      </section>
    </>
  );
}

function CustomerCase({ customerId, canDecide }: { customerId: string; canDecide: boolean }) {
  const db = getDb();
  const c = getCustomer(db, customerId)!;
  const checks = listVerificationChecks(db, c.id);
  const decisions = listKycDecisions(db, c.id);
  const blockers = getApprovalBlockers(checks);
  const allowed = allowedKycDecisions(c.kycStatus);
  const openInfoRequest = c.kycStatus === "info_requested" ? decisions.find((d) => d.decision === "request_info") : undefined;
  const transactions = listTransactionsForCustomer(db, c.id);
  const refunds = listRefundsForCustomer(db, c.id);
  const audit = listAuditEvents(db, { entityType: "customer", entityId: c.id, limit: 20 });

  const overview = (
    <Row className="g-4">
      <Col lg={6}>
        <h3 className="h6 text-uppercase text-muted small fw-semibold mb-3">Profile</h3>
        <RecordFields
          fields={[
            { label: "Customer ID", value: <code>{c.id}</code> },
            { label: "Account", value: `${statusLabel(c.accountType)} · ${c.accountRef}` },
            { label: "Email", value: c.email },
            { label: "Location", value: `${c.city}, ${c.country}` },
            { label: "Date of birth", value: c.dateOfBirth },
            { label: "Document", value: `${c.documentType} ${c.documentRef}` },
            { label: "Document expiry", value: c.documentExpiry },
            { label: c.reviewType === "onboarding" ? "Applied" : "Customer since", value: formatDateTime(c.appliedAt) },
            { label: "Case opened", value: formatDateTime(c.reviewOpenedAt) },
            { label: "Last updated", value: formatDateTime(c.updatedAt) },
          ]}
        />
        <h3 className="h6 text-uppercase text-muted small fw-semibold mt-4 mb-2">Risk classification</h3>
        <p className="small mb-0" data-testid="risk-summary">
          <StatusBadge status={c.riskLevel} label={`${statusLabel(c.riskLevel)} risk`} /> <span className="text-muted">{c.riskReason}</span>
        </p>
      </Col>
      <Col lg={6}>
        <h3 className="h6 text-uppercase text-muted small fw-semibold mb-2">Verification</h3>
        <VerificationChecklist items={checks.map((ch) => ({ label: CHECK_LABELS[ch.checkType], status: ch.result, detail: ch.detail }))} />
        <h3 className="h6 text-uppercase text-muted small fw-semibold mt-4 mb-2">Decision</h3>
        <KycDecisionForm
          key={c.id}
          customerId={c.id}
          allowed={allowed}
          approvalBlockedReason={blockers.length ? formatApprovalBlockers(blockers) : null}
          canDecide={canDecide}
          finalStatusLabel={statusLabel(c.kycStatus).toLowerCase()}
        />
      </Col>
    </Row>
  );

  const activity = (
    <Row className="g-4">
      <Col lg={6}>
        <h3 className="h6 text-uppercase text-muted small fw-semibold mb-2">Transactions ({transactions.length})</h3>
        <QueueTable
          rows={transactions}
          getRowKey={(t) => t.id}
          emptyText="No transactions."
          columns={[
            { header: "Date", render: (t) => t.createdAt.slice(0, 10), className: "text-nowrap" },
            { header: "Description", render: (t) => t.description },
            { header: "Amount", render: (t) => formatMoney(t.amountCents, t.currency), className: "text-nowrap" },
            { header: "Status", render: (t) => <StatusBadge status={t.status} /> },
          ]}
        />
      </Col>
      <Col lg={6}>
        <h3 className="h6 text-uppercase text-muted small fw-semibold mb-2">Refunds ({refunds.length})</h3>
        <QueueTable
          rows={refunds}
          getRowKey={(r) => r.id}
          emptyText="No refunds."
          columns={[
            { header: "Date", render: (r) => r.createdAt.slice(0, 10), className: "text-nowrap" },
            { header: "Transaction", render: (r) => <code>{r.transactionId}</code> },
            { header: "Amount", render: (r) => formatMoney(r.amountCents, r.currency), className: "text-nowrap" },
            { header: "Status", render: (r) => <StatusBadge status={r.status} /> },
            { header: "Reason", render: (r) => r.reason },
          ]}
        />
      </Col>
    </Row>
  );

  const history = (
    <Row className="g-4">
      <Col lg={6}>
        <h3 className="h6 text-uppercase text-muted small fw-semibold mb-2">Decision history</h3>
        <QueueTable
          rows={decisions}
          getRowKey={(d) => String(d.id)}
          emptyText="No decisions yet."
          columns={[
            { header: "When", render: (d) => d.decidedAt.slice(0, 10), className: "text-nowrap" },
            {
              header: "Decision",
              render: (d) => (
                <>
                  <StatusBadge status={d.toStatus} label={statusLabel(d.decision)} />
                  <div className="small text-muted">{d.decidedByRole}</div>
                </>
              ),
              className: "text-nowrap",
            },
            { header: "Note", render: (d) => d.note },
          ]}
        />
      </Col>
      <Col lg={6}>
        <h3 className="h6 text-uppercase text-muted small fw-semibold mb-2">Audit trail</h3>
        <QueueTable
          rows={audit}
          getRowKey={(e) => String(e.id)}
          emptyText="No audit events yet."
          columns={[
            { header: "When", render: (e) => formatDateTime(e.occurredAt), className: "text-nowrap" },
            { header: "Role", render: (e) => e.actorRole ?? "—" },
            { header: "Action", render: (e) => <code>{e.action}</code> },
            { header: "Outcome", render: (e) => <StatusBadge status={e.outcome} /> },
            { header: "Message", render: (e) => e.message },
          ]}
        />
      </Col>
    </Row>
  );

  return (
    <Card className="border-primary-subtle" data-testid="customer-details">
      <CardHeader className="py-3">
        <div className="small text-uppercase text-muted fw-semibold mb-1">Customer details</div>
        <div className="d-flex flex-wrap justify-content-between align-items-center gap-2">
          <h2 className="h4 mb-0">{c.name}</h2>
          <div className="d-flex flex-wrap gap-1">
            <StatusBadge status={c.reviewType} />
            <StatusBadge status={c.kycStatus} />
            <StatusBadge status={c.riskLevel} label={`${statusLabel(c.riskLevel)} risk`} />
          </div>
        </div>
        <div className="small mt-2" data-testid="case-reason">
          <span className="fw-semibold">{allowed.length ? "Why this case is open: " : "Latest review: "}</span>
          <span className="text-muted">{c.reviewReason}</span>
        </div>
        {openInfoRequest && (
          <Alert variant="info" className="py-2 small mt-2 mb-0" data-testid="info-requested">
            <strong>Awaiting information from customer</strong> (requested {formatDateTime(openInfoRequest.decidedAt)}):{" "}
            {openInfoRequest.note}
          </Alert>
        )}
      </CardHeader>
      <CardBody>
        <RecordTabs
          id={`customer-tabs-${c.id}`}
          tabs={[
            { key: "overview", title: "Overview", content: overview },
            { key: "activity", title: `Activity (${transactions.length + refunds.length})`, content: activity },
            { key: "history", title: `History (${decisions.length + audit.length})`, content: history },
          ]}
        />
      </CardBody>
    </Card>
  );
}
