import Link from "next/link";
import { Badge, Card, CardBody, CardText, CardTitle, Col, Row } from "react-bootstrap";
import { PageHeader } from "@/components/PageHeader";
import { WORKFLOWS } from "@/lib/workflows";

export default function HomePage() {
  return (
    <>
      <PageHeader
        title="Internal Operations Portal"
        description="Prototype with synthetic data only. The role selector is a DEMO control, not authentication."
      />
      <Row xs={1} md={2} lg={4} className="g-3">
        {WORKFLOWS.map((w) => (
          <Col key={w.href}>
            <Card className="h-100">
              <CardBody>
                <CardTitle className="h6 d-flex justify-content-between">
                  {w.available ? <Link href={w.href}>{w.name}</Link> : w.name}
                  {!w.available && <Badge bg="secondary">Planned</Badge>}
                </CardTitle>
                <CardText className="small text-muted">{w.description}</CardText>
              </CardBody>
            </Card>
          </Col>
        ))}
      </Row>
    </>
  );
}
