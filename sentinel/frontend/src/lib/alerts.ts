/** Allowed next statuses from the current alert lifecycle state. */
export const ALERT_TRANSITIONS: Record<string, string[]> = {
  OPEN: ["ACKNOWLEDGED", "INVESTIGATING", "RESOLVED"],
  ACKNOWLEDGED: ["INVESTIGATING", "RESOLVED"],
  INVESTIGATING: ["RESOLVED"],
  RESOLVED: ["OPEN"],
};

export function nextAlertStatuses(status: string): string[] {
  return ALERT_TRANSITIONS[status] || [];
}

export function alertActionLabel(status: string): string {
  switch (status) {
    case "OPEN":
      return "Reopen";
    case "ACKNOWLEDGED":
      return "Acknowledge";
    case "INVESTIGATING":
      return "Mark investigating";
    case "RESOLVED":
      return "Mark resolved";
    default:
      return `Mark ${status.replace(/_/g, " ").toLowerCase()}`;
  }
}

export function formatAlertTime(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatAlertTimeShort(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function isAlertActive(status: string): boolean {
  return status !== "RESOLVED";
}

export function countSeverity(counts: Record<string, number> | undefined, severity: string): number {
  if (!counts) return 0;
  const want = severity.toLowerCase();
  let total = 0;
  for (const [key, value] of Object.entries(counts)) {
    if (key.toLowerCase() === want) total += value;
  }
  return total;
}
