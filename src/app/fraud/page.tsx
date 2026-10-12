import { Alert, Card, CardBody, CardHeader } from "react-bootstrap";
import { PageHeader } from "@/components/PageHeader";
import { QueueFilters, type FilterSelect } from "@/components/QueueFilters";
import { QueuePagination } from "@/components/QueuePagination";
import { QueueTable } from "@/components/QueueTable";
import { StatusBadge } from "@/components/StatusBadge";
import { SummaryCards } from "@/components/SummaryCards";
import { formatMoney } from "@/lib/format";
import { withParams, type SearchParams } from "@/lib/url";
import { getDb } from "@/server/db";
import { getFraudSummary, PAGE_SIZES, parseFraudAlertQuery, searchFraudAlerts } from "@/server/lookups";

export const dynamic = "force-dynamic";

const FILTERS: FilterSelect[] = [
  {
    name: "severity",
    label: "Severity",
    options: [
      { value: "all", label: "Any severity" },
      { value: "high", label: "High" },
      { value: "medium", label: "Medium" },
      { value: "low", label: "Low" },
    ],
  },
  {
    name: "status",
    label: "Alert status",
    options: [
      { value: "all", label: "All statuses" },
      { value: "open", label: "Open" },
      { value: "escalated", label: "Escalated" },
      { value: "dismissed", label: "Dismissed" },
    ],
  },
  {
    name: "sort",
    label: "Sort",
    options: [
      { value: "priority", label: "Priority (open, severity)" },
      { value: "created_desc", label: "Newest alerts" },
      { value: "amount_desc", label: "Largest amount" },
    ],
  },
  { name: "pageSize", label: "Page size", options: PAGE_SIZES.map((n) => ({ value: String(n), label: `${n} per page` })) },
];

export default async function FraudQueuePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const db = getDb();
  const query = parseFraudAlertQuery(params);
  const { rows, total, page } = searchFraudAlerts(db, query);
  const summary = getFraudSummary(db);

  return (
    <>
      <PageHeader
        title="Fraud Operations"
        description="Investigate alerts from the simulated fraud monitoring system. Risk Admins dismiss or escalate & hold; an active hold pauses refund processing."
      />
      <SummaryCards
        items={[
          { label: "Open alerts", value: summary.open, variant: "warning" },
          { label: "High severity open", value: summary.highOpen, variant: "danger" },
          { label: "Escalated", value: summary.escalated },
          { label: "Active account holds", value: summary.activeHolds, variant: "danger" },
        ]}
      />
      <Alert variant="info" className="py-2 small">
        All fraud signals are <strong>simulated</strong> demo data; no external fraud provider is connected.
      </Alert>
      <Card>
        <CardHeader as="h2" className="h6 mb-0">Investigation queue</CardHeader>
        <CardBody>
          <QueueFilters searchPlaceholder="Customer, alert or transaction ID" selects={FILTERS} />
          <QueueTable
            rows={rows}
            getRowKey={(r) => r.id}
            getRowHref={(r) => withParams(`/fraud/${r.id}`, params)}
            emptyText="No alerts match these filters."
            columns={[
              { header: "Severity", render: (r) => <StatusBadge status={r.severity} /> },
              { header: "Status", render: (r) => <StatusBadge status={r.status} /> },
              { header: "Customer", render: (r) => r.customerName, className: "text-nowrap" },
              { header: "Amount", render: (r) => formatMoney(r.amountCents, r.currency), className: "text-nowrap" },
              {
                header: "Alert reason",
                render: (r) => (
                  <>
                    <div className="fw-semibold">{r.scenario}</div>
                    <div className="small text-muted">{r.reason}</div>
                  </>
                ),
              },
              { header: "Created", render: (r) => r.createdAt.slice(0, 10), className: "text-nowrap" },
            ]}
          />
          <QueuePagination page={page} pageSize={query.pageSize} total={total} />
        </CardBody>
      </Card>
    </>
  );
}
