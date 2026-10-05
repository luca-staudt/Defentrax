const styles: Record<string, string> = {
  OPEN: "text-brand-300 border-brand-400/50 bg-brand-500/10",
  ACKNOWLEDGED: "text-sky-200 border-sky-400/40 bg-sky-500/10",
  INVESTIGATING: "text-amber-200 border-amber-400/40 bg-amber-500/10",
  RESOLVED: "text-emerald-200 border-emerald-400/40 bg-emerald-500/10",
};

export function StatusBadge({ status }: { status: string }) {
  const cls = styles[status] || "text-zinc-300 border-zinc-600 bg-zinc-800";
  return (
    <span className={`inline-flex rounded border px-2 py-0.5 text-xs font-medium ${cls}`}>
      {status.replace("_", " ")}
    </span>
  );
}
