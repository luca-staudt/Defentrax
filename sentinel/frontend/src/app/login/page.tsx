"use client";

import { FormEvent, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { apiFetch, ApiRequestError } from "@/lib/api/client";
import { LanguageSelect, useI18n } from "@/lib/i18n";

type LoginResponse = {
  requires_totp?: boolean;
  login_challenge?: string;
};

export default function LoginPage() {
  const router = useRouter();
  const { t } = useI18n();
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
          <h1 className="display-6 mb-3">{t("login.aside")}</h1>
          <p className="mb-0" style={{ maxWidth: 420, opacity: 0.75 }}>
            {t("login.asideBody")}
          </p>
        </div>
        <p className="mb-0 fs-12" style={{ opacity: 0.5 }}>
          © {new Date().getFullYear()} Defentrax
        </p>
      </aside>

      <main className="dx-auth-panel">
        <div className="w-100" style={{ maxWidth: 380 }}>
          <div className="d-flex justify-content-end mb-3">
            <LanguageSelect />
          </div>
          <h2 className="h4 mb-1">{challenge ? t("login.confirm") : t("login.signIn")}</h2>
          <p className="text-muted mb-4">{challenge ? t("login.codeLead") : t("login.lead")}</p>
          {error ? <div className="alert alert-danger">{error}</div> : null}
          <form onSubmit={handleSubmit}>
            <label className="form-label" htmlFor="email">
              {t("login.email")}
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
              {t("login.password")}
            </label>
            <div className="input-group mb-3">
              <input
                name="password"
                type={passwordShow ? "text" : "password"}
                className="form-control"
                placeholder={t("login.password")}
                id="password-input"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={Boolean(challenge)}
                autoComplete={challenge ? "off" : "current-password"}
              />
              <button className="btn btn-light" type="button" onClick={() => setPasswordShow(!passwordShow)}>
                {passwordShow ? t("login.hide") : t("login.show")}
              </button>
            </div>
            {challenge ? (
              <>
                <label className="form-label" htmlFor="totp">
                  {t("login.code")}
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
              {submitting ? t("login.working") : challenge ? t("login.verify") : t("login.submit")}
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
                {t("login.other")}
              </button>
            ) : null}
          </form>
        </div>
      </main>
    </div>
  );
}
