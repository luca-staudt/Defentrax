export type User = {
  id: string;
  email: string;
  display_name?: string;
  is_active: boolean;
  roles: string[];
  permissions?: string[];
  last_login_at?: string | null;
  created_at?: string;
  updated_at?: string;
  totp_enabled?: boolean;
};

export type Role = {
  id: string;
  name: string;
  description: string;
  is_system: boolean;
  created_at: string;
  updated_at?: string;
  permissions?: string[];
};

export type Permission = {
  id: string;
  resource: string;
  action: string;
  key: string;
  description: string;
};

export type UserSession = {
  id: string;
  user_id: string;
  expires_at: string;
  created_at: string;
  ip_address?: string;
  user_agent?: string;
  current?: boolean;
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
  description?: string;
  environment?: string;
  created_at: string;
};

export type EnrollmentToken = {
  id: string;
  server_id: string;
  token_prefix: string;
  token?: string;
  expires_at: string;
};

export type NotificationChannel = {
  id: string;
  name: string;
  channel_type: "discord" | "slack" | "email" | "webhook";
  config: Record<string, unknown>;
  has_secrets: boolean;
  enabled: boolean;
  created_at: string;
  updated_at: string;
};

export type NotificationRule = {
  id: string;
  name: string;
  enabled: boolean;
  min_severity: string;
  triggers: string[];
  channel_ids: string[];
  created_at: string;
  updated_at: string;
};

export type AuditLog = {
  id: string;
  actor_user_id?: string;
  actor_email?: string;
  actor_type: string;
  action: string;
  entity_type: string;
  entity_id?: string;
  metadata: Record<string, unknown>;
  ip_address?: string;
  user_agent?: string;
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
