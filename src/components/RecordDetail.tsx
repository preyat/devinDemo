import type { ReactNode } from "react";
import { Card, CardBody, CardHeader } from "react-bootstrap";

export interface DetailField {
  label: string;
  value: ReactNode;
}

export function RecordDetail({ title, fields, children }: { title: ReactNode; fields: DetailField[]; children?: ReactNode }) {
  return (
    <Card>
      <CardHeader as="h2" className="h6 mb-0">
        {title}
      </CardHeader>
      <CardBody>
        <dl className="row mb-0">
          {fields.map((f) => (
            <div key={f.label} className="contents">
              <dt className="col-sm-5 text-muted fw-normal">{f.label}</dt>
              <dd className="col-sm-7">{f.value ?? "—"}</dd>
            </div>
          ))}
        </dl>
        {children}
      </CardBody>
    </Card>
  );
}
