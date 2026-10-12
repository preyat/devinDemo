"use client";

import { useRouter } from "next/navigation";
import type { HTMLAttributes, MouseEvent } from "react";

/** Table row that navigates on click anywhere (the first-cell Link still provides keyboard access). */
export function ClickableRow({ href, className, children, ...rest }: HTMLAttributes<HTMLTableRowElement> & { href: string }) {
  const router = useRouter();
  const onClick = (e: MouseEvent<HTMLTableRowElement>) => {
    if ((e.target as HTMLElement).closest("a, button, input, select, textarea")) return;
    router.push(href);
  };
  return (
    <tr {...rest} className={`row-link ${className ?? ""}`} onClick={onClick}>
      {children}
    </tr>
  );
}
