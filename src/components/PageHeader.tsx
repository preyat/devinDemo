import type { ReactNode } from "react";

export function PageHeader({ title, description }: { title: string; description?: ReactNode }) {
  return (
    <div className="mb-4">
      <h1 className="h3 mb-1">{title}</h1>
      {description && <p className="text-muted mb-0">{description}</p>}
    </div>
  );
}
