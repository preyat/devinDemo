// Registry of persisted feature flags (seeded into feature_flags). Pure constants: safe to import anywhere on the server.
// A flag only takes effect where a service reads it with isFeatureEnabled(); list that effect in `effect`.

export const BLOCK_REFUNDS_UNVERIFIED_KYC = "block_refunds_unverified_kyc";
export const PAUSE_REFUND_PROCESSING = "pause_refund_processing";
export const BLOCK_HIGH_VALUE_REFUNDS = "block_high_value_refunds";

/** Refunds above this amount are blocked while BLOCK_HIGH_VALUE_REFUNDS is ON. */
export const HIGH_VALUE_REFUND_LIMIT_CENTS = 100_000;

export interface FeatureFlagDefinition {
  key: string;
  label: string;
  description: string;
  /** Where the flag is enforced and the block code it produces. */
  effect: string;
  /** canProcessRefund reason code this flag can produce. */
  blockCode: string;
  seedEnabled: boolean;
}

export const FEATURE_FLAGS: FeatureFlagDefinition[] = [
  {
    key: BLOCK_REFUNDS_UNVERIFIED_KYC,
    label: "Block refunds for unverified KYC",
    description: "When ON, refunds cannot be processed for customers whose current KYC status is not approved.",
    effect: "Refunds → canProcessRefund: KYC_NOT_APPROVED (via isKycRestricted).",
    blockCode: "KYC_NOT_APPROVED",
    seedEnabled: false,
  },
  {
    key: PAUSE_REFUND_PROCESSING,
    label: "Pause refund processing",
    description: "Emergency stop: when ON, no refund can be processed (e.g. during a payment-provider incident).",
    effect: "Refunds → canProcessRefund: REFUNDS_PAUSED.",
    blockCode: "REFUNDS_PAUSED",
    seedEnabled: false,
  },
  {
    key: BLOCK_HIGH_VALUE_REFUNDS,
    label: "Block high-value refunds",
    description: "When ON, refunds above $1,000.00 cannot be processed in the portal and must be escalated.",
    effect: "Refunds → canProcessRefund: AMOUNT_OVER_LIMIT.",
    blockCode: "AMOUNT_OVER_LIMIT",
    seedEnabled: true,
  },
];

export const FEATURE_FLAG_KEYS = FEATURE_FLAGS.map((f) => f.key) as [string, ...string[]];

export function getFeatureFlagDefinition(key: string): FeatureFlagDefinition | undefined {
  return FEATURE_FLAGS.find((f) => f.key === key);
}
