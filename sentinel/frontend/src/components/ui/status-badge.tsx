type AlertStatus = "OPEN" | "ACKNOWLEDGED" | "INVESTIGATING" | "RESOLVED" | "SILENCED";

const statusConfig: Record<
  AlertStatus,
  { label: string; text: string; bg: string; border: string; dot: string }
> = {
  OPEN: {
    label: "OPEN",
    text: "text-rose-400",
    bg: "bg-rose-500/10",
    border: "border-rose-500/30",
    dot: "bg-rose-400 animate-ping",
  },
  ACKNOWLEDGED: {
    label: "ACKNOWLEDGED",
    text: "text-amber-300",
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
    dot: "bg-amber-400",
  },
  INVESTIGATING: {
    label: "INVESTIGATING",
    text: "text-sky-300",
    bg: "bg-sky-500/10",
    border: "border-sky-500/30",
    dot: "bg-sky-400",
  },
  RESOLVED: {
    label: "RESOLVED",
    text: "text-emerald-400",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/30",
    dot: "bg-emerald-400",
  },
  SILENCED: {
    label: "SILENCED",
    text: "text-zinc-400",
    bg: "bg-zinc-800/40",
    border: "border-zinc-700/40",
    dot: "bg-zinc-500",
  },
};

export function StatusBadge({ status }: { status: string }) {
  const config = statusConfig[status as AlertStatus] || {
    label: status,
    text: "text-zinc-400",
    bg: "bg-zinc-800/40",
    border: "border-zinc-700/40",
    dot: "bg-zinc-500",
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tracking-wider uppercase backdrop-blur-sm ${config.bg} ${config.border} ${config.text}`}
    >
      <span className="relative flex h-1.5 w-1.5">
        {status === "OPEN" && (
          <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${config.dot}`} />
        )}
        <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${config.dot.split(" ")[0]}`} />
      </span>
      {config.label}
    </span>
  );
}
