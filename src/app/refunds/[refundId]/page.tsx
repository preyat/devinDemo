import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardBody, CardHeader, Col, Row } from "react-bootstrap";
import { QueueTable } from "@/components/QueueTable";
import { RecordFields } from "@/components/RecordDetail";
import { RecordNav } from "@/components/RecordNav";
import { RecordTabs } from "@/components/RecordTabs";
import { StatusBadge, statusLabel } from "@/components/StatusBadge";
import { VerificationChecklist } from "@/components/VerificationChecklist";
import { formatDateTime, formatMoney } from "@/lib/format";
import { getDemoRole } from "@/lib/session";
import { withParams, type SearchParams } from "@/lib/url";
import { listAuditEvents } from "@/server/audit";
import { getDb } from "@/server/db";
import { getRefundQueueNeighbours, getTransaction, listPayoutsForRefund, listRefundsForTransaction, parseRefundQuery } from "@/server/lookups";
import { can } from "@/server/permissions";
import { businessBlockers, canProcessRefund } from "@/server/refunds/service";
import { ProcessRefundForm } from "../ProcessRefundForm";

export const dynamic = "force-dynamic";

export default async function RefundCasePage({
  params,
  searchParams,
}: {
  params: Promise<{ refundId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { refundId } = await params;
  const queueParams = await searchParams;
  const db = getDb();
  const role = await getDemoRole();
  const eligibility = canProcessRefund(db, role, refundId);
  if (!eligibility.refund) notFound();
  const r = eligibility.refund;
  const nav = getRefundQueueNeighbours(db, parseRefundQuery(queueParams), r.id);
  const refundHref = (id: string) => withParams(`/refunds/${id}`, queueParams);
  const nextHref = nav.nextId && nav.nextId !== r.id ? refundHref(nav.nextId) : null;
  const audit = listAuditEvents(db, { entityType: "refund", entityId: r.id, limit: 20 });
  const txn = getTransaction(db, r.transactionId)!;
  const siblings = listRefundsForTransaction(db, r.transactionId).filter((s) => s.id !== r.id);
  const payouts = listPayoutsForRefund(db, r.id);
  const blockers = businessBlockers(eligibility);

  const overview = (
    <Row className="g-4">
      <Col lg={6}>
        <h3 className="h6 text-uppercase text-muted small fw-semibold mb-3">Refund</h3>
        <RecordFields
          fields={[
          { label: "Refund ID", value: <code>{r.id}</code> },
          { label: "Amount", value: formatMoney(r.amountCents, r.currency) },
          { label: "Reason", value: r.reason },
          { label: "Requested", value: formatDateTime(r.createdAt) },
          { label: "Customer", value: <Link href={`/kyc/${r.customerId}`}>{r.customerId}</Link> },
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
      </Col>
      <Col lg={6}>
        <h3 className="h6 text-uppercase text-muted small fw-semibold mb-2">
          Eligibility <span className="fw-normal" style={{ textTransform: "none" }}>(canProcessRefund)</span>
        </h3>
        <div data-testid="eligibility">
          <VerificationChecklist
            items={eligibility.checks.map((c) => ({
              label: c.label,
              status: c.passed ? "passed" : "failed",
              detail: c.message ?? c.code,
            }))}
          />
        </div>
        <h3 className="h6 text-uppercase text-muted small fw-semibold mt-4 mb-2">Process</h3>
        <ProcessRefundForm
          key={r.id}
          refundId={r.id}
          open={r.status === "pending"}
          canProcess={can(role, "refund.process")}
          blocked={blockers.length > 0}
          nextHref={nextHref}
        />
      </Col>
    </Row>
  );

  const activity = (
    <Row className="g-4">
      <Col lg={6}>
        <h3 className="h6 text-uppercase text-muted small fw-semibold mb-2">Payout</h3>
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
      </Col>
      <Col lg={6}>
        <h3 className="h6 text-uppercase text-muted small fw-semibold mb-2">Other refunds on {txn.id} ({siblings.length})</h3>
        <QueueTable
          rows={siblings}
          getRowKey={(s) => s.id}
          getRowHref={(s) => `/refunds/${s.id}?status=all`}
          emptyText="No other refunds on this transaction."
          columns={[
            { header: "Refund", render: (s) => <code>{s.id}</code> },
            { header: "Amount", render: (s) => formatMoney(s.amountCents, s.currency) },
            { header: "Status", render: (s) => <StatusBadge status={s.status} /> },
            { header: "Requested", render: (s) => s.createdAt.slice(0, 10) },
          ]}
        />
      </Col>
    </Row>
  );

  const history = (
    <QueueTable
      rows={audit}
      getRowKey={(e) => String(e.id)}
      emptyText="No audit events yet."
      columns={[
        { header: "When", render: (e) => formatDateTime(e.occurredAt), className: "text-nowrap" },
        { header: "Role", render: (e) => e.actorRole ?? "—" },
        { header: "Outcome", render: (e) => <StatusBadge status={e.outcome} /> },
        { header: "Message", render: (e) => e.message },
      ]}
    />
  );

  return (
    <>
      <RecordNav
        backHref={withParams("/refunds", queueParams)}
        backLabel="Back to refund queue"
        prevHref={nav.prevId ? refundHref(nav.prevId) : null}
        nextHref={nextHref}
        position={nav.position}
        total={nav.total}
        noun="refund"
      />
      <Card data-testid="refund-details">
        <CardHeader className="py-3">
          <div className="small text-uppercase text-muted fw-semibold mb-1">Refund · <code>{r.id}</code></div>
          <div className="d-flex flex-wrap justify-content-between align-items-center gap-2">
            <h1 className="h3 mb-0">
              {formatMoney(r.amountCents, r.currency)} <span className="text-muted fw-normal">to {r.customerName}</span>
            </h1>
            <div className="d-flex flex-wrap gap-1">
              <StatusBadge status={r.status} />
              <StatusBadge status={r.customerKycStatus} label={`KYC ${statusLabel(r.customerKycStatus).toLowerCase()}`} />
              {r.status === "pending" &&
                (blockers.length ? blockers.map((code) => <StatusBadge key={code} status="blocked" label={code} />) : <StatusBadge status="eligible" label="Eligible" />)}
            </div>
          </div>
          <div className="small mt-2">
            <span className="fw-semibold">Reason: </span>
            <span className="text-muted">{r.reason}</span>
          </div>
        </CardHeader>
        <CardBody>
          <RecordTabs
            id={`refund-tabs-${r.id}`}
            tabs={[
              { key: "overview", title: "Overview", content: overview },
              { key: "activity", title: `Activity (${payouts.length + siblings.length})`, content: activity },
              { key: "history", title: `History (${audit.length})`, content: history },
            ]}
          />
        </CardBody>
      </Card>
    </>
  );
}
