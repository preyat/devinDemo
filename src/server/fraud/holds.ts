import type { Db } from "../db";
import { getActiveRiskHold, type RiskHold } from "../lookups";

export const ACCOUNT_RISK_HOLD_MESSAGE = "Account under risk review — refund processing paused.";

/** Shared risk-hold gate used by Refunds (canProcessRefund → ACCOUNT_RISK_HOLD). Reads persisted holds on every call. */
export function getRefundBlockingHold(db: Db, customerId: string): RiskHold | null {
  return getActiveRiskHold(db, customerId);
}
