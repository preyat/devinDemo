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
}

export interface FeatureFlag {
  key: string;
  enabled: boolean;
  description: string;
  updatedAt: string;
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

export function searchCustomers(db: Db, query: CustomerQuery): { rows: Customer[]; total: number; page: number } {
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
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
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

export function listRefundsForCustomer(db: Db, customerId: string): Refund[] {
  return db
    .prepare(
      `SELECT id, customer_id AS customerId, transaction_id AS transactionId, amount_cents AS amountCents, currency,
              status, reason, created_at AS createdAt, processed_at AS processedAt
       FROM refunds WHERE customer_id = ? ORDER BY created_at DESC, id`,
    )
    .all(customerId) as Refund[];
}

export function getFeatureFlag(db: Db, key: string): FeatureFlag | null {
  const row = db
    .prepare(`SELECT key, enabled, description, updated_at AS updatedAt FROM feature_flags WHERE key = ?`)
    .get(key) as (Omit<FeatureFlag, "enabled"> & { enabled: number }) | undefined;
  return row ? { ...row, enabled: row.enabled === 1 } : null;
}
