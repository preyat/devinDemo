// Scaffold a new workflow on the shared architecture:
//   npm run new:workflow -- <slug> [--entity <entity_type>] [--role <role>]
// e.g. npm run new:workflow -- refunds --entity refund --role payments_operator
// Generates service + test (server), action + page + decision form (app) and registers a permission.
// The generated code compiles, lints and its tests pass; fill in the TODOs next.
import fs from "node:fs";
import path from "node:path";
import { ROLES } from "../src/server/roles";

const args = process.argv.slice(2);
const slug = args[0];
const flag = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
if (!slug || !/^[a-z][a-z0-9-]*$/.test(slug)) {
  console.error("Usage: npm run new:workflow -- <kebab-slug> [--entity <entity_type>] [--role <role>]");
  process.exit(1);
}
const key = slug.replace(/-/g, "_");
const entity = flag("entity", key);
const role = flag("role", "kyc_reviewer");
if (!(ROLES as readonly string[]).includes(role)) {
  console.error(`--role must be one of: ${ROLES.join(", ")}`);
  process.exit(1);
}
const Name = slug.split("-").map((p) => p[0].toUpperCase() + p.slice(1)).join("");
const title = slug.split("-").map((p) => p[0].toUpperCase() + p.slice(1)).join(" ");
const permission = `${key}.decide`;

const files: Record<string, string> = {
  [`src/server/${slug}/service.ts`]: `import { z } from "zod";
import type { Db } from "../db";
import { OperationError } from "../errors";
import { runAuditedOperation, type OperationResult } from "../operation";
import { assertCan } from "../permissions";
import type { Role } from "../roles";

// TODO: replace statuses/decisions with this workflow's real ones (reference: src/server/kyc/service.ts).
export const ${Name.toUpperCase()}_DECISIONS = ["approve", "reject"] as const;
export type ${Name}Decision = (typeof ${Name.toUpperCase()}_DECISIONS)[number];
export type ${Name}Status = "pending" | "approved" | "rejected";

const DECISION_TARGET: Record<${Name}Decision, ${Name}Status> = { approve: "approved", reject: "rejected" };

// Allowed transitions; terminal states are read-only.
const TRANSITIONS: Record<${Name}Status, ${Name}Status[]> = {
  pending: ["approved", "rejected"],
  approved: [],
  rejected: [],
};

/** Decisions the current status allows. The page uses this to render buttons; the service enforces it. */
export function allowed${Name}Decisions(status: ${Name}Status): ${Name}Decision[] {
  return ${Name.toUpperCase()}_DECISIONS.filter((d) => TRANSITIONS[status].includes(DECISION_TARGET[d]));
}

/** Business-rule reasons that block a decision (shown by the page, enforced by the service). */
export function get${Name}Blockers(): string[] {
  return []; // TODO: e.g. isKycRestricted(db, customerId) ? ["customer KYC is not approved"] : []
}

export const ${key.replace(/_(\w)/g, (_, c: string) => c.toUpperCase())}DecisionSchema = z.object({
  id: z.string().trim().min(1, "Record is required."),
  decision: z.enum(${Name.toUpperCase()}_DECISIONS, { message: "Decision must be approve or reject." }),
  note: z
    .string({ message: "A note is required for every decision." })
    .trim()
    .min(1, "A note is required for every decision.")
    .max(500, "Note must be 500 characters or fewer."),
});

export function decide${Name}(db: Db, actorRole: Role | null, rawInput: unknown, now: Date = new Date()): OperationResult {
  const raw = (rawInput ?? {}) as Record<string, unknown>;
  const entityId = typeof raw.id === "string" ? raw.id : null;
  const action = (${Name.toUpperCase()}_DECISIONS as readonly unknown[]).includes(raw.decision) ? \`${key}.\${raw.decision}\` : "${key}.decide";

  return runAuditedOperation({
    db,
    actorRole,
    action,
    entityType: "${entity}",
    entityId,
    execute: () => {
      assertCan(actorRole, "${permission}");
      const parsed = ${key.replace(/_(\w)/g, (_, c: string) => c.toUpperCase())}DecisionSchema.safeParse(rawInput);
      if (!parsed.success) throw new OperationError("validation", parsed.error.issues.map((i) => i.message).join(" "));
      const input = parsed.data;
      // TODO: load the record (add a query to src/server/lookups.ts), throw not_found if missing,
      // check TRANSITIONS and get${Name}Blockers() (rule_violation), then a guarded
      // UPDATE ... WHERE id = ? AND status = ? using now.toISOString(), and return { message, details }.
      void now;
      throw new OperationError("not_found", \`${title} \${input.id} not found (workflow not implemented yet).\`);
    },
  });
}
`,
  [`tests/${slug}.test.ts`]: `import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { listAuditEvents } from "@/server/audit";
import type { Db } from "@/server/db";
import { can } from "@/server/permissions";
import { ROLES } from "@/server/roles";
import { decide${Name} } from "@/server/${slug}/service";
import { createTestDb } from "./helpers";

describe("${title} decisions", () => {
  let db: Db;
  beforeEach(() => (db = createTestDb()));
  afterEach(() => db.close());

  const forbidden = [...ROLES.filter((r) => !can(r, "${permission}")), null];
  it.each(forbidden)("forbids role %s in the backend and audits the denial", (role) => {
    const result = decide${Name}(db, role, { id: "TODO_seed_id", decision: "approve", note: "attempt" });
    expect(result).toMatchObject({ ok: false, code: "forbidden" });
    expect(listAuditEvents(db)[0]).toMatchObject({ action: "${key}.approve", outcome: "denied", actorRole: role });
  });

  it("requires a note for every decision", () => {
    expect(decide${Name}(db, "${role}", { id: "TODO_seed_id", decision: "reject" })).toMatchObject({ ok: false, code: "validation" });
  });

  it.todo("succeeds for the allowed role and persists the new status + success audit event");
  it.todo("blocks invalid transitions (terminal states are read-only)");
  it.todo("blocks decisions that violate business rules with rule_violation");
});
`,
  [`src/app/${slug}/actions.ts`]: `"use server";

import { revalidatePath } from "next/cache";
import { getDemoRole } from "@/lib/session";
import { getDb } from "@/server/db";
import type { OperationResult } from "@/server/operation";
import { decide${Name} } from "@/server/${slug}/service";

// Thin adapter: read untrusted inputs, delegate to the service, revalidate.
export async function decide${Name}Action(_prev: OperationResult | null, formData: FormData): Promise<OperationResult> {
  const result = decide${Name}(getDb(), await getDemoRole(), {
    id: formData.get("id"),
    decision: formData.get("decision"),
    note: formData.get("note") ?? "",
  });
  revalidatePath("/${slug}");
  return result;
}
`,
  [`src/app/${slug}/${Name}DecisionForm.tsx`]: `"use client";

import { Check, X } from "lucide-react";
import { DecisionForm, type DecisionOption } from "@/components/DecisionForm";
import type { ${Name}Decision } from "@/server/${slug}/service";
import { decide${Name}Action } from "./actions";

const OPTIONS: Record<${Name}Decision, DecisionOption> = {
  approve: { value: "approve", label: "Approve", variant: "success", icon: <Check size={16} /> },
  reject: { value: "reject", label: "Reject", variant: "outline-danger", icon: <X size={16} /> },
};

interface Props {
  id: string;
  /** From allowed${Name}Decisions(status) — empty means read-only. */
  allowed: ${Name}Decision[];
  canDecide: boolean;
}

export function ${Name}DecisionForm({ id, allowed, canDecide }: Props) {
  return (
    <DecisionForm
      action={decide${Name}Action}
      fields={{ id }}
      options={allowed.map((d) => OPTIONS[d])}
      noteLabel="Decision note (required)"
      readOnlyMessage={allowed.length === 0 ? "This record is closed and read-only." : undefined}
      notice={
        !canDecide && (
          <p className="small text-muted mb-2">
            Your demo role lacks <code>${permission}</code>; the server will reject these actions.
          </p>
        )
      }
    />
  );
}
`,
  [`src/app/${slug}/page.tsx`]: `import { Card, CardBody } from "react-bootstrap";
import { PageHeader } from "@/components/PageHeader";

export const dynamic = "force-dynamic";

// TODO: queue page (SummaryCards, QueueFilters, QueueTable with getRowHref → /${slug}/<id>, QueuePagination) plus a
// case page at src/app/${slug}/[id]/page.tsx (RecordNav, RecordTabs, RecordFields, ${Name}DecisionForm),
// mirroring src/app/kyc/page.tsx and src/app/kyc/[customerId]/page.tsx. Read data via src/server/lookups.ts.
export default async function ${Name}Page() {
  return (
    <>
      <PageHeader title="${title}" description="TODO: one-line description of this workflow." />
      <Card>
        <CardBody className="text-muted">Workflow scaffolded — not implemented yet.</CardBody>
      </Card>
    </>
  );
}
`,
};

for (const file of Object.keys(files)) {
  if (fs.existsSync(file)) {
    console.error(`Refusing to overwrite existing ${file}`);
    process.exit(1);
  }
}
for (const [file, content] of Object.entries(files)) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  console.log(`created ${file}`);
}

const permissionsFile = "src/server/permissions.ts";
const anchor = "export const PERMISSIONS = {\n";
const perms = fs.readFileSync(permissionsFile, "utf8");
if (!perms.includes(`"${permission}"`)) {
  fs.writeFileSync(permissionsFile, perms.replace(anchor, `${anchor}  "${permission}": ["${role}"],\n`));
  console.log(`registered permission "${permission}": ["${role}"] in ${permissionsFile}`);
}

console.log(`
Next steps:
  1. Write the spec (.agents/skills/plan-internal-tool/SKILL.md) if not done.
  2. Implement TODOs in src/server/${slug}/service.ts + tests/${slug}.test.ts (npm test).
  3. Build src/app/${slug}/page.tsx from shared components; set available: true for "/${slug}" in src/lib/workflows.ts.
  4. npm run typecheck && npm run lint && npm test && npm run smoke (add a smoke check in scripts/smoke.mjs).`);
