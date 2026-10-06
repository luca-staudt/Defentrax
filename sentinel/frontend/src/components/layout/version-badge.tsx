"use client";

import { useEffect, useState } from "react";

const FALLBACK = "v0.1.0";

export function VersionBadge() {
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

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900/80 px-2.5 py-1 font-mono text-[11px] text-zinc-300 transition hover:border-zinc-700 hover:text-white"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
      <span>Engine {version}</span>
    </a>
  );
}
