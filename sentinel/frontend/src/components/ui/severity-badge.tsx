import type { Severity } from "@/lib/types";

const severityConfig: Record<
  Severity,
  { label: string; text: string; bg: string; border: string; dot: string; glow: string }
> = {
  CRITICAL: {
    label: "CRITICAL",
    text: "text-rose-400",
    bg: "bg-rose-950/40",
    border: "border-rose-500/40",
    dot: "bg-rose-500 animate-pulse shadow-[0_0_8px_#f43f5e]",
    glow: "shadow-[0_0_12px_rgba(244,63,94,0.15)]",
  },
  HIGH: {
    label: "HIGH",
    text: "text-amber-400",
    bg: "bg-amber-950/40",
    border: "border-amber-500/40",
    dot: "bg-amber-500 shadow-[0_0_6px_#f59e0b]",
    glow: "shadow-[0_0_10px_rgba(245,158,11,0.15)]",
  },
  MEDIUM: {
    label: "MEDIUM",
    text: "text-yellow-300",
    bg: "bg-yellow-950/30",
    border: "border-yellow-500/30",
    dot: "bg-yellow-400",
    glow: "",
  },
  LOW: {
    label: "LOW",
    text: "text-sky-400",
    bg: "bg-sky-950/30",
    border: "border-sky-500/30",
    dot: "bg-sky-400",
    glow: "",
  },
  INFO: {
    label: "INFO",
    text: "text-zinc-400",
    bg: "bg-zinc-900/60",
    border: "border-zinc-700/50",
    dot: "bg-zinc-500",
    glow: "",
  },
};

export function SeverityBadge({ severity }: { severity?: Severity | string }) {
  const norm = (severity?.toUpperCase() || "INFO") as Severity;
  const config = severityConfig[norm] || severityConfig.INFO;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tracking-wider uppercase backdrop-blur-sm ${config.bg} ${config.border} ${config.text} ${config.glow}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  );
}
