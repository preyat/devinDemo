import "@fontsource-variable/inter";
import "@/styles/portal.scss";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { PortalShell } from "@/components/PortalShell";
import { parseTheme, THEME_COOKIE } from "@/lib/theme";
import { getDemoRole } from "@/lib/session";

export const metadata: Metadata = {
  title: "Ops Portal (demo)",
  description: "Internal operations portal prototype with synthetic data.",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const role = await getDemoRole();
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  return (
    <html lang="en" data-bs-theme={theme}>
      <body>
        <PortalShell role={role} theme={theme}>
          {children}
        </PortalShell>
      </body>
    </html>
  );
}
