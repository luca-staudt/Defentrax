"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { apiFetch, ApiRequestError } from "@/lib/api/client";
import type { User } from "@/lib/types";

type LoginResponse = {
  user?: User;
  requires_totp?: boolean;
  login_challenge?: string;
};

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totp, setTotp] = useState("");
  const [recovery, setRecovery] = useState("");
  const [challenge, setChallenge] = useState<string | null>(null);
  const [useRecovery, setUseRecovery] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (challenge) {
        if (useRecovery) {
          await apiFetch("/auth/recovery/verify", {
            method: "POST",
            body: JSON.stringify({
              login_challenge: challenge,
              recovery_code: recovery,
            }),
          });
        } else {
          await apiFetch("/auth/totp/verify", {
            method: "POST",
            body: JSON.stringify({ login_challenge: challenge, code: totp }),
          });
        }
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
      if (err instanceof ApiRequestError) {
        setError(err.message);
      } else {
        setError("Sign-in failed");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_20%_20%,_#0c4a6e33,_transparent_45%),_#030712] px-4">
      <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-black/70 p-8 shadow-2xl shadow-brand-500/10 backdrop-blur">
        <div className="mb-8 flex flex-col items-center text-center">
          <Image src="/sentinel-logo.png" alt="Sentinel" width={72} height={72} priority />
          <h1 className="font-display mt-4 text-2xl font-bold tracking-[0.25em] text-white">
            SENTINEL
          </h1>
          <p className="mt-1 text-xs uppercase tracking-[0.4em] text-brand-400">
            Monitor · Detect · Protect
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          {!challenge ? (
            <>
              <label className="block text-sm text-zinc-400">
                Email
                <input
                  type="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100 outline-none ring-brand-500 focus:ring-2"
                />
              </label>
              <label className="block text-sm text-zinc-400">
                Password
                <input
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100 outline-none ring-brand-500 focus:ring-2"
                />
              </label>
            </>
          ) : useRecovery ? (
            <label className="block text-sm text-zinc-400">
              Recovery code
              <input
                required
                value={recovery}
                onChange={(e) => setRecovery(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100 outline-none ring-brand-500 focus:ring-2"
              />
            </label>
          ) : (
            <label className="block text-sm text-zinc-400">
              Authentication code
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                value={totp}
                onChange={(e) => setTotp(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100 outline-none ring-brand-500 focus:ring-2"
              />
            </label>
          )}

          {error ? <p className="text-sm text-red-400">{error}</p> : null}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-brand-500 py-2.5 text-sm font-semibold text-black transition hover:bg-brand-400 disabled:opacity-60"
          >
            {loading ? "Please wait…" : challenge ? "Verify" : "Sign in"}
          </button>

          {challenge ? (
            <button
              type="button"
              className="w-full text-xs text-zinc-500 hover:text-brand-300"
              onClick={() => setUseRecovery((v) => !v)}
            >
              {useRecovery ? "Use authenticator app instead" : "Use a recovery code"}
            </button>
          ) : null}
        </form>
      </div>
    </div>
  );
}
