import { redirect } from "next/navigation";
import { Card, CardBody, CardHeader } from "react-bootstrap";
import { PageHeader } from "@/components/PageHeader";
import { QueueFilters, type FilterSelect } from "@/components/QueueFilters";
import { QueuePagination } from "@/components/QueuePagination";
import { QueueTable } from "@/components/QueueTable";
import { StatusBadge } from "@/components/StatusBadge";
import { SummaryCards } from "@/components/SummaryCards";
import { withParams, type SearchParams } from "@/lib/url";
import { getDb } from "@/server/db";
import { getKycSummary, PAGE_SIZES, parseCustomerQuery, searchCustomers } from "@/server/lookups";

export const dynamic = "force-dynamic";

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
  // Legacy deep links (/kyc?customer=<id>) now live on the case page.
  if (typeof params.customer === "string") redirect(withParams(`/kyc/${params.customer}`, params, { customer: null }));
  const db = getDb();
  const query = parseCustomerQuery(params);
  const { rows, total, page } = searchCustomers(db, query);
  const summary = getKycSummary(db);

  return (
    <>
      <PageHeader title="KYC Review" description="Review synthetic customer identity checks. Open a case to investigate and decide. Only KYC Reviewers may decide." />
      <SummaryCards
        items={[
          { label: "Pending review", value: summary.pending, variant: "warning" },
          { label: "Awaiting information", value: summary.infoRequested, variant: "info" },
          { label: "High risk open cases", value: summary.highRiskOpen, variant: "danger" },
          { label: "Total customers", value: summary.total },
        ]}
      />
      <Card>
        <CardHeader as="h2" className="h6 mb-0">Customer queue</CardHeader>
        <CardBody>
          <QueueFilters searchPlaceholder="Name or customer ID" selects={FILTERS} />
          <QueueTable
            rows={rows}
            getRowKey={(c) => c.id}
            getRowHref={(c) => withParams(`/kyc/${c.id}`, params)}
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

    </>
  );
}

