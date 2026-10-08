"use client";

import { Col, Container, Row } from "reactstrap";

export function Footer() {
  return (
    <footer className="footer">
      <Container fluid>
        <Row>
          <Col sm={6}>{new Date().getFullYear()} © Defentrax.</Col>
          <Col sm={6}>
            <div className="text-sm-end d-none d-sm-block">
              <a href="https://defentrax.de" target="_blank" rel="noopener noreferrer">
                defentrax.de
              </a>
            </div>
          </Col>
        </Row>
      </Container>
    </footer>
  );
}
