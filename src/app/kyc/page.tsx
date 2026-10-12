import { Alert, Card, CardBody, CardHeader, Col, Row } from "react-bootstrap";
import { PageHeader } from "@/components/PageHeader";
import { QueueFilters, type FilterSelect } from "@/components/QueueFilters";
import { QueuePagination } from "@/components/QueuePagination";
import { QueueTable } from "@/components/QueueTable";
import { RecordDetail } from "@/components/RecordDetail";
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
      <Row className="g-3">
        <Col xl={7}>
          <Card>
            <CardHeader as="h2" className="h6 mb-0">Customer queue</CardHeader>
            <CardBody>
              <QueueFilters searchPlaceholder="Name or customer ID" selects={FILTERS} />
              <QueueTable
                rows={rows}
                getRowKey={(c) => c.id}
                getRowHref={(c) => withParams("/kyc", params, { customer: c.id })}
                selectedKey={selected?.id}
                emptyText="No customers match these filters."
                columns={[
                  { header: "Customer", render: (c) => c.name, className: "text-nowrap" },
                  { header: "Review", render: (c) => <StatusBadge status={c.reviewType} />, className: "text-nowrap" },
                  { header: "KYC status", render: (c) => <StatusBadge status={c.kycStatus} /> },
                  { header: "Risk", render: (c) => <StatusBadge status={c.riskLevel} /> },
                  { header: "Opened", render: (c) => c.reviewOpenedAt.slice(0, 10), className: "text-nowrap" },
                  { header: "Updated", render: (c) => c.updatedAt.slice(0, 10), className: "text-nowrap" },
                ]}
              />
              <QueuePagination page={page} pageSize={query.pageSize} total={total} />
            </CardBody>
          </Card>
        </Col>
        <Col xl={5}>
          {!selected ? (
            <Card body className="text-muted">
              {selectedId ? `Customer ${selectedId} not found.` : "Select a customer to review."}
            </Card>
          ) : (
            <CustomerCase customerId={selected.id} canDecide={can(role, "kyc.decide")} />
          )}
        </Col>
      </Row>
    </>
  );
}

function CustomerCase({ customerId, canDecide }: { customerId: string; canDecide: boolean }) {
  const db = getDb();
  const c = getCustomer(db, customerId)!;
  const checks = listVerificationChecks(db, c.id);
  const decisions = listKycDecisions(db, c.id);
  const blockers = getApprovalBlockers(checks);
  const openInfoRequest = c.kycStatus === "info_requested" ? decisions.find((d) => d.decision === "request_info") : undefined;
  const transactions = listTransactionsForCustomer(db, c.id);
  const refunds = listRefundsForCustomer(db, c.id);

  return (
    <div className="d-grid gap-3">
      <RecordDetail
        title={
          <span className="d-flex justify-content-between align-items-center">
            <span>{c.name}</span>
            <span className="d-flex gap-1">
              <StatusBadge status={c.kycStatus} />
              <StatusBadge status={c.riskLevel} label={`${statusLabel(c.riskLevel)} risk`} />
            </span>
          </span>
        }
        fields={[
          { label: "Customer ID", value: <code>{c.id}</code> },
          { label: "Account", value: `${statusLabel(c.accountType)} · ${c.accountRef}` },
          { label: "Email", value: c.email },
          { label: "Location", value: `${c.city}, ${c.country}` },
          { label: "Date of birth", value: c.dateOfBirth },
          { label: "Document", value: `${c.documentType} ${c.documentRef} (expires ${c.documentExpiry})` },
          { label: c.reviewType === "onboarding" ? "Applied" : "Customer since", value: formatDateTime(c.appliedAt) },
          { label: "Case opened", value: formatDateTime(c.reviewOpenedAt) },
          { label: "Last updated", value: formatDateTime(c.updatedAt) },
        ]}
      >
        <div className="border rounded-3 p-2 mt-2 small bg-body-tertiary" data-testid="case-reason">
          <div className="d-flex align-items-center gap-2 mb-1">
            <span className="fw-semibold">{allowedKycDecisions(c.kycStatus).length ? "Why this case is open" : "Latest review"}</span>
            <StatusBadge status={c.reviewType} />
          </div>
          <span className="text-muted">{c.reviewReason}</span>
        </div>
        <div className="pt-2 mt-2 small" data-testid="risk-summary">
          <span className="fw-semibold">Risk classification: </span>
          <StatusBadge status={c.riskLevel} /> <span className="text-muted">{c.riskReason}</span>
        </div>
        {openInfoRequest && (
          <Alert variant="info" className="py-2 small mt-3 mb-0" data-testid="info-requested">
            <strong>Awaiting information from customer</strong> (requested {formatDateTime(openInfoRequest.decidedAt)}):{" "}
            {openInfoRequest.note}
          </Alert>
        )}
      </RecordDetail>

      <Card>
        <CardHeader as="h2" className="h6 mb-0">Verification</CardHeader>
        <CardBody className="py-1">
          <VerificationChecklist items={checks.map((ch) => ({ label: CHECK_LABELS[ch.checkType], status: ch.result, detail: ch.detail }))} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader as="h2" className="h6 mb-0">Decision</CardHeader>
        <CardBody>
          <KycDecisionForm
            key={c.id}
            customerId={c.id}
            allowed={allowedKycDecisions(c.kycStatus)}
            approvalBlockedReason={blockers.length ? formatApprovalBlockers(blockers) : null}
            canDecide={canDecide}
            finalStatusLabel={statusLabel(c.kycStatus).toLowerCase()}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader as="h2" className="h6 mb-0">Decision history</CardHeader>
        <CardBody>
          <QueueTable
            rows={decisions}
            getRowKey={(d) => String(d.id)}
            emptyText="No decisions yet."
            columns={[
              { header: "When", render: (d) => formatDateTime(d.decidedAt), className: "text-nowrap" },
              { header: "Decision", render: (d) => <StatusBadge status={d.toStatus} label={statusLabel(d.decision)} /> },
              { header: "By", render: (d) => d.decidedByRole },
              { header: "Note", render: (d) => d.note },
            ]}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader as="h2" className="h6 mb-0">Transactions ({transactions.length})</CardHeader>
        <CardBody>
          <QueueTable
            rows={transactions}
            getRowKey={(t) => t.id}
            emptyText="No transactions."
            columns={[
              { header: "Date", render: (t) => t.createdAt.slice(0, 10), className: "text-nowrap" },
              { header: "Description", render: (t) => t.description },
              { header: "Amount", render: (t) => formatMoney(t.amountCents, t.currency) },
              { header: "Status", render: (t) => <StatusBadge status={t.status} /> },
            ]}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader as="h2" className="h6 mb-0">Refunds ({refunds.length})</CardHeader>
        <CardBody>
          <QueueTable
            rows={refunds}
            getRowKey={(r) => r.id}
            emptyText="No refunds."
            columns={[
              { header: "Date", render: (r) => r.createdAt.slice(0, 10), className: "text-nowrap" },
              { header: "Transaction", render: (r) => <code>{r.transactionId}</code> },
              { header: "Amount", render: (r) => formatMoney(r.amountCents, r.currency) },
              { header: "Status", render: (r) => <StatusBadge status={r.status} /> },
              { header: "Reason", render: (r) => r.reason },
            ]}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader as="h2" className="h6 mb-0">Audit trail</CardHeader>
        <CardBody>
          <QueueTable
            rows={listAuditEvents(db, { entityType: "customer", entityId: c.id, limit: 20 })}
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
        </CardBody>
      </Card>
    </div>
  );
}
