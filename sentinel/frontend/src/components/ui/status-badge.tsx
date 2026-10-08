type AlertStatus = "OPEN" | "ACKNOWLEDGED" | "INVESTIGATING" | "RESOLVED" | "SILENCED";

const tone: Record<AlertStatus, string> = {
  OPEN: "danger",
  ACKNOWLEDGED: "warning",
  INVESTIGATING: "info",
  RESOLVED: "success",
  SILENCED: "secondary",
};

export function StatusBadge({ status }: { status: string }) {
  const key = status as AlertStatus;
  const color = tone[key] || "secondary";
  return <span className={`badge bg-${color}-subtle text-${color}`}>{status}</span>;
}
