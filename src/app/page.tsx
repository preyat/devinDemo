import Link from "next/link";
import { Badge, Card, CardBody, CardText, Col, Row } from "react-bootstrap";
import { PageHeader } from "@/components/PageHeader";
import { WORKFLOWS } from "@/lib/workflows";

export default function HomePage() {
  return (
    <>
      <PageHeader
        title="Internal Operations Portal"
        description="Prototype with synthetic data only. The role selector is a DEMO control, not authentication."
      />
      <Row xs={1} md={2} xl={4} className="g-3">
        {WORKFLOWS.map((w) => (
          <Col key={w.href}>
            <Card className="h-100 stat-card">
              <CardBody>
                <div className="d-flex justify-content-between align-items-start mb-3">
                  <span className="d-inline-flex align-items-center justify-content-center rounded-3 bg-primary-subtle text-primary" style={{ width: 40, height: 40 }}>
                    <w.icon size={20} />
                  </span>
                  {!w.available && <Badge bg="secondary-subtle" text="secondary">Planned</Badge>}
                </div>
                <div className="fw-semibold mb-1">
                  {w.available ? <Link href={w.href} className="stretched-link text-body text-decoration-none">{w.name}</Link> : w.name}
                </div>
                <CardText className="small text-muted">{w.description}</CardText>
              </CardBody>
            </Card>
          </Col>
        ))}
      </Row>
    </>
  );
}
