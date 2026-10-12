import "bootstrap/dist/css/bootstrap.min.css";
import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { PortalShell } from "@/components/PortalShell";
import { getDemoRole } from "@/lib/session";

export const metadata: Metadata = {
  title: "Ops Portal (demo)",
  description: "Internal operations portal prototype with synthetic data.",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const role = await getDemoRole();
  return (
    <html lang="en">
      <body className="bg-light">
        <PortalShell role={role}>{children}</PortalShell>
      </body>
    </html>
  );
}
