import { Flag, Home, type LucideIcon, ReceiptText, ShieldAlert, UserCheck } from "lucide-react";

// Navigation registry. Set `available: true` when a workflow page ships.
export interface WorkflowLink {
  name: string;
  href: string;
  description: string;
  available: boolean;
  icon: LucideIcon;
}

export const HOME_LINK = { name: "Overview", href: "/", icon: Home };

export const WORKFLOWS: WorkflowLink[] = [
  { name: "KYC Review", href: "/kyc", description: "Review identity checks; approve, reject or request information.", available: true, icon: UserCheck },
  { name: "Refunds", href: "/refunds", description: "Process pending refunds with central eligibility checks.", available: true, icon: ReceiptText },
  { name: "Feature Flags", href: "/feature-flags", description: "Toggle persisted operational flags (Risk Admin).", available: true, icon: Flag },
  { name: "Fraud Operations", href: "/fraud", description: "Investigate simulated fraud alerts; dismiss or escalate & hold (Risk Admin).", available: true, icon: ShieldAlert },
];
