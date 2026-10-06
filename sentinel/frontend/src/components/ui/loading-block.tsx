export function LoadingBlock({
  label = "Scanning telemetry stream...",
}: {
  label?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-zinc-800/80 bg-zinc-950/60 p-12 text-center backdrop-blur-md">
      <div className="relative mb-4 flex h-12 w-12 items-center justify-center">
        <div className="absolute inset-0 rounded-full border border-sky-500/20" />
        <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-sky-400" />
        <div className="h-4 w-4 rounded-full bg-sky-400/20" />
      </div>
      <p className="font-mono text-xs tracking-widest text-zinc-400 uppercase">{label}</p>
      <p className="mt-1 text-[11px] text-zinc-600">Connecting to Defentrax Core pipeline</p>
    </div>
  );
}
