// Navigation registry. Set `available: true` when a workflow page ships.
export interface WorkflowLink {
  name: string;
  href: string;
  description: string;
  available: boolean;
}

export const WORKFLOWS: WorkflowLink[] = [
  { name: "KYC Review", href: "/kyc", description: "Approve or reject pending customer identity checks.", available: true },
  { name: "Refunds", href: "/refunds", description: "Process pending refunds (Session 2).", available: false },
  { name: "Feature Flags", href: "/feature-flags", description: "Toggle operational flags (Session 2).", available: false },
  { name: "Risk Review", href: "/risk", description: "Review high-value transactions (Session 3).", available: false },
];
