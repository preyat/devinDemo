import type { Db } from "./db";

export type KycStatus = "pending" | "approved" | "rejected";

export interface Customer {
  id: string;
  name: string;
  email: string;
  country: string;
  dateOfBirth: string;
  documentType: string;
  documentLast4: string;
  kycStatus: KycStatus;
  kycDecidedAt: string | null;
  kycDecidedByRole: string | null;
  kycDecisionNote: string | null;
  createdAt: string;
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

const CUSTOMER_COLUMNS = `id, name, email, country, date_of_birth AS dateOfBirth, document_type AS documentType,
  document_last4 AS documentLast4, kyc_status AS kycStatus, kyc_decided_at AS kycDecidedAt,
  kyc_decided_by_role AS kycDecidedByRole, kyc_decision_note AS kycDecisionNote, created_at AS createdAt`;

export function listCustomers(db: Db): Customer[] {
  return db
    .prepare(
      `SELECT ${CUSTOMER_COLUMNS} FROM customers
       ORDER BY CASE kyc_status WHEN 'pending' THEN 0 ELSE 1 END, name`,
    )
    .all() as Customer[];
}

export function getCustomer(db: Db, id: string): Customer | null {
  return (db.prepare(`SELECT ${CUSTOMER_COLUMNS} FROM customers WHERE id = ?`).get(id) as Customer) ?? null;
}

export function listTransactionsForCustomer(db: Db, customerId: string): Transaction[] {
  return db
    .prepare(
      `SELECT id, customer_id AS customerId, amount_cents AS amountCents, currency, description, status, created_at AS createdAt
       FROM transactions WHERE customer_id = ? ORDER BY created_at, id`,
    )
    .all(customerId) as Transaction[];
}

export function getTransaction(db: Db, id: string): Transaction | null {
  return (
    (db
      .prepare(
        `SELECT id, customer_id AS customerId, amount_cents AS amountCents, currency, description, status, created_at AS createdAt
         FROM transactions WHERE id = ?`,
      )
      .get(id) as Transaction) ?? null
  );
}

export function listRefundsForCustomer(db: Db, customerId: string): Refund[] {
  return db
    .prepare(
      `SELECT id, customer_id AS customerId, transaction_id AS transactionId, amount_cents AS amountCents, currency,
              status, reason, created_at AS createdAt, processed_at AS processedAt
       FROM refunds WHERE customer_id = ? ORDER BY created_at, id`,
    )
    .all(customerId) as Refund[];
}
