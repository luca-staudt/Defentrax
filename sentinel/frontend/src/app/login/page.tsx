"use client";

import { FormEvent, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { apiFetch, ApiRequestError } from "@/lib/api/client";

type LoginResponse = {
  requires_totp?: boolean;
  login_challenge?: string;
};

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
    <div className="dx-auth">
      <aside className="dx-auth-aside">
        <div>
          <Image src="/defentrax-logo.png" alt="" width={36} height={36} />
          <p className="mt-4 mb-1 text-uppercase fs-12" style={{ letterSpacing: "0.16em", opacity: 0.6 }}>
            Defentrax
          </p>
          <h1 className="display-6 mb-3">See what is happening on the hosts you watch.</h1>
          <p className="mb-0" style={{ maxWidth: 420, opacity: 0.75 }}>
            Alerts, events, and the people who can act on them live in one workspace.
          </p>
        </div>
        <p className="mb-0 fs-12" style={{ opacity: 0.5 }}>
          © {new Date().getFullYear()} Defentrax
        </p>
      </aside>

      <main className="dx-auth-panel">
        <div className="w-100" style={{ maxWidth: 380 }}>
          <h2 className="h4 mb-1">{challenge ? "Confirm it is you" : "Sign in"}</h2>
          <p className="text-muted mb-4">
            {challenge ? "Enter the code from your authenticator." : "Use the operator account for this panel."}
          </p>
          {error ? <div className="alert alert-danger">{error}</div> : null}
          <form onSubmit={handleSubmit}>
            <label className="form-label" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              name="email"
              className="form-control mb-3"
              placeholder="name@company"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={Boolean(challenge)}
              autoComplete="username"
            />
            <label className="form-label" htmlFor="password-input">
              Password
            </label>
            <div className="input-group mb-3">
              <input
                name="password"
                type={passwordShow ? "text" : "password"}
                className="form-control"
                placeholder="Password"
                id="password-input"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={Boolean(challenge)}
                autoComplete={challenge ? "off" : "current-password"}
              />
              <button className="btn btn-light" type="button" onClick={() => setPasswordShow(!passwordShow)}>
                {passwordShow ? "Hide" : "Show"}
              </button>
            </div>
            {challenge ? (
              <>
                <label className="form-label" htmlFor="totp">
                  Authenticator code
                </label>
                <input
                  id="totp"
                  className="form-control mb-3"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                  value={totp}
                  onChange={(e) => setTotp(e.target.value)}
                  placeholder="123456"
                />
              </>
            ) : null}
            <button className="btn btn-primary w-100" type="submit" disabled={submitting}>
              {submitting ? "Working…" : challenge ? "Verify code" : "Sign in"}
            </button>
            {challenge ? (
              <button
                type="button"
                className="btn btn-link px-0 mt-2"
                onClick={() => {
                  setChallenge(null);
                  setTotp("");
                  setError(null);
                }}
              >
                Use a different account
              </button>
            ) : null}
          </form>
        </div>
      </main>
    </div>
  );
}
