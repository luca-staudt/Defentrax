export function LoadingBlock({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 rounded-xl border border-zinc-800 bg-zinc-950/40 px-6 py-16">
      <span className="h-2 w-2 animate-pulse rounded-full bg-brand-400" />
      <span className="text-sm text-zinc-400">{label}</span>
    </div>
  );
}
