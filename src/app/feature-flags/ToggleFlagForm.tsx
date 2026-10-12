"use client";

import { Power, PowerOff } from "lucide-react";
import { DecisionForm, type DecisionOption } from "@/components/DecisionForm";
import type { FlagDecision } from "@/server/feature-flags/service";
import { toggleFeatureFlagAction } from "./actions";

const OPTIONS: Record<FlagDecision, DecisionOption> = {
  enable: { value: "enable", label: "Turn ON", variant: "danger", icon: <Power size={16} /> },
  disable: { value: "disable", label: "Turn OFF", variant: "outline-secondary", icon: <PowerOff size={16} /> },
};

interface Props {
  flagKey: string;
  /** From allowedFlagDecisions(enabled). */
  allowed: FlagDecision[];
  canToggle: boolean;
}

export function ToggleFlagForm({ flagKey, allowed, canToggle }: Props) {
  return (
    <DecisionForm
      action={toggleFeatureFlagAction}
      fields={{ key: flagKey }}
      options={allowed.map((d) => OPTIONS[d])}
      noteLabel="Reason for change (required)"
      notePlaceholder="e.g. Enforcing KYC before refunds per compliance memo."
      notice={
        !canToggle && (
          <p className="small text-muted mb-2" data-testid="role-notice">
            Only Risk Admin holds <code>feature_flag.toggle</code>; the server will reject this change.
          </p>
        )
      }
    />
  );
}
