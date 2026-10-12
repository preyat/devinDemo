// Hand-written synthetic customers (all fictional). seed.ts expands these into rows.
// Invariant: approved customers use the "clean" scenario (all mandatory checks passed at approval).

export type Scenario =
  | "clean"
  | "address_missing"
  | "address_failed"
  | "identity_missing"
  | "identity_failed"
  | "doc_expired"
  | "doc_forged"
  | "sanctions_review"
  | "pep_review";

export type SeedDecision = "approve" | "reject" | "request_info";

export interface SeedCustomer {
  id?: string; // defaults to cus_<first>_<last>
  name: string;
  country: string;
  city: string;
  accountType: "personal" | "business";
  document: "Passport" | "National ID" | "Driver licence" | "Residence permit";
  status: "pending" | "info_requested" | "approved" | "rejected";
  risk: "low" | "medium" | "high";
  riskReason: string;
  scenario: Scenario;
  appliedDaysAgo: number;
  /** Overrides for the generated check explanations. */
  detail?: Partial<Record<"identity" | "address" | "sanctions" | "pep", string>>;
  /** Decision history, oldest first: [decision, daysAgo, note]. Defaults are derived from status. */
  history?: [SeedDecision, number, string][];
  /** Preserved demo customers get hand-written transactions instead of generated ones. */
  fixedTransactions?: boolean;
}

export const SEED_CUSTOMERS: SeedCustomer[] = [
  // ---- Pending review (15) ----
  {
    id: "cus_maya_reed", name: "Maya Reed", country: "US", city: "New York", accountType: "personal", document: "Passport",
    status: "pending", risk: "medium", riskReason: "New customer; first purchase is large relative to stated income.",
    scenario: "clean", appliedDaysAgo: 6, fixedTransactions: true,
  },
  {
    name: "Samira Patel", country: "GB", city: "Leicester", accountType: "personal", document: "Passport",
    status: "pending", risk: "medium", riskReason: "Recent change of address; regular cross-border payments to India expected.",
    scenario: "address_missing", appliedDaysAgo: 5,
  },
  {
    name: "Viktor Sokolov", country: "CY", city: "Limassol", accountType: "business", document: "Passport",
    status: "pending", risk: "high", riskReason: "Director of an offshore holding company; potential sanctions match.",
    scenario: "sanctions_review", appliedDaysAgo: 4,
    detail: { sanctions: "Potential sanctions match requires review (91% name + DOB match, OFAC SDN list)." },
  },
  {
    name: "Lucas Moreau", country: "FR", city: "Lyon", accountType: "personal", document: "Passport",
    status: "pending", risk: "medium", riskReason: "Identity document on file has expired.",
    scenario: "doc_expired", appliedDaysAgo: 3,
  },
  {
    name: "Hannah Schmidt", country: "DE", city: "Munich", accountType: "personal", document: "National ID",
    status: "pending", risk: "low", riskReason: "Salaried employee; domestic activity only.", scenario: "clean", appliedDaysAgo: 2,
  },
  {
    name: "Diego Alvarez", country: "ES", city: "Valencia", accountType: "personal", document: "National ID",
    status: "pending", risk: "low", riskReason: "Low expected volume; long-standing external bank account.", scenario: "clean", appliedDaysAgo: 8,
  },
  {
    name: "Aisha Bello", country: "NG", city: "Lagos", accountType: "business", document: "Passport",
    status: "pending", risk: "high", riskReason: "High-risk jurisdiction; possible politically exposed family member.",
    scenario: "pep_review", appliedDaysAgo: 7, detail: { pep: "Possible PEP match requires review: relative of a state legislator." },
  },
  {
    name: "Tomás Novak", country: "CZ", city: "Prague", accountType: "personal", document: "Driver licence",
    status: "pending", risk: "medium", riskReason: "Biometric mismatch during onboarding.", scenario: "identity_failed", appliedDaysAgo: 9,
  },
  {
    name: "Grace Okafor", country: "IE", city: "Dublin", accountType: "personal", document: "Passport",
    status: "pending", risk: "medium", riskReason: "Address inconsistencies between documents.", scenario: "address_failed", appliedDaysAgo: 10,
  },
  {
    name: "Kenji Watanabe", country: "JP", city: "Osaka", accountType: "business", document: "Passport",
    status: "pending", risk: "medium", riskReason: "Import/export business with international suppliers.", scenario: "clean", appliedDaysAgo: 11,
  },
  {
    name: "Olivia Bennett", country: "AU", city: "Melbourne", accountType: "personal", document: "Driver licence",
    status: "pending", risk: "low", riskReason: "Student account; low expected volume.", scenario: "identity_missing", appliedDaysAgo: 1,
  },
  {
    name: "Rafael Costa", country: "BR", city: "São Paulo", accountType: "personal", document: "Passport",
    status: "pending", risk: "medium", riskReason: "Non-resident applicant; frequent FX conversion expected.", scenario: "address_missing", appliedDaysAgo: 12,
  },
  {
    name: "Emma Lindqvist", country: "SE", city: "Stockholm", accountType: "personal", document: "National ID",
    status: "pending", risk: "low", riskReason: "Domestic salaried customer.", scenario: "clean", appliedDaysAgo: 3,
  },
  {
    name: "Noah Fischer", country: "CH", city: "Zurich", accountType: "business", document: "Passport",
    status: "pending", risk: "medium", riskReason: "Wealth management client with multiple linked accounts.", scenario: "clean", appliedDaysAgo: 13,
  },
  {
    name: "Priya Nair", country: "IN", city: "Bengaluru", accountType: "personal", document: "Passport",
    status: "pending", risk: "medium", riskReason: "Common-name screening hit; likely false positive.", scenario: "sanctions_review", appliedDaysAgo: 2,
    detail: { sanctions: "Partial name match (62%) on EU consolidated list requires review." },
  },

  // ---- Awaiting more information (10) ----
  {
    name: "Liam O'Connor", country: "IE", city: "Cork", accountType: "personal", document: "Driver licence",
    status: "info_requested", risk: "low", riskReason: "Domestic customer; low expected volume.", scenario: "address_missing", appliedDaysAgo: 15,
    history: [["request_info", 13, "Please provide a utility bill or bank statement dated within the last 3 months."]],
  },
  {
    name: "Fatima Zahra", country: "MA", city: "Casablanca", accountType: "personal", document: "Passport",
    status: "info_requested", risk: "medium", riskReason: "Expired passport submitted; remittance corridor activity.", scenario: "doc_expired", appliedDaysAgo: 18,
    history: [["request_info", 16, "Customer to provide a valid, unexpired passport or national ID."]],
  },
  {
    name: "Chen Wei", country: "SG", city: "Singapore", accountType: "business", document: "Passport",
    status: "info_requested", risk: "medium", riskReason: "Newly incorporated trading company.", scenario: "address_missing", appliedDaysAgo: 20,
    detail: { address: "Proof of registered business address outstanding." },
    history: [["request_info", 17, "Provide proof of registered business address (ACRA extract or lease)."]],
  },
  {
    name: "Isabella Rossi", country: "IT", city: "Milan", accountType: "personal", document: "National ID",
    status: "info_requested", risk: "low", riskReason: "Domestic salaried customer.", scenario: "identity_missing", appliedDaysAgo: 9,
    history: [["request_info", 8, "Upload a clear photo of the national ID card (front and back)."]],
  },
  {
    name: "Mateo García", country: "MX", city: "Guadalajara", accountType: "personal", document: "Passport",
    status: "info_requested", risk: "medium", riskReason: "Address mismatch; cross-border income.", scenario: "address_failed", appliedDaysAgo: 22,
    history: [["request_info", 19, "Provide proof of address matching the address on the application."]],
  },
  {
    name: "Zoe Martin", country: "CA", city: "Toronto", accountType: "personal", document: "Driver licence",
    status: "info_requested", risk: "low", riskReason: "Recently relocated from another province.", scenario: "address_missing", appliedDaysAgo: 7,
    history: [["request_info", 6, "Please send a recent utility bill showing the new Toronto address."]],
  },
  {
    name: "Oskar Nowak", country: "PL", city: "Warsaw", accountType: "business", document: "National ID",
    status: "info_requested", risk: "medium", riskReason: "Sole director; document quality issues.", scenario: "identity_failed", appliedDaysAgo: 14,
    detail: { identity: "Identity verification failed: document image too blurry to read." },
    history: [["request_info", 12, "Re-submit a legible, uncropped image of the national ID."]],
  },
  {
    name: "Amara Diallo", country: "SN", city: "Dakar", accountType: "personal", document: "Passport",
    status: "info_requested", risk: "high", riskReason: "High-risk remittance corridor; source of funds unclear.", scenario: "address_missing", appliedDaysAgo: 25,
    history: [["request_info", 21, "Provide proof of address and evidence of source of funds (payslips or bank statements)."]],
  },
  {
    name: "Ethan Brooks", country: "US", city: "Austin", accountType: "personal", document: "Driver licence",
    status: "info_requested", risk: "low", riskReason: "Expired driver licence on file.", scenario: "doc_expired", appliedDaysAgo: 11,
    history: [["request_info", 10, "Driver licence expired; provide a current licence or passport."]],
  },
  {
    name: "Yara Haddad", country: "AE", city: "Dubai", accountType: "business", document: "Passport",
    status: "info_requested", risk: "high", riskReason: "Large expected volumes; complex ownership structure.", scenario: "address_missing", appliedDaysAgo: 30,
    history: [["request_info", 27, "Provide proof of business address and an ownership structure chart."]],
  },

  // ---- Rejected (5) ----
  {
    name: "Marcus Hale", country: "US", city: "Miami", accountType: "personal", document: "Passport",
    status: "rejected", risk: "high", riskReason: "Suspected document forgery.", scenario: "doc_forged", appliedDaysAgo: 40,
    history: [["reject", 38, "Document security features failed validation; suspected forgery. Onboarding declined."]],
  },
  {
    name: "Dmitri Volkov", country: "LV", city: "Riga", accountType: "business", document: "Passport",
    status: "rejected", risk: "high", riskReason: "Confirmed sanctions list match.", scenario: "sanctions_review", appliedDaysAgo: 55,
    detail: { sanctions: "Sanctions match confirmed against EU consolidated list." },
    history: [["reject", 50, "Compliance confirmed sanctions match; relationship declined and reported internally."]],
  },
  {
    name: "Sophie Laurent", country: "BE", city: "Brussels", accountType: "personal", document: "National ID",
    status: "rejected", risk: "medium", riskReason: "Unable to verify identity.", scenario: "identity_missing", appliedDaysAgo: 60,
    history: [
      ["request_info", 58, "Upload national ID (front and back)."],
      ["reject", 35, "No response to information request within 21 days."],
    ],
  },
  {
    name: "Ahmed Karimi", country: "NL", city: "Rotterdam", accountType: "personal", document: "Passport",
    status: "rejected", risk: "high", riskReason: "Repeated biometric mismatch.", scenario: "identity_failed", appliedDaysAgo: 45,
    history: [["reject", 42, "Selfie mismatch on two attempts; identity could not be verified."]],
  },
  {
    name: "Nina Petrova", country: "BG", city: "Sofia", accountType: "personal", document: "National ID",
    status: "rejected", risk: "medium", riskReason: "Inconsistent address information.", scenario: "address_failed", appliedDaysAgo: 70,
    history: [
      ["request_info", 66, "Provide proof of address matching application."],
      ["reject", 52, "Re-submitted documents still inconsistent; address could not be verified."],
    ],
  },

  // ---- Approved (20) ----
  {
    id: "cus_jordan_lee", name: "Jordan Lee", country: "CA", city: "Vancouver", accountType: "personal", document: "Driver licence",
    status: "approved", risk: "low", riskReason: "Long-standing customer; low transaction volume.", scenario: "clean", appliedDaysAgo: 120, fixedTransactions: true,
  },
  {
    id: "cus_alex_kim", name: "Alex Kim", country: "GB", city: "London", accountType: "personal", document: "National ID",
    status: "approved", risk: "low", riskReason: "Salaried professional; regular domestic spending.", scenario: "clean", appliedDaysAgo: 95, fixedTransactions: true,
  },
  { name: "Ben Carter", country: "US", city: "Chicago", accountType: "personal", document: "Driver licence", status: "approved", risk: "low", riskReason: "Domestic salaried customer.", scenario: "clean", appliedDaysAgo: 150 },
  { name: "Chloe Dubois", country: "FR", city: "Paris", accountType: "personal", document: "National ID", status: "approved", risk: "low", riskReason: "Domestic customer; stable income.", scenario: "clean", appliedDaysAgo: 88 },
  {
    name: "David Cohen", country: "IL", city: "Tel Aviv", accountType: "business", document: "Passport", status: "approved", risk: "medium",
    riskReason: "Software exporter receiving USD payments.", scenario: "clean", appliedDaysAgo: 75,
    history: [
      ["request_info", 73, "Provide certificate of incorporation."],
      ["approve", 68, "Incorporation documents received and verified; all checks passed."],
    ],
  },
  { name: "Elena Popescu", country: "RO", city: "Bucharest", accountType: "personal", document: "National ID", status: "approved", risk: "low", riskReason: "Low expected volume.", scenario: "clean", appliedDaysAgo: 64 },
  { name: "Felix Wagner", country: "AT", city: "Vienna", accountType: "personal", document: "Passport", status: "approved", risk: "low", riskReason: "Domestic salaried customer.", scenario: "clean", appliedDaysAgo: 140 },
  { name: "Gabriela Souza", country: "PT", city: "Lisbon", accountType: "personal", document: "National ID", status: "approved", risk: "medium", riskReason: "Frequent cross-border transfers to Brazil.", scenario: "clean", appliedDaysAgo: 110 },
  { name: "Hiro Tanaka", country: "JP", city: "Tokyo", accountType: "personal", document: "Passport", status: "approved", risk: "low", riskReason: "Domestic customer; low volume.", scenario: "clean", appliedDaysAgo: 52 },
  { name: "Ingrid Hansen", country: "NO", city: "Oslo", accountType: "personal", document: "Passport", status: "approved", risk: "low", riskReason: "Domestic salaried customer.", scenario: "clean", appliedDaysAgo: 160 },
  {
    name: "Jamal Wright", country: "US", city: "Atlanta", accountType: "business", document: "Driver licence", status: "approved", risk: "medium",
    riskReason: "Cash-intensive retail business.", scenario: "clean", appliedDaysAgo: 82,
    history: [
      ["request_info", 80, "Provide business licence and proof of business address."],
      ["approve", 74, "Business licence and address verified; screening clear."],
    ],
  },
  { name: "Katarzyna Zielińska", country: "PL", city: "Kraków", accountType: "personal", document: "National ID", status: "approved", risk: "low", riskReason: "Domestic customer.", scenario: "clean", appliedDaysAgo: 47 },
  { name: "Leo Murphy", country: "IE", city: "Galway", accountType: "personal", document: "Passport", status: "approved", risk: "low", riskReason: "Domestic salaried customer.", scenario: "clean", appliedDaysAgo: 99 },
  { name: "Mia Johansson", country: "SE", city: "Gothenburg", accountType: "personal", document: "National ID", status: "approved", risk: "low", riskReason: "Low expected volume.", scenario: "clean", appliedDaysAgo: 36 },
  {
    name: "Nikhil Rao", country: "IN", city: "Mumbai", accountType: "business", document: "Passport", status: "approved", risk: "high",
    riskReason: "High-value international trade; enhanced due diligence completed.", scenario: "clean", appliedDaysAgo: 130,
    history: [
      ["request_info", 127, "Enhanced due diligence: provide source-of-funds evidence and audited accounts."],
      ["approve", 115, "EDD complete; source of funds verified; senior compliance sign-off obtained."],
    ],
  },
  { name: "Omar Farouk", country: "EG", city: "Cairo", accountType: "personal", document: "Passport", status: "approved", risk: "medium", riskReason: "Regular inbound remittances.", scenario: "clean", appliedDaysAgo: 58 },
  { name: "Paula Jiménez", country: "ES", city: "Madrid", accountType: "personal", document: "National ID", status: "approved", risk: "low", riskReason: "Domestic salaried customer.", scenario: "clean", appliedDaysAgo: 71 },
  { name: "Quinn Taylor", country: "NZ", city: "Auckland", accountType: "personal", document: "Driver licence", status: "approved", risk: "low", riskReason: "Low expected volume.", scenario: "clean", appliedDaysAgo: 44 },
  { name: "Rosa Bianchi", country: "IT", city: "Rome", accountType: "personal", document: "National ID", status: "approved", risk: "low", riskReason: "Domestic customer.", scenario: "clean", appliedDaysAgo: 105 },
  {
    name: "Sven Eriksen", country: "DK", city: "Copenhagen", accountType: "business", document: "Passport", status: "approved", risk: "medium",
    riskReason: "Holding company; beneficial owners verified.", scenario: "clean", appliedDaysAgo: 175,
  },
];
