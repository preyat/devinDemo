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
  { name: "Refunds", href: "/refunds", description: "Process pending refunds (Session 2).", available: false, icon: ReceiptText },
  { name: "Feature Flags", href: "/feature-flags", description: "Toggle operational flags (Session 2).", available: false, icon: Flag },
  { name: "Risk Review", href: "/risk", description: "Review high-value transactions (Session 3).", available: false, icon: ShieldAlert },
];
