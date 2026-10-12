import type { Db } from "../db";
import { getCustomer, getFeatureFlag } from "../lookups";
import { BLOCK_REFUNDS_UNVERIFIED_KYC } from "../feature-flags/definitions";

/**
 * Shared KYC gate used by Refunds (canProcessRefund). When block_refunds_unverified_kyc is ON,
 * any customer whose CURRENT status is not "approved" (pending, info_requested, rejected) is restricted.
 */
export function isKycRestricted(db: Db, customerId: string): boolean {
  if (!getFeatureFlag(db, BLOCK_REFUNDS_UNVERIFIED_KYC)?.enabled) return false;
  return getCustomer(db, customerId)?.kycStatus !== "approved";
}
