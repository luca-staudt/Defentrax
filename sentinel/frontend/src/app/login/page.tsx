"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert, Button, Card, CardBody, Col, Container, Form, Input, Label, Row, Spinner } from "reactstrap";
import { apiFetch, ApiRequestError } from "@/lib/api/client";

type LoginResponse = {
  requires_totp?: boolean;
  login_challenge?: string;
};

function ParticlesAuth({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-page-wrapper pt-5">
      <div className="auth-one-bg-position auth-one-bg" id="auth-particles">
        <div className="bg-overlay"></div>
        <div className="shape">
          <svg xmlns="http://www.w3.org/2000/svg" version="1.1" xmlnsXlink="http://www.w3.org/1999/xlink" viewBox="0 0 1440 120">
            <path d="M 0,36 C 144,53.6 432,123.2 720,124 C 1008,124.8 1296,56.8 1440,40L1440 140L0 140z"></path>
          </svg>
        </div>
        {children}
      </div>
      <footer className="footer">
        <div className="container">
          <div className="row">
            <div className="col-lg-12">
              <div className="text-center">
                <p className="mb-0 text-muted">
                  &copy; {new Date().getFullYear()} Defentrax.{" "}
                  <a href="https://defentrax.de" className="text-muted">
                    defentrax.de
                  </a>
                </p>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totp, setTotp] = useState("");
  const [challenge, setChallenge] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [passwordShow, setPasswordShow] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (challenge) {
        await apiFetch("/auth/totp/verify", {
          method: "POST",
          body: JSON.stringify({ login_challenge: challenge, code: totp }),
        });
        router.replace("/dashboard");
        router.refresh();
        return;
      }

      const res = await apiFetch<LoginResponse>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      if (res.requires_totp && res.login_challenge) {
        setChallenge(res.login_challenge);
        return;
      }
      router.replace("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Authentication failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ParticlesAuth>
      <div className="auth-page-content mt-lg-5">
        <Container>
          <Row>
            <Col lg={12}>
              <div className="text-center mt-sm-5 mb-4 text-white-50">
                <div>
                  <Link href="/" className="d-inline-block auth-logo">
                    <img src="/defentrax-logo.png" alt="Defentrax" height={28} width={28} />
                  </Link>
                </div>
                <p className="mt-3 fs-15 fw-medium">Security & Infrastructure Management</p>
              </div>
            </Col>
          </Row>

          <Row className="justify-content-center">
            <Col md={8} lg={6} xl={5}>
              <Card className="mt-4 card-bg-fill">
                <CardBody className="p-4">
                  <div className="text-center mt-2">
                    <h5 className="text-primary">Welcome Back !</h5>
                    <p className="text-muted">Sign in to continue to Defentrax.</p>
                  </div>
                  {error ? <Alert color="danger">{error}</Alert> : null}
                  <div className="p-2 mt-4">
                    <Form onSubmit={handleSubmit}>
                      <div className="mb-3">
                        <Label htmlFor="email" className="form-label">
                          Email
                        </Label>
                        <Input
                          id="email"
                          name="email"
                          className="form-control"
                          placeholder="Enter email"
                          type="email"
                          required
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          disabled={Boolean(challenge)}
                        />
                      </div>

                      <div className="mb-3">
                        <Label className="form-label" htmlFor="password-input">
                          Password
                        </Label>
                        <div className="position-relative auth-pass-inputgroup mb-3">
                          <Input
                            name="password"
                            type={passwordShow ? "text" : "password"}
                            className="form-control pe-5 password-input"
                            placeholder="Enter password"
                            id="password-input"
                            required
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            disabled={Boolean(challenge)}
                          />
                          <button
                            className="btn btn-link position-absolute end-0 top-0 text-decoration-none text-muted password-addon material-shadow-none"
                            type="button"
                            id="password-addon"
                            onClick={() => setPasswordShow(!passwordShow)}
                          >
                            <i className="ri-eye-fill align-middle"></i>
                          </button>
                        </div>
                      </div>

                      {challenge ? (
                        <div className="mb-3">
                          <Label htmlFor="totp" className="form-label">
                            Authenticator code
                          </Label>
                          <Input
                            id="totp"
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            required
                            value={totp}
                            onChange={(e) => setTotp(e.target.value)}
                            placeholder="123456"
                          />
                        </div>
                      ) : null}

                      <div className="mt-4">
                        <Button color="success" className="w-100" type="submit" disabled={submitting}>
                          {submitting ? <Spinner size="sm" className="me-2" /> : null}
                          {challenge ? "Verify code" : "Sign In"}
                        </Button>
                      </div>
                    </Form>
                  </div>
                </CardBody>
              </Card>
            </Col>
          </Row>
        </Container>
      </div>
    </ParticlesAuth>
  );
}
