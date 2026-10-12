import type { ReactNode } from "react";
import { Card, CardBody, CardHeader } from "react-bootstrap";

export interface DetailField {
  label: string;
  value: ReactNode;
}

/** Label/value list (usable on its own, e.g. inside tabs). */
export function RecordFields({ fields }: { fields: DetailField[] }) {
  return (
    <dl className="row g-0 mb-0 small">
      {fields.map((f) => (
        <div key={f.label} className="contents">
          <dt className="col-sm-4 text-muted fw-normal">{f.label}</dt>
          <dd className="col-sm-8">{f.value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

export function RecordDetail({ title, fields, children }: { title: ReactNode; fields: DetailField[]; children?: ReactNode }) {
  return (
    <Card>
      <CardHeader as="h2" className="h6 mb-0">
        {title}
      </CardHeader>
      <CardBody>
        <RecordFields fields={fields} />
        {children}
      </CardBody>
    </Card>
  );
}
