import Link from "next/link";
import { Card, CardBody, CardHeader, Col, Row } from "react-bootstrap";
import { PageHeader } from "@/components/PageHeader";
import { QueueTable } from "@/components/QueueTable";
import { RecordDetail } from "@/components/RecordDetail";
import { StatusBadge } from "@/components/StatusBadge";
import { SummaryCards } from "@/components/SummaryCards";
import { formatDateTime } from "@/lib/format";
import { getDemoRole } from "@/lib/session";
import { withParams, type SearchParams } from "@/lib/url";
import { listAuditEvents } from "@/server/audit";
import { getDb } from "@/server/db";
import { getFeatureFlagDefinition } from "@/server/feature-flags/definitions";
import { allowedFlagDecisions } from "@/server/feature-flags/service";
import { listFeatureFlags, listPendingRefundIds } from "@/server/lookups";
import { can } from "@/server/permissions";
import { businessBlockers, canProcessRefund } from "@/server/refunds/service";
import { ToggleFlagForm } from "./ToggleFlagForm";

export const dynamic = "force-dynamic";

const flagState = (enabled: boolean) => <StatusBadge status={enabled ? "on" : "off"} label={enabled ? "ON" : "OFF"} />;

export default async function FeatureFlagsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const db = getDb();
  const role = await getDemoRole();
  const flags = listFeatureFlags(db);
  const selectedKey = typeof params.flag === "string" ? params.flag : undefined;
  const selected = flags.find((f) => f.key === selectedKey);
  const pendingEligibility = listPendingRefundIds(db).map((id) => canProcessRefund(db, null, id));

  return (
    <>
      <PageHeader title="Feature Flags" description="Persisted operational flags. Changes apply to the next request in every workflow. Only Risk Admins may toggle." />
      <SummaryCards
        items={[
          { label: "Flags", value: flags.length },
          { label: "Enabled", value: flags.filter((f) => f.enabled).length, variant: "warning" },
          { label: "Pending refunds blocked", value: pendingEligibility.filter((e) => businessBlockers(e).length > 0).length, variant: "danger" },
        ]}
      />
      <Row className="g-3">
        <Col xl={7}>
          <Card>
            <CardHeader as="h2" className="h6 mb-0">Flags</CardHeader>
            <CardBody>
              <QueueTable
                rows={flags}
                getRowKey={(f) => f.key}
                getRowHref={(f) => withParams("/feature-flags", params, { flag: f.key })}
                selectedKey={selected?.key}
                columns={[
                  {
                    header: "Flag",
                    render: (f) => (
                      <>
                        <div className="fw-semibold">{getFeatureFlagDefinition(f.key)?.label ?? f.key}</div>
                        <code className="small">{f.key}</code>
                      </>
                    ),
                  },
                  { header: "State", render: (f) => flagState(f.enabled) },
                  { header: "Updated", render: (f) => `${f.updatedAt.slice(0, 10)}${f.updatedByRole ? ` · ${f.updatedByRole}` : ""}`, className: "text-nowrap" },
                ]}
              />
            </CardBody>
          </Card>
        </Col>
        <Col xl={5}>
          {!selected ? (
            <Card body className="text-muted">{selectedKey ? `Feature flag ${selectedKey} not found.` : "Select a flag to manage."}</Card>
          ) : (
            <FlagDetail flagKey={selected.key} canToggle={can(role, "feature_flag.toggle")} />
          )}
        </Col>
      </Row>
    </>
  );
}

function FlagDetail({ flagKey, canToggle }: { flagKey: string; canToggle: boolean }) {
  const db = getDb();
  const flag = listFeatureFlags(db).find((f) => f.key === flagKey)!;
  const def = getFeatureFlagDefinition(flagKey);
  const affected = listPendingRefundIds(db)
    .map((id) => canProcessRefund(db, null, id))
    .filter((e) => def && e.reasons.some((r) => r.code === def.blockCode));

  return (
    <div className="d-grid gap-3">
      <RecordDetail
        title={
          <span className="d-flex justify-content-between align-items-center">
            <span>{def?.label ?? flag.key}</span>
            {flagState(flag.enabled)}
          </span>
        }
        fields={[
          { label: "Key", value: <code>{flag.key}</code> },
          { label: "Description", value: flag.description },
          { label: "Enforced in", value: def?.effect ?? "—" },
          { label: "Last changed", value: `${formatDateTime(flag.updatedAt)}${flag.updatedByRole ? ` by ${flag.updatedByRole}` : " (seed)"}` },
        ]}
      >
        <div className="small mt-2" data-testid="flag-impact">
          <span className="fw-semibold">Currently blocking: </span>
          {affected.length === 0
            ? "no pending refunds."
            : affected.map((e) => (
                <Link key={e.refund!.id} href={`/refunds/${e.refund!.id}`} className="me-2">
                  {e.refund!.id}
                </Link>
              ))}
        </div>
      </RecordDetail>

      <Card>
        <CardHeader as="h2" className="h6 mb-0">Change</CardHeader>
        <CardBody>
          <ToggleFlagForm key={flag.key} flagKey={flag.key} allowed={allowedFlagDecisions(flag.enabled)} canToggle={canToggle} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader as="h2" className="h6 mb-0">Audit trail</CardHeader>
        <CardBody>
          <QueueTable
            rows={listAuditEvents(db, { entityType: "feature_flag", entityId: flag.key, limit: 20 })}
            getRowKey={(e) => String(e.id)}
            emptyText="No changes since seed."
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
