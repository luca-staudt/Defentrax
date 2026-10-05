export type User = {
  id: string;
  email: string;
  display_name?: string;
  is_active: boolean;
  roles: string[];
  permissions?: string[];
};

export type DashboardStats = {
  servers_total: number;
  agents_active: number;
  events_last_24h: number;
  alerts_open: number;
  alerts_by_status: Record<string, number>;
  alerts_by_severity: Record<string, number>;
  events_by_severity_24h: Record<string, number>;
};

export type Alert = {
  id: string;
  server_id: string;
  rule_id?: string;
  title: string;
  description: string;
  status: string;
  severity: string;
  event_count: number;
  first_seen_at: string;
  last_seen_at: string;
  opened_at: string;
};

export type EventRow = {
  id: string;
  server_id: string;
  source: string;
  category: string;
  severity: string;
  host: string;
  message: string;
  received_at: string;
  occurred_at: string;
};

export type Server = {
  id: string;
  name: string;
  hostname: string;
  created_at: string;
};

export type Rule = {
  id: string;
  rule_id: string;
  name: string;
  description: string;
  enabled: boolean;
  severity: string;
};

export type ApiError = {
  error?: { code?: string; message?: string };
};
