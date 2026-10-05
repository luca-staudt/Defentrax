const styles: Record<string, string> = {
  critical: "bg-red-500/20 text-red-300 border-red-500/40",
  high: "bg-orange-500/20 text-orange-200 border-orange-500/40",
  medium: "bg-amber-500/20 text-amber-200 border-amber-500/40",
  low: "bg-sky-500/20 text-sky-200 border-sky-500/40",
  info: "bg-zinc-500/20 text-zinc-300 border-zinc-500/40",
};

export function SeverityBadge({ severity }: { severity: string }) {
  const key = severity.toLowerCase();
  const cls = styles[key] || styles.info;
  return (
    <span
      className={`inline-flex rounded border px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${cls}`}
    >
      {severity}
    </span>
  );
}
