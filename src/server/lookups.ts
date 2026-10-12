import { z } from "zod";
import type { Db } from "./db";

export const KYC_STATUSES = ["pending", "info_requested", "approved", "rejected"] as const;
export type KycStatus = (typeof KYC_STATUSES)[number];
export const RISK_LEVELS = ["low", "medium", "high"] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];
export const REVIEW_TYPES = ["onboarding", "periodic_refresh", "triggered"] as const;
export type ReviewType = (typeof REVIEW_TYPES)[number];
export type CheckType = "identity" | "address" | "sanctions" | "pep";
export type CheckResult = "passed" | "missing" | "failed" | "clear" | "review_required";

export interface Customer {
  id: string;
  name: string;
  email: string;
  country: string;
  city: string;
  dateOfBirth: string;
  accountType: "personal" | "business";
  accountRef: string;
  documentType: string;
  documentRef: string;
  documentExpiry: string;
  kycStatus: KycStatus;
  riskLevel: RiskLevel;
  riskReason: string;
  reviewType: ReviewType;
  reviewReason: string;
  reviewOpenedAt: string;
  appliedAt: string;
  updatedAt: string;
}

export interface VerificationCheck {
  customerId: string;
  checkType: CheckType;
  result: CheckResult;
  detail: string;
  checkedAt: string;
}

export interface KycDecisionRecord {
  id: number;
  customerId: string;
  /** open_review is written by the system when an existing customer's KYC is re-opened. */
  decision: "approve" | "reject" | "request_info" | "open_review";
  fromStatus: KycStatus;
  toStatus: KycStatus;
  note: string;
  decidedByRole: string;
  decidedAt: string;
}

export interface Transaction {
  id: string;
  customerId: string;
  amountCents: number;
  currency: string;
  description: string;
  status: string;
  createdAt: string;
}

export interface Refund {
  id: string;
  customerId: string;
  transactionId: string;
  amountCents: number;
  currency: string;
  status: "pending" | "processed" | "rejected";
  reason: string;
  createdAt: string;
  processedAt: string | null;
  processedByRole: string | null;
  processingNote: string | null;
  /** Paid-out amount once processed; less than amountCents for a partial refund. */
  approvedAmountCents: number | null;
  assignedTo: string | null;
  assignedAt: string | null;
}

/** Refund queue row: refund + customer name and current KYC status. */
export interface RefundRow extends Refund {
  customerName: string;
  customerKycStatus: KycStatus;
}

export interface RefundPayout {
  id: number;
  refundId: string;
  customerId: string;
  amountCents: number;
  currency: string;
  createdByRole: string;
  createdAt: string;
}

export interface FeatureFlag {
  key: string;
  enabled: boolean;
  description: string;
  updatedAt: string;
  updatedByRole: string | null;
}

const CUSTOMER_COLUMNS = `id, name, email, country, city, date_of_birth AS dateOfBirth, account_type AS accountType,
  account_ref AS accountRef, document_type AS documentType, document_ref AS documentRef, document_expiry AS documentExpiry,
  kyc_status AS kycStatus, risk_level AS riskLevel, risk_reason AS riskReason, review_type AS reviewType,
  review_reason AS reviewReason, review_opened_at AS reviewOpenedAt, applied_at AS appliedAt, updated_at AS updatedAt`;

export function getCustomer(db: Db, id: string): Customer | null {
  return (db.prepare(`SELECT ${CUSTOMER_COLUMNS} FROM customers WHERE id = ?`).get(id) as Customer) ?? null;
}

// ---- Customer queue search (validated from untrusted URL params) ----

export const CUSTOMER_SORTS = {
  opened_desc: "review_opened_at DESC",
  opened_asc: "review_opened_at ASC",
  updated_desc: "updated_at DESC",
} as const;
export const PAGE_SIZES = [10, 25, 50] as const;

export const customerQuerySchema = z.object({
  q: z.string().trim().max(100).catch(""),
  status: z.enum(["all", "open", ...KYC_STATUSES]).catch("all"),
  risk: z.enum(["all", ...RISK_LEVELS]).catch("all"),
  review: z.enum(["all", ...REVIEW_TYPES]).catch("all"),
  sort: z.enum(Object.keys(CUSTOMER_SORTS) as [keyof typeof CUSTOMER_SORTS]).catch("opened_desc"),
  page: z.coerce.number().int().min(1).catch(1),
  pageSize: z.coerce
    .number()
    .refine((n): n is (typeof PAGE_SIZES)[number] => (PAGE_SIZES as readonly number[]).includes(n))
    .catch(10),
});
export type CustomerQuery = z.infer<typeof customerQuerySchema>;

export function parseCustomerQuery(raw: Record<string, string | string[] | undefined>): CustomerQuery {
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  return customerQuerySchema.parse({
    q: first(raw.q) ?? "",
    status: first(raw.status),
    risk: first(raw.risk),
    review: first(raw.review),
    sort: first(raw.sort),
    page: first(raw.page),
    pageSize: first(raw.pageSize),
  });
}

function customerWhere(query: CustomerQuery): { whereSql: string; params: Record<string, string | number> } {
  const where: string[] = [];
  const params: Record<string, string | number> = {};
  if (query.q) {
    where.push("(name LIKE @like OR id LIKE @like)");
    params.like = `%${query.q}%`;
  }
  if (query.status === "open") where.push("kyc_status IN ('pending', 'info_requested')");
  else if (query.status !== "all") {
    where.push("kyc_status = @status");
    params.status = query.status;
  }
  if (query.risk !== "all") {
    where.push("risk_level = @risk");
    params.risk = query.risk;
  }
  if (query.review !== "all") {
    where.push("review_type = @review");
    params.review = query.review;
  }
  return { whereSql: where.length ? `WHERE ${where.join(" AND ")}` : "", params };
}

export function searchCustomers(db: Db, query: CustomerQuery): { rows: Customer[]; total: number; page: number } {
  const { whereSql, params } = customerWhere(query);
  const { total } = db.prepare(`SELECT COUNT(*) AS total FROM customers ${whereSql}`).get(params) as { total: number };
  const page = Math.min(query.page, Math.max(1, Math.ceil(total / query.pageSize)));
  const rows = db
    .prepare(
      `SELECT ${CUSTOMER_COLUMNS} FROM customers ${whereSql}
       ORDER BY ${CUSTOMER_SORTS[query.sort]}, id LIMIT @limit OFFSET @offset`,
    )
    .all({ ...params, limit: query.pageSize, offset: (page - 1) * query.pageSize }) as Customer[];
  return { rows, total, page };
}

export interface QueueNeighbours {
  /** 1-based position in the filtered queue, or null if the record no longer matches the filters. */
  position: number | null;
  total: number;
  prevId: string | null;
  /** Next record after this one; if it dropped out of the filters (e.g. just decided), the first remaining. */
  nextId: string | null;
}

/** Prev/next navigation for a case page, using the same filters and sort as the queue. */
export function getCustomerQueueNeighbours(db: Db, query: CustomerQuery, id: string): QueueNeighbours {
  const { whereSql, params } = customerWhere(query);
  const ids = (
    db.prepare(`SELECT id FROM customers ${whereSql} ORDER BY ${CUSTOMER_SORTS[query.sort]}, id`).all(params) as { id: string }[]
  ).map((r) => r.id);
  return neighboursIn(ids, id);
}

function neighboursIn(ids: string[], id: string): QueueNeighbours {
  const idx = ids.indexOf(id);
  if (idx === -1) return { position: null, total: ids.length, prevId: null, nextId: ids[0] ?? null };
  return { position: idx + 1, total: ids.length, prevId: ids[idx - 1] ?? null, nextId: ids[idx + 1] ?? null };
}

export function getKycSummary(db: Db): { pending: number; infoRequested: number; highRiskOpen: number; total: number } {
  return db
    .prepare(
      `SELECT COALESCE(SUM(kyc_status = 'pending'), 0) AS pending,
              COALESCE(SUM(kyc_status = 'info_requested'), 0) AS infoRequested,
              COALESCE(SUM(risk_level = 'high' AND kyc_status IN ('pending', 'info_requested')), 0) AS highRiskOpen,
              COUNT(*) AS total
       FROM customers`,
    )
    .get() as { pending: number; infoRequested: number; highRiskOpen: number; total: number };
}

// ---- Per-customer detail ----

export function listVerificationChecks(db: Db, customerId: string): VerificationCheck[] {
  return db
    .prepare(
      `SELECT customer_id AS customerId, check_type AS checkType, result, detail, checked_at AS checkedAt
       FROM verification_checks WHERE customer_id = ?
       ORDER BY CASE check_type WHEN 'identity' THEN 0 WHEN 'address' THEN 1 WHEN 'sanctions' THEN 2 ELSE 3 END`,
    )
    .all(customerId) as VerificationCheck[];
}

export function listKycDecisions(db: Db, customerId: string): KycDecisionRecord[] {
  return db
    .prepare(
      `SELECT id, customer_id AS customerId, decision, from_status AS fromStatus, to_status AS toStatus, note,
              decided_by_role AS decidedByRole, decided_at AS decidedAt
       FROM kyc_decisions WHERE customer_id = ? ORDER BY decided_at DESC, id DESC`,
    )
    .all(customerId) as KycDecisionRecord[];
}

const TXN_COLUMNS = `id, customer_id AS customerId, amount_cents AS amountCents, currency, description, status, created_at AS createdAt`;

export function listTransactionsForCustomer(db: Db, customerId: string): Transaction[] {
  return db.prepare(`SELECT ${TXN_COLUMNS} FROM transactions WHERE customer_id = ? ORDER BY created_at DESC, id`).all(customerId) as Transaction[];
}

export function getTransaction(db: Db, id: string): Transaction | null {
  return (db.prepare(`SELECT ${TXN_COLUMNS} FROM transactions WHERE id = ?`).get(id) as Transaction) ?? null;
}

const REFUND_COLUMNS = `r.id, r.customer_id AS customerId, r.transaction_id AS transactionId, r.amount_cents AS amountCents,
  r.currency, r.status, r.reason, r.created_at AS createdAt, r.processed_at AS processedAt,
  r.processed_by_role AS processedByRole, r.processing_note AS processingNote,
  r.approved_amount_cents AS approvedAmountCents, r.assigned_to AS assignedTo, r.assigned_at AS assignedAt`;

export function listRefundsForCustomer(db: Db, customerId: string): Refund[] {
  return db
    .prepare(`SELECT ${REFUND_COLUMNS} FROM refunds r WHERE r.customer_id = ? ORDER BY r.created_at DESC, r.id`)
    .all(customerId) as Refund[];
}

export function listRefundsForTransaction(db: Db, transactionId: string): Refund[] {
  return db
    .prepare(`SELECT ${REFUND_COLUMNS} FROM refunds r WHERE r.transaction_id = ? ORDER BY r.created_at, r.id`)
    .all(transactionId) as Refund[];
}

export function getRefund(db: Db, id: string): RefundRow | null {
  return (
    (db
      .prepare(
        `SELECT ${REFUND_COLUMNS}, c.name AS customerName, c.kyc_status AS customerKycStatus
         FROM refunds r JOIN customers c ON c.id = r.customer_id WHERE r.id = ?`,
      )
      .get(id) as RefundRow) ?? null
  );
}

export function listPayoutsForRefund(db: Db, refundId: string): RefundPayout[] {
  return db
    .prepare(
      `SELECT id, refund_id AS refundId, customer_id AS customerId, amount_cents AS amountCents, currency,
              created_by_role AS createdByRole, created_at AS createdAt
       FROM refund_payouts WHERE refund_id = ? ORDER BY id`,
    )
    .all(refundId) as RefundPayout[];
}

// ---- Refund queue search (validated from untrusted URL params) ----

export const REFUND_STATUSES = ["pending", "processed", "rejected"] as const;
export const REFUND_SORTS = {
  requested_desc: "r.created_at DESC",
  requested_asc: "r.created_at ASC",
  amount_desc: "r.amount_cents DESC",
} as const;

export const refundQuerySchema = z.object({
  q: z.string().trim().max(100).catch(""),
  status: z.enum([...REFUND_STATUSES, "all"]).catch("pending"),
  kyc: z.enum(["all", "approved", "not_approved"]).catch("all"),
  assigned: z.enum(["all", "unassigned", "claimed"]).catch("all"),
  sort: z.enum(Object.keys(REFUND_SORTS) as [keyof typeof REFUND_SORTS]).catch("requested_desc"),
  page: customerQuerySchema.shape.page,
  pageSize: customerQuerySchema.shape.pageSize,
});
export type RefundQuery = z.infer<typeof refundQuerySchema>;

export function parseRefundQuery(raw: Record<string, string | string[] | undefined>): RefundQuery {
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  return refundQuerySchema.parse({
    q: first(raw.q) ?? "",
    status: first(raw.status),
    kyc: first(raw.kyc),
    assigned: first(raw.assigned),
    sort: first(raw.sort),
    page: first(raw.page),
    pageSize: first(raw.pageSize),
  });
}

function refundFrom(query: RefundQuery): { from: string; params: Record<string, string | number> } {
  const where: string[] = [];
  const params: Record<string, string | number> = {};
  if (query.q) {
    where.push("(c.name LIKE @like OR r.id LIKE @like OR r.customer_id LIKE @like OR r.transaction_id LIKE @like)");
    params.like = `%${query.q}%`;
  }
  if (query.status !== "all") {
    where.push("r.status = @status");
    params.status = query.status;
  }
  if (query.kyc === "approved") where.push("c.kyc_status = 'approved'");
  else if (query.kyc === "not_approved") where.push("c.kyc_status != 'approved'");
  if (query.assigned === "unassigned") where.push("r.assigned_to IS NULL");
  else if (query.assigned === "claimed") where.push("r.assigned_to IS NOT NULL");
  return { from: `FROM refunds r JOIN customers c ON c.id = r.customer_id ${where.length ? `WHERE ${where.join(" AND ")}` : ""}`, params };
}

/** Prev/next for a refund page, using the same filters and sort as the refund queue. */
export function getRefundQueueNeighbours(db: Db, query: RefundQuery, id: string): QueueNeighbours {
  const { from, params } = refundFrom(query);
  const ids = (db.prepare(`SELECT r.id AS id ${from} ORDER BY ${REFUND_SORTS[query.sort]}, r.id`).all(params) as { id: string }[]).map((r) => r.id);
  return neighboursIn(ids, id);
}

export function searchRefunds(db: Db, query: RefundQuery): { rows: RefundRow[]; total: number; page: number } {
  const { from, params } = refundFrom(query);
  const { total } = db.prepare(`SELECT COUNT(*) AS total ${from}`).get(params) as { total: number };
  const page = Math.min(query.page, Math.max(1, Math.ceil(total / query.pageSize)));
  const rows = db
    .prepare(
      `SELECT ${REFUND_COLUMNS}, c.name AS customerName, c.kyc_status AS customerKycStatus ${from}
       ORDER BY ${REFUND_SORTS[query.sort]}, r.id LIMIT @limit OFFSET @offset`,
    )
    .all({ ...params, limit: query.pageSize, offset: (page - 1) * query.pageSize }) as RefundRow[];
  return { rows, total, page };
}

export function getRefundSummary(db: Db): { pending: number; pendingCents: number; processed: number; rejected: number } {
  return db
    .prepare(
      `SELECT COALESCE(SUM(status = 'pending'), 0) AS pending,
              COALESCE(SUM(CASE WHEN status = 'pending' THEN amount_cents END), 0) AS pendingCents,
              COALESCE(SUM(status = 'processed'), 0) AS processed,
              COALESCE(SUM(status = 'rejected'), 0) AS rejected
       FROM refunds`,
    )
    .get() as { pending: number; pendingCents: number; processed: number; rejected: number };
}

/** Ids of all pending refunds (for eligibility counts on the Refunds page). */
export function listPendingRefundIds(db: Db): string[] {
  return (db.prepare(`SELECT id FROM refunds WHERE status = 'pending' ORDER BY id`).all() as { id: string }[]).map((r) => r.id);
}

// ---- Feature flags ----

type FlagRow = Omit<FeatureFlag, "enabled"> & { enabled: number };
const FLAG_COLUMNS = `key, enabled, description, updated_at AS updatedAt, updated_by_role AS updatedByRole`;
const toFlag = (row: FlagRow): FeatureFlag => ({ ...row, enabled: row.enabled === 1 });

export function getFeatureFlag(db: Db, key: string): FeatureFlag | null {
  const row = db.prepare(`SELECT ${FLAG_COLUMNS} FROM feature_flags WHERE key = ?`).get(key) as FlagRow | undefined;
  return row ? toFlag(row) : null;
}

export function listFeatureFlags(db: Db): FeatureFlag[] {
  return (db.prepare(`SELECT ${FLAG_COLUMNS} FROM feature_flags ORDER BY key`).all() as FlagRow[]).map(toFlag);
}

// ---- Fraud Operations (alerts from the SIMULATED fraud monitoring system) ----

export const FRAUD_SEVERITIES = ["high", "medium", "low"] as const;
export type FraudSeverity = (typeof FRAUD_SEVERITIES)[number];
export const FRAUD_ALERT_STATUSES = ["open", "escalated", "dismissed"] as const;
export type FraudAlertStatus = (typeof FRAUD_ALERT_STATUSES)[number];

export interface FraudAlert {
  id: string;
  customerId: string;
  transactionId: string;
  severity: FraudSeverity;
  status: FraudAlertStatus;
  scenario: string;
  reason: string;
  createdAt: string;
  updatedAt: string;
}

/** Queue row: alert + customer + linked transaction. */
export interface FraudAlertRow extends FraudAlert {
  customerName: string;
  customerKycStatus: KycStatus;
  amountCents: number;
  currency: string;
}

export interface FraudSignal {
  alertId: string;
  code: string;
  label: string;
  detail: string;
  source: "simulated";
}

export interface FraudAlertDecision {
  id: number;
  alertId: string;
  decision: "open" | "dismiss" | "escalate";
  fromStatus: FraudAlertStatus | null;
  toStatus: FraudAlertStatus;
  note: string;
  decidedByRole: string;
  decidedAt: string;
}

export interface RiskHold {
  id: string;
  alertId: string;
  transactionId: string;
  customerId: string;
  status: "active" | "released";
  reason: string;
  createdByRole: string;
  createdAt: string;
  releasedAt: string | null;
}

const FRAUD_ALERT_COLUMNS = `a.id, a.customer_id AS customerId, a.transaction_id AS transactionId, a.severity, a.status, a.scenario,
  a.reason, a.created_at AS createdAt, a.updated_at AS updatedAt, c.name AS customerName, c.kyc_status AS customerKycStatus,
  t.amount_cents AS amountCents, t.currency`;
const FRAUD_FROM = `FROM fraud_alerts a JOIN customers c ON c.id = a.customer_id JOIN transactions t ON t.id = a.transaction_id`;

const SEVERITY_ORDER = `CASE a.severity WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END`;
export const FRAUD_SORTS = {
  priority: `CASE a.status WHEN 'open' THEN 0 WHEN 'escalated' THEN 1 ELSE 2 END, ${SEVERITY_ORDER}, a.created_at DESC`,
  created_desc: "a.created_at DESC",
  amount_desc: "t.amount_cents DESC",
} as const;

export const fraudAlertQuerySchema = z.object({
  q: z.string().trim().max(100).catch(""),
  severity: z.enum(["all", ...FRAUD_SEVERITIES]).catch("all"),
  status: z.enum(["all", ...FRAUD_ALERT_STATUSES]).catch("all"),
  sort: z.enum(Object.keys(FRAUD_SORTS) as [keyof typeof FRAUD_SORTS]).catch("priority"),
  page: customerQuerySchema.shape.page,
  pageSize: customerQuerySchema.shape.pageSize,
});
export type FraudAlertQuery = z.infer<typeof fraudAlertQuerySchema>;

export function parseFraudAlertQuery(raw: Record<string, string | string[] | undefined>): FraudAlertQuery {
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  return fraudAlertQuerySchema.parse({
    q: first(raw.q) ?? "",
    severity: first(raw.severity),
    status: first(raw.status),
    sort: first(raw.sort),
    page: first(raw.page),
    pageSize: first(raw.pageSize),
  });
}

function fraudWhere(query: FraudAlertQuery): { whereSql: string; params: Record<string, string | number> } {
  const where: string[] = [];
  const params: Record<string, string | number> = {};
  if (query.q) {
    where.push("(c.name LIKE @like OR a.id LIKE @like OR a.customer_id LIKE @like OR a.transaction_id LIKE @like)");
    params.like = `%${query.q}%`;
  }
  if (query.severity !== "all") {
    where.push("a.severity = @severity");
    params.severity = query.severity;
  }
  if (query.status !== "all") {
    where.push("a.status = @status");
    params.status = query.status;
  }
  return { whereSql: where.length ? `WHERE ${where.join(" AND ")}` : "", params };
}

export function searchFraudAlerts(db: Db, query: FraudAlertQuery): { rows: FraudAlertRow[]; total: number; page: number } {
  const { whereSql, params } = fraudWhere(query);
  const { total } = db.prepare(`SELECT COUNT(*) AS total ${FRAUD_FROM} ${whereSql}`).get(params) as { total: number };
  const page = Math.min(query.page, Math.max(1, Math.ceil(total / query.pageSize)));
  const rows = db
    .prepare(`SELECT ${FRAUD_ALERT_COLUMNS} ${FRAUD_FROM} ${whereSql} ORDER BY ${FRAUD_SORTS[query.sort]}, a.id LIMIT @limit OFFSET @offset`)
    .all({ ...params, limit: query.pageSize, offset: (page - 1) * query.pageSize }) as FraudAlertRow[];
  return { rows, total, page };
}

/** Prev/next for an alert page, using the same filters and sort as the fraud queue. */
export function getFraudAlertQueueNeighbours(db: Db, query: FraudAlertQuery, id: string): QueueNeighbours {
  const { whereSql, params } = fraudWhere(query);
  const ids = (db.prepare(`SELECT a.id AS id ${FRAUD_FROM} ${whereSql} ORDER BY ${FRAUD_SORTS[query.sort]}, a.id`).all(params) as { id: string }[]).map(
    (r) => r.id,
  );
  return neighboursIn(ids, id);
}

export function getFraudAlert(db: Db, id: string): FraudAlertRow | null {
  return (db.prepare(`SELECT ${FRAUD_ALERT_COLUMNS} ${FRAUD_FROM} WHERE a.id = ?`).get(id) as FraudAlertRow) ?? null;
}

export function listFraudAlertsForCustomer(db: Db, customerId: string): FraudAlertRow[] {
  return db.prepare(`SELECT ${FRAUD_ALERT_COLUMNS} ${FRAUD_FROM} WHERE a.customer_id = ? ORDER BY a.created_at DESC, a.id`).all(customerId) as FraudAlertRow[];
}

export function getFraudSummary(db: Db): { open: number; highOpen: number; escalated: number; activeHolds: number } {
  return db
    .prepare(
      `SELECT COALESCE(SUM(status = 'open'), 0) AS open,
              COALESCE(SUM(status = 'open' AND severity = 'high'), 0) AS highOpen,
              COALESCE(SUM(status = 'escalated'), 0) AS escalated,
              (SELECT COUNT(*) FROM risk_holds WHERE status = 'active') AS activeHolds
       FROM fraud_alerts`,
    )
    .get() as { open: number; highOpen: number; escalated: number; activeHolds: number };
}

export function listFraudSignals(db: Db, alertId: string): FraudSignal[] {
  return db.prepare(`SELECT alert_id AS alertId, code, label, detail, source FROM fraud_signals WHERE alert_id = ? ORDER BY rowid`).all(alertId) as FraudSignal[];
}

export function listFraudAlertDecisions(db: Db, alertId: string): FraudAlertDecision[] {
  return db
    .prepare(
      `SELECT id, alert_id AS alertId, decision, from_status AS fromStatus, to_status AS toStatus, note,
              decided_by_role AS decidedByRole, decided_at AS decidedAt
       FROM fraud_alert_decisions WHERE alert_id = ? ORDER BY decided_at DESC, id DESC`,
    )
    .all(alertId) as FraudAlertDecision[];
}

const HOLD_COLUMNS = `id, alert_id AS alertId, transaction_id AS transactionId, customer_id AS customerId, status, reason,
  created_by_role AS createdByRole, created_at AS createdAt, released_at AS releasedAt`;

export function listRiskHoldsForCustomer(db: Db, customerId: string): RiskHold[] {
  return db.prepare(`SELECT ${HOLD_COLUMNS} FROM risk_holds WHERE customer_id = ? ORDER BY created_at DESC, id`).all(customerId) as RiskHold[];
}

/** Current persisted active hold for a customer (most recent), or null. */
export function getActiveRiskHold(db: Db, customerId: string): RiskHold | null {
  return (
    (db
      .prepare(`SELECT ${HOLD_COLUMNS} FROM risk_holds WHERE customer_id = ? AND status = 'active' ORDER BY created_at DESC, id LIMIT 1`)
      .get(customerId) as RiskHold) ?? null
  );
}
