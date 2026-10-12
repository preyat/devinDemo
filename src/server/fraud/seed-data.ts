// Fraud Operations demo cases. Every risk signal here is SIMULATED — there is no external fraud provider.
// Days are "days before SEED_TIMESTAMP"; hours offset within that day. Amounts are integer cents.

export interface FraudSeedTxn {
  id: string;
  amountCents: number;
  description: string;
  daysAgo: number;
  hour?: number;
}

export interface FraudSeedRefund {
  id: string;
  transactionId: string;
  amountCents: number;
  status: "pending" | "processed";
  reason: string;
  daysAgo: number;
  processedDaysAgo?: number;
}

export interface FraudSeedCase {
  alertId: string;
  customerId: string;
  transactionId: string;
  severity: "high" | "medium" | "low";
  /** Final seeded status. "escalated" cases are escalated through the real fraud service at `escalation.daysAgo`. */
  status: "open" | "escalated";
  scenario: string;
  reason: string;
  createdDaysAgo: number;
  createdHour: number;
  signals: { code: string; label: string; detail: string }[];
  /** Activity for customers created for Fraud Operations (Alex Kim reuses his existing Session 2 records). */
  transactions?: FraudSeedTxn[];
  refunds?: FraudSeedRefund[];
  escalation?: { daysAgo: number; hour: number; note: string };
}

export const FRAUD_SEED_CASES: FraudSeedCase[] = [
  {
    alertId: "alert_alex_4500",
    customerId: "cus_alex_kim",
    transactionId: "txn_alex_4500",
    severity: "high",
    status: "open",
    scenario: "Potential account takeover: new device and unusual location",
    reason:
      "A $4,500 wire transfer was sent from a device never seen on this account, logged in from Lagos, Nigeria — 2 hours after the customer's last login from their usual city. Together these suggest someone else may control the account.",
    createdDaysAgo: 2,
    createdHour: 0.1,
    signals: [
      { code: "NEW_DEVICE", label: "New device", detail: "First login from an unrecognised Android device (fingerprint dev_7f3a…); no prior sessions in 12 months." },
      { code: "UNUSUAL_LOCATION", label: "Unusual location", detail: "Login geolocated to Lagos, NG; the customer's last 40 logins were from their home city. Impossible travel within 2 hours." },
      { code: "HIGH_VALUE_TRANSFER", label: "High-value outbound wire", detail: "$4,500 wire is 6× the customer's largest previous transaction." },
    ],
  },
  {
    alertId: "alert_jamie_velocity",
    customerId: "cus_jamie_patel",
    transactionId: "txn_jamie_gc_6",
    severity: "medium",
    status: "open",
    scenario: "Unusual transaction velocity",
    reason:
      "Six gift-card purchases totalling $1,450 were made within 36 minutes. This customer normally makes 2–3 card payments a month, and rapid gift-card buying is a common way to cash out a compromised card.",
    createdDaysAgo: 1,
    createdHour: 0.65,
    signals: [
      { code: "HIGH_VELOCITY", label: "Transaction velocity", detail: "6 transactions in 36 minutes vs. a 90-day average of 0.1 per day." },
      { code: "GIFT_CARD_PATTERN", label: "Gift-card cash-out pattern", detail: "All six purchases at gift-card merchants in round amounts ($200–$300)." },
    ],
    transactions: [
      { id: "txn_jamie_1", amountCents: 6400, description: "Card purchase - groceries", daysAgo: 40 },
      { id: "txn_jamie_2", amountCents: 8500, description: "Utility bill payment", daysAgo: 26 },
      { id: "txn_jamie_3", amountCents: 1299, description: "Subscription renewal", daysAgo: 12 },
      { id: "txn_jamie_gc_1", amountCents: 20000, description: "Gift card purchase", daysAgo: 1, hour: 0 },
      { id: "txn_jamie_gc_2", amountCents: 25000, description: "Gift card purchase", daysAgo: 1, hour: 0.1 },
      { id: "txn_jamie_gc_3", amountCents: 20000, description: "Gift card purchase", daysAgo: 1, hour: 0.2 },
      { id: "txn_jamie_gc_4", amountCents: 30000, description: "Gift card purchase", daysAgo: 1, hour: 0.3 },
      { id: "txn_jamie_gc_5", amountCents: 25000, description: "Gift card purchase", daysAgo: 1, hour: 0.45 },
      { id: "txn_jamie_gc_6", amountCents: 25000, description: "Gift card purchase", daysAgo: 1, hour: 0.6 },
    ],
  },
  {
    alertId: "alert_maya_chen_9800",
    customerId: "cus_maya_chen",
    transactionId: "txn_maya_chen_9800",
    severity: "high",
    status: "open",
    scenario: "Large transaction inconsistent with historical activity",
    reason:
      "A $9,800 international transfer to a first-time beneficiary is about 70× this customer's typical transaction (under $150) and sits just below the $10,000 reporting threshold.",
    createdDaysAgo: 1.5,
    createdHour: 0.05,
    signals: [
      { code: "AMOUNT_ANOMALY", label: "Amount anomaly", detail: "$9,800 vs. a 12-month median of $54 and maximum of $142." },
      { code: "NEW_BENEFICIARY", label: "New beneficiary", detail: "Beneficiary added 25 minutes before the transfer; no prior payments to this country." },
      { code: "THRESHOLD_PROXIMITY", label: "Just below reporting threshold", detail: "Amount is within 2% of the $10,000 threshold (possible structuring)." },
    ],
    transactions: [
      { id: "txn_maya_chen_1", amountCents: 8640, description: "Card purchase - groceries", daysAgo: 60 },
      { id: "txn_maya_chen_2", amountCents: 14200, description: "Utility bill payment", daysAgo: 45 },
      { id: "txn_maya_chen_3", amountCents: 5400, description: "Online marketplace order", daysAgo: 30 },
      { id: "txn_maya_chen_4", amountCents: 1499, description: "Subscription renewal", daysAgo: 18 },
      { id: "txn_maya_chen_9800", amountCents: 980000, description: "International transfer", daysAgo: 1.5 },
    ],
    refunds: [
      { id: "ref_maya_chen_54", transactionId: "txn_maya_chen_3", amountCents: 5400, status: "processed", reason: "Item returned", daysAgo: 27, processedDaysAgo: 26 },
    ],
  },
  {
    alertId: "alert_sam_device",
    customerId: "cus_sam_taylor",
    transactionId: "txn_sam_taylor_62",
    severity: "low",
    status: "open",
    scenario: "Low confidence device anomaly",
    reason:
      "A routine $62 subscription renewal came from a browser with a changed fingerprint. Location, IP range and merchant all match the customer's history, so this is most likely a browser update.",
    createdDaysAgo: 0.5,
    createdHour: 0.05,
    signals: [
      { code: "DEVICE_FINGERPRINT_CHANGE", label: "Device fingerprint changed", detail: "Browser/OS version changed since last session; same IP range and city (low confidence)." },
    ],
    transactions: [
      { id: "txn_sam_taylor_1", amountCents: 9600, description: "Utility bill payment", daysAgo: 35 },
      { id: "txn_sam_taylor_2", amountCents: 4820, description: "Card purchase - groceries", daysAgo: 14 },
      { id: "txn_sam_taylor_62", amountCents: 6200, description: "Subscription renewal", daysAgo: 0.5 },
    ],
  },
  {
    alertId: "alert_priya_2750",
    customerId: "cus_priya_shah",
    transactionId: "txn_priya_shah_2750",
    severity: "high",
    status: "escalated",
    scenario: "Previously escalated suspicious activity",
    reason:
      "Four declined card attempts with a wrong CVV were followed by a $2,750 transfer to a newly added overseas beneficiary that matches two prior fraud reports. Escalated by Risk; the account is on hold.",
    createdDaysAgo: 4,
    createdHour: 0.1,
    signals: [
      { code: "FAILED_AUTH_ATTEMPTS", label: "Failed card attempts", detail: "4 declined attempts with incorrect CVV in 10 minutes before the transfer." },
      { code: "NEW_BENEFICIARY", label: "New beneficiary", detail: "Overseas beneficiary added 20 minutes before the transfer." },
      { code: "BENEFICIARY_RISK", label: "Beneficiary linked to fraud reports", detail: "Beneficiary account appears in 2 previously confirmed fraud cases (simulated consortium data)." },
    ],
    transactions: [
      { id: "txn_priya_shah_1", amountCents: 7200, description: "Card purchase - groceries", daysAgo: 20 },
      { id: "txn_priya_shah_120", amountCents: 12000, description: "Online marketplace order", daysAgo: 9 },
      { id: "txn_priya_shah_2750", amountCents: 275000, description: "International transfer", daysAgo: 4 },
    ],
    refunds: [{ id: "ref_priya_shah_120", transactionId: "txn_priya_shah_120", amountCents: 12000, status: "pending", reason: "Item not received", daysAgo: 7 }],
    escalation: {
      daysAgo: 3,
      hour: 2,
      note: "Confirmed with customer by phone: they did not add the beneficiary or attempt the card payments. Escalating and holding the account pending investigation.",
    },
  },
];
