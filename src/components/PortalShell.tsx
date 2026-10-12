"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Badge, Button, Nav } from "react-bootstrap";
import { Landmark, Menu } from "lucide-react";
import { HOME_LINK, WORKFLOWS } from "@/lib/workflows";
import type { Role } from "@/server/roles";
import { DemoRoleSelector } from "./DemoRoleSelector";
import type { Theme } from "@/lib/theme";
import { ThemeToggle } from "./ThemeToggle";

/** App chrome: Dashio-style sidebar (workflow nav) + sticky header (demo role, theme). */
export function PortalShell({ role, theme, children }: { role: Role | null; theme: Theme; children: ReactNode }) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  useEffect(() => setSidebarOpen(false), [pathname]);
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <div className="portal-wrapper">
      <aside className={`portal-sidebar border-end ${sidebarOpen ? "show" : ""}`}>
        <div className="p-3">
          <Link href="/" className="d-flex align-items-center gap-2 px-2 py-2 mb-2 text-decoration-none text-body">
            <span className="d-inline-flex align-items-center justify-content-center rounded-3 bg-primary text-white" style={{ width: 36, height: 36 }}>
              <Landmark size={20} />
            </span>
            <span className="fw-semibold fs-5">Ops Portal</span>
          </Link>
          <Nav as="nav" className="sidebar-nav flex-column gap-1" aria-label="Main">
            <Nav.Link as={Link} href={HOME_LINK.href} active={isActive(HOME_LINK.href)}>
              <HOME_LINK.icon size={18} /> {HOME_LINK.name}
            </Nav.Link>
            <div className="nav-header">Workflows</div>
            {WORKFLOWS.map((w) =>
              w.available ? (
                <Nav.Link as={Link} key={w.href} href={w.href} active={isActive(w.href)}>
                  <w.icon size={18} /> {w.name}
                </Nav.Link>
              ) : (
                <Nav.Link key={w.href} disabled className="justify-content-between">
                  <span className="d-flex align-items-center gap-3">
                    <w.icon size={18} /> {w.name}
                  </span>
                  <Badge bg="secondary-subtle" text="secondary" className="fw-normal">Soon</Badge>
                </Nav.Link>
              ),
            )}
          </Nav>
        </div>
      </aside>
      {sidebarOpen && <div className="sidebar-backdrop d-lg-none" onClick={() => setSidebarOpen(false)} />}

      <div className="portal-main d-flex flex-column">
        <header className="portal-header sticky-top border-bottom px-3 px-lg-4 py-2 d-flex align-items-center gap-2">
          <Button variant="link" className="d-lg-none text-body p-1" onClick={() => setSidebarOpen(true)} aria-label="Open navigation">
            <Menu size={20} />
          </Button>
          <div className="ms-auto d-flex align-items-center gap-2">
            <DemoRoleSelector role={role} />
            <ThemeToggle initial={theme} />
          </div>
        </header>
        <main className="flex-grow-1 p-3 p-lg-4">{children}</main>
      </div>
    </div>
  );
}
