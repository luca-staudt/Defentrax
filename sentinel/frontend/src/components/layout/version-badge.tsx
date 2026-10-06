"use client";

import { useEffect, useState } from "react";

const FALLBACK = "v0.1.0";

export function useLatestRelease() {
  const [version, setVersion] = useState<string>(FALLBACK);
  const [url, setUrl] = useState<string>("https://github.com/luca-staudt/Defentrax/releases");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          "https://api.github.com/repos/luca-staudt/Defentrax/releases/latest",
          { headers: { Accept: "application/vnd.github+json" }, cache: "no-store" },
        );
        if (!res.ok) return;
        const data = (await res.json()) as { tag_name?: string; html_url?: string };
        if (!cancelled && data.tag_name) {
          setVersion(data.tag_name);
          if (data.html_url) setUrl(data.html_url);
        }
      } catch {
        // keep fallback
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { version, url };
}

export function VersionBadge() {
  const { version, url } = useLatestRelease();
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title="Latest GitHub release"
      className="inline-flex items-center gap-1.5 rounded-full border border-sky-500/25 bg-sky-950/40 px-3 py-1 font-mono text-[10px] font-semibold tracking-wider text-sky-300 transition hover:border-sky-400/60 hover:bg-sky-900/40 hover:text-sky-200"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-sky-400 shadow-[0_0_6px_#00a3ff]" />
      GUARD ENGINE {version.toUpperCase()}
      <svg className="h-2.5 w-2.5 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
      </svg>
    </a>
  );
}
