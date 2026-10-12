"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Container, Nav, Navbar } from "react-bootstrap";
import { Landmark } from "lucide-react";
import { WORKFLOWS } from "@/lib/workflows";
import type { Role } from "@/server/roles";
import { DemoRoleSelector } from "./DemoRoleSelector";

export function PortalShell({ role, children }: { role: Role | null; children: ReactNode }) {
  return (
    <>
      <Navbar bg="dark" data-bs-theme="dark" expand="md" className="mb-4">
        <Container fluid>
          <Navbar.Brand as={Link} href="/" className="d-flex align-items-center gap-2">
            <Landmark size={20} /> Ops Portal
          </Navbar.Brand>
          <Nav className="me-auto">
            {WORKFLOWS.filter((w) => w.available).map((w) => (
              <Nav.Link as={Link} key={w.href} href={w.href}>
                {w.name}
              </Nav.Link>
            ))}
          </Nav>
          <DemoRoleSelector role={role} />
        </Container>
      </Navbar>
      <Container fluid className="pb-5">
        {children}
      </Container>
    </>
  );
}
