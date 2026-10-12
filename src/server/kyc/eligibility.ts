import type { Db } from "../db";
import { getCustomer, getFeatureFlag } from "../lookups";
import { KYC_RESTRICTION_FLAG } from "../seed";

/**
 * Shared KYC gate for other workflows (e.g. Refunds). When the kyc_restriction flag is ON,
 * any customer whose CURRENT status is not "approved" (pending, info_requested, rejected) is restricted.
 */
export function isKycRestricted(db: Db, customerId: string): boolean {
  if (!getFeatureFlag(db, KYC_RESTRICTION_FLAG)?.enabled) return false;
  return getCustomer(db, customerId)?.kycStatus !== "approved";
}
