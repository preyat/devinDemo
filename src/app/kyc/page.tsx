import { Card, CardBody, CardHeader, Col, Row } from "react-bootstrap";
import { PageHeader } from "@/components/PageHeader";
import { QueueTable } from "@/components/QueueTable";
import { RecordDetail } from "@/components/RecordDetail";
import { StatusBadge } from "@/components/StatusBadge";
import { formatDateTime, formatMoney } from "@/lib/format";
import { getDemoRole } from "@/lib/session";
import { listAuditEvents } from "@/server/audit";
import { getDb } from "@/server/db";
import { getCustomer, listCustomers, listRefundsForCustomer, listTransactionsForCustomer } from "@/server/lookups";
import { can } from "@/server/permissions";
import { KycDecisionForm } from "./KycDecisionForm";

export const dynamic = "force-dynamic";

export default async function KycPage({ searchParams }: { searchParams: Promise<{ customer?: string }> }) {
  const { customer: selectedId } = await searchParams;
  const db = getDb();
  const role = await getDemoRole();
  const customers = listCustomers(db);
  const selected = selectedId ? getCustomer(db, selectedId) : null;

  return (
    <>
      <PageHeader title="KYC Review" description="Review synthetic customer identity checks. Only KYC Reviewers may decide." />
      <Row className="g-3">
        <Col lg={6}>
          <Card>
            <CardHeader as="h2" className="h6 mb-0">Customer queue</CardHeader>
            <CardBody>
              <QueueTable
                rows={customers}
                getRowKey={(c) => c.id}
                getRowHref={(c) => `/kyc?customer=${c.id}`}
                selectedKey={selected?.id}
                columns={[
                  { header: "Customer", render: (c) => c.name },
                  { header: "Country", render: (c) => c.country },
                  { header: "KYC status", render: (c) => <StatusBadge status={c.kycStatus} /> },
                  { header: "Decided", render: (c) => formatDateTime(c.kycDecidedAt) },
                ]}
              />
            </CardBody>
          </Card>
        </Col>
        <Col lg={6}>
          {!selected ? (
            <Card body className="text-muted">
              {selectedId ? `Customer ${selectedId} not found.` : "Select a customer to review."}
            </Card>
          ) : (
            <>
              <RecordDetail
                title={selected.name}
                fields={[
                  { label: "Customer ID", value: <code>{selected.id}</code> },
                  { label: "KYC status", value: <StatusBadge status={selected.kycStatus} /> },
                  { label: "Email", value: selected.email },
                  { label: "Country", value: selected.country },
                  { label: "Date of birth", value: selected.dateOfBirth },
                  { label: "Document", value: `${selected.documentType} •••• ${selected.documentLast4}` },
                  { label: "Decided by", value: selected.kycDecidedByRole },
                  { label: "Decision note", value: selected.kycDecisionNote },
                  {
                    label: "Transactions",
                    value: listTransactionsForCustomer(db, selected.id)
                      .map((t) => `${formatMoney(t.amountCents)} ${t.description}`)
                      .join("; "),
                  },
                  {
                    label: "Refunds",
                    value: listRefundsForCustomer(db, selected.id)
                      .map((r) => `${formatMoney(r.amountCents)} (${r.status})`)
                      .join("; "),
                  },
                ]}
              >
                <hr />
                <KycDecisionForm
                  key={selected.id}
                  customerId={selected.id}
                  status={selected.kycStatus}
                  canDecide={can(role, "kyc.decide")}
                />
              </RecordDetail>
              <Card className="mt-3">
                <CardHeader as="h2" className="h6 mb-0">Audit trail</CardHeader>
                <CardBody>
                  <QueueTable
                    rows={listAuditEvents(db, { entityType: "customer", entityId: selected.id, limit: 20 })}
                    getRowKey={(e) => String(e.id)}
                    emptyText="No audit events yet."
                    columns={[
                      { header: "When", render: (e) => formatDateTime(e.occurredAt) },
                      { header: "Role", render: (e) => e.actorRole ?? "—" },
                      { header: "Action", render: (e) => <code>{e.action}</code> },
                      { header: "Outcome", render: (e) => <StatusBadge status={e.outcome} /> },
                      { header: "Message", render: (e) => e.message },
                    ]}
                  />
                </CardBody>
              </Card>
            </>
          )}
        </Col>
      </Row>
    </>
  );
}
