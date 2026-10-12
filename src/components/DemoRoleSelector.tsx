"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Form } from "react-bootstrap";
import { setDemoRole } from "@/app/actions/role";
import { ROLE_LABELS, ROLES, type Role } from "@/server/roles";

export function DemoRoleSelector({ role }: { role: Role | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Form.Group className="d-flex align-items-center gap-2" controlId="demo-role">
      <Form.Label className="mb-0 small text-warning fw-semibold text-nowrap">DEMO role (not auth)</Form.Label>
      <Form.Select
        size="sm"
        value={role ?? ""}
        disabled={pending}
        onChange={(e) =>
          startTransition(async () => {
            await setDemoRole(e.target.value);
            router.refresh();
          })
        }
      >
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {ROLE_LABELS[r]}
          </option>
        ))}
      </Form.Select>
    </Form.Group>
  );
}
