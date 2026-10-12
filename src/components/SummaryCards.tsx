import { Card, CardBody, Col, Row } from "react-bootstrap";

export interface SummaryItem {
  label: string;
  value: number | string;
  /** Bootstrap text colour for the value, e.g. "warning", "danger". */
  variant?: string;
}

export function SummaryCards({ items }: { items: SummaryItem[] }) {
  return (
    <Row xs={2} md={items.length} className="g-3 mb-3">
      {items.map((item) => (
        <Col key={item.label}>
          <Card className="h-100">
            <CardBody className="py-2">
              <div className="small text-muted">{item.label}</div>
              <div className={`fs-4 fw-semibold ${item.variant ? `text-${item.variant}` : ""}`} data-testid={`summary-${item.label}`}>
                {item.value}
              </div>
            </CardBody>
          </Card>
        </Col>
      ))}
    </Row>
  );
}
