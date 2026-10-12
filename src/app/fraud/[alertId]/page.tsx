import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert, Card, CardBody, CardHeader, Col, Row } from "react-bootstrap";
import { QueueTable } from "@/components/QueueTable";
import { RecordFields } from "@/components/RecordDetail";
import { RecordNav } from "@/components/RecordNav";
import { RecordTabs } from "@/components/RecordTabs";
import { StatusBadge, statusLabel } from "@/components/StatusBadge";
import { formatDateTime, formatMoney } from "@/lib/format";
import { getDemoRole } from "@/lib/session";
import { withParams, type SearchParams } from "@/lib/url";
import { listAuditEvents } from "@/server/audit";
import { getDb } from "@/server/db";
import { allowedFraudDecisions } from "@/server/fraud/service";
import {
  getActiveRiskHold,
  getCustomer,
  getFraudAlert,
  getFraudAlertQueueNeighbours,
  getTransaction,
  listFraudAlertDecisions,
  listFraudSignals,
  listRefundsForCustomer,
  listRiskHoldsForCustomer,
  parseFraudAlertQuery,
} from "@/server/lookups";
import { can } from "@/server/permissions";
import { businessBlockers, canProcessRefund } from "@/server/refunds/service";
import { FraudDecisionForm } from "../FraudDecisionForm";

export const dynamic = "force-dynamic";

const sectionTitle = "h6 text-uppercase text-muted small fw-semibold mb-2";

export default async function FraudAlertPage({
  params,
  searchParams,
}: {
  params: Promise<{ alertId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { alertId } = await params;
  const queueParams = await searchParams;
  const db = getDb();
  const role = await getDemoRole();
  const a = getFraudAlert(db, alertId);
  if (!a) notFound();
  const customer = getCustomer(db, a.customerId)!;
  const txn = getTransaction(db, a.transactionId)!;
  const signals = listFraudSignals(db, a.id);
  const decisions = listFraudAlertDecisions(db, a.id);
  const audit = listAuditEvents(db, { entityType: "fraud_alert", entityId: a.id, limit: 20 });
  const holds = listRiskHoldsForCustomer(db, a.customerId);
  const activeHold = getActiveRiskHold(db, a.customerId);
  const refunds = listRefundsForCustomer(db, a.customerId);
  const nav = getFraudAlertQueueNeighbours(db, parseFraudAlertQuery(queueParams), a.id);
  const alertHref = (id: string) => withParams(`/fraud/${id}`, queueParams);
  const nextHref = nav.nextId && nav.nextId !== a.id ? alertHref(nav.nextId) : null;
  const open = allowedFraudDecisions(a.status).length > 0;

  const overview = (
    <Row className="g-4">
      <Col lg={6}>
        <h3 className={sectionTitle}>Flagged transaction</h3>
        <RecordFields
          fields={[
            { label: "Alert ID", value: <code>{a.id}</code> },
            { label: "Transaction", value: <code>{txn.id}</code> },
            { label: "Amount", value: formatMoney(txn.amountCents, txn.currency) },
            { label: "Description", value: txn.description },
            { label: "Transaction time", value: formatDateTime(txn.createdAt) },
            { label: "Alert raised", value: formatDateTime(a.createdAt) },
          ]}
        />
        <h3 className={`${sectionTitle} mt-4`}>Customer</h3>
        <RecordFields
          fields={[
            { label: "Name", value: <Link href={`/kyc/${customer.id}`}>{customer.name}</Link> },
            { label: "Customer ID", value: <code>{customer.id}</code> },
            { label: "Location", value: `${customer.city}, ${customer.country}` },
            { label: "Account", value: `${statusLabel(customer.accountType)} · ${customer.accountRef}` },
            { label: "KYC status", value: <StatusBadge status={customer.kycStatus} /> },
            { label: "Risk profile", value: <><StatusBadge status={customer.riskLevel} /> <span className="small text-muted">{customer.riskReason}</span></> },
          ]}
        />
      </Col>
      <Col lg={6}>
        <h3 className={sectionTitle}>
          Triggered signals <StatusBadge status="simulated" label="Simulated" />
        </h3>
        <ul className="list-group mb-4" data-testid="fraud-signals">
          {signals.map((s) => (
            <li key={s.code} className="list-group-item">
              <div className="d-flex justify-content-between gap-2">
                <span className="fw-semibold">{s.label}</span>
                <code className="small">{s.code}</code>
              </div>
              <div className="small text-muted">{s.detail}</div>
            </li>
          ))}
        </ul>
        <h3 className={sectionTitle}>Account risk hold</h3>
        <div className="mb-4" data-testid="hold-status">
          {activeHold ? (
            <Alert variant="danger" className="py-2 small mb-0">
              <strong>Active hold</strong> <code>{activeHold.id}</code> since {formatDateTime(activeHold.createdAt)} by {activeHold.createdByRole} (alert{" "}
              <code>{activeHold.alertId}</code>). Refund processing is paused for this customer.
            </Alert>
          ) : (
            <Alert variant="secondary" className="py-2 small mb-0">No active account risk hold. Refunds follow the normal eligibility rules.</Alert>
          )}
        </div>
        <h3 className={sectionTitle}>Investigation decision</h3>
        <FraudDecisionForm key={a.id} alertId={a.id} open={open} canDecide={can(role, "fraud_alert.escalate")} nextHref={nextHref} />
      </Col>
    </Row>
  );

  const refundHistory = (
    <>
      <QueueTable
        rows={refunds}
        getRowKey={(r) => r.id}
        getRowHref={(r) => `/refunds/${r.id}?status=all`}
        emptyText="No refunds for this customer."
        columns={[
          { header: "Refund", render: (r) => <code>{r.id}</code> },
          { header: "Amount", render: (r) => formatMoney(r.amountCents, r.currency) },
          { header: "Status", render: (r) => <StatusBadge status={r.status} /> },
          { header: "Reason", render: (r) => r.reason },
          {
            header: "Eligibility (canProcessRefund)",
            render: (r) => {
              if (r.status !== "pending") return <span className="text-muted small">—</span>;
              const blockers = businessBlockers(canProcessRefund(db, role, r.id));
              return blockers.length ? blockers.map((code) => <StatusBadge key={code} status="blocked" label={code} />) : <StatusBadge status="eligible" label="Eligible" />;
            },
          },
          { header: "Requested", render: (r) => r.createdAt.slice(0, 10), className: "text-nowrap" },
        ]}
      />
      <h3 className={`${sectionTitle} mt-4`}>Holds on this account ({holds.length})</h3>
      <QueueTable
        rows={holds}
        getRowKey={(h) => h.id}
        emptyText="No holds have ever been placed on this account."
        columns={[
          { header: "Hold", render: (h) => <code>{h.id}</code> },
          { header: "Status", render: (h) => <StatusBadge status={h.status} /> },
          { header: "Alert", render: (h) => <Link href={`/fraud/${h.alertId}?status=all`}>{h.alertId}</Link> },
          { header: "Reason", render: (h) => h.reason },
          { header: "Placed", render: (h) => `${formatDateTime(h.createdAt)} by ${h.createdByRole}`, className: "text-nowrap" },
        ]}
      />
    </>
  );

  const history = (
    <>
      <h3 className={sectionTitle}>Investigation decisions</h3>
      <QueueTable
        rows={decisions}
        getRowKey={(d) => String(d.id)}
        emptyText="No decisions yet."
        columns={[
          { header: "When", render: (d) => formatDateTime(d.decidedAt), className: "text-nowrap" },
          { header: "Decision", render: (d) => statusLabel(d.decision) },
          { header: "Status", render: (d) => <>{d.fromStatus ? `${statusLabel(d.fromStatus)} → ` : ""}<StatusBadge status={d.toStatus} /></> },
          { header: "By", render: (d) => d.decidedByRole },
          { header: "Reason", render: (d) => d.note },
        ]}
      />
      <h3 className={`${sectionTitle} mt-4`}>Audit trail</h3>
      <div data-testid="fraud-audit">
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
      </div>
    </>
  );

  return (
    <>
      <RecordNav
        backHref={withParams("/fraud", queueParams)}
        backLabel="Back to investigation queue"
        prevHref={nav.prevId ? alertHref(nav.prevId) : null}
        nextHref={nextHref}
        position={nav.position}
        total={nav.total}
        noun="alert"
      />
      <Card data-testid="fraud-alert-details">
        <CardHeader className="py-3">
          <div className="small text-uppercase text-muted fw-semibold mb-1">Fraud alert · <code>{a.id}</code></div>
          <div className="d-flex flex-wrap justify-content-between align-items-center gap-2">
            <h1 className="h3 mb-0">
              {a.scenario} <span className="text-muted fw-normal">· {customer.name} · {formatMoney(a.amountCents, a.currency)}</span>
            </h1>
            <div className="d-flex flex-wrap gap-1">
              <StatusBadge status={a.severity} label={`${statusLabel(a.severity)} severity`} />
              <StatusBadge status={a.status} />
              <StatusBadge status={customer.kycStatus} label={`KYC ${statusLabel(customer.kycStatus).toLowerCase()}`} />
              {activeHold && <StatusBadge status="active" label="Account on hold" />}
            </div>
          </div>
          <div className="small mt-2" data-testid="alert-reason">
            <span className="fw-semibold">Why this was flagged: </span>
            <span className="text-muted">{a.reason}</span>
          </div>
        </CardHeader>
        <CardBody>
          <RecordTabs
            id={`fraud-tabs-${a.id}`}
            tabs={[
              { key: "overview", title: "Overview", content: overview },
              { key: "refunds", title: `Refunds & holds (${refunds.length})`, content: refundHistory },
              { key: "history", title: `Investigation history (${decisions.length + audit.length})`, content: history },
            ]}
          />
        </CardBody>
      </Card>
    </>
  );
}
