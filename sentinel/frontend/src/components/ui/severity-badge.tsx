type Severity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";

const tone: Record<Severity, string> = {
  CRITICAL: "danger",
  HIGH: "warning",
  MEDIUM: "info",
  LOW: "primary",
  INFO: "secondary",
};

export function SeverityBadge({ severity }: { severity?: Severity | string }) {
  const norm = (severity?.toUpperCase() || "INFO") as Severity;
  const color = tone[norm] || tone.INFO;
  return <span className={`badge bg-${color}-subtle text-${color}`}>{norm}</span>;
}
