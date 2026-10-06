"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/auth-context";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-[#030712] p-4">
      {/* Cyber Background Glow */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 h-[500px] w-[800px] rounded-full bg-sky-600/10 blur-[140px]" />
        <div className="cyber-grid absolute inset-0 opacity-40" />
      </div>

      <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-sky-500/20 bg-[#070b14]/90 p-8 shadow-2xl shadow-sky-950/60 backdrop-blur-2xl">
        {/* Header with Logo */}
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-sky-500/40 bg-sky-950/60 p-2.5 shadow-xl shadow-sky-500/10">
            <Image src="/sentinel-logo.png" alt="Defentrax Core" width={44} height={44} priority className="object-contain" />
          </div>
          <h1 className="font-display text-2xl font-bold tracking-widest text-white">DEFENTRAX</h1>
          <p className="mt-1 font-mono text-[11px] tracking-[0.2em] text-sky-400 uppercase">
            CORE GUARD SIEM PLATFORM
          </p>
          <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-sky-500/20 bg-sky-950/30 px-3 py-0.5 text-[10px] font-mono text-zinc-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            OPERATOR AUTHENTICATION GATEWAY
          </div>
        </div>

        {error ? (
          <div className="mt-6 rounded-xl border border-rose-500/40 bg-rose-950/30 p-3 text-center text-xs font-mono text-rose-300">
            {error}
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="block font-mono text-xs text-zinc-400 uppercase">Operator Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="operator@defentrax.internal"
              className="mt-1.5 w-full rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-2.5 text-sm text-white placeholder-zinc-600 transition focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>

          <div>
            <label className="block font-mono text-xs text-zinc-400 uppercase">Access Key / Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              className="mt-1.5 w-full rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-2.5 text-sm text-white placeholder-zinc-600 transition focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="mt-2 w-full rounded-xl border border-sky-400/40 bg-gradient-to-r from-sky-500 to-sky-600 py-2.5 text-sm font-semibold text-white shadow-lg shadow-sky-500/25 transition hover:brightness-110 disabled:opacity-50"
          >
            {submitting ? "Authenticating Session..." : "Authorize Operator Access"}
          </button>
        </form>

        <div className="mt-6 border-t border-zinc-800/60 pt-4 text-center">
          <p className="font-mono text-[10px] text-zinc-500">
            SECURED TELEMETRY ENCLAVE · DEFENTRAX CORE
          </p>
        </div>
      </div>
    </div>
  );
}
