export function permKey(resource: string, action: string) {
  return `${resource}:${action}`;
}

export function hasPermission(
  user: { permissions?: string[]; roles?: string[] } | null | undefined,
  resource: string,
  action: string,
): boolean {
  if (!user) return false;
  if (user.roles?.includes("SUPER_ADMIN") || user.roles?.includes("ADMIN")) return true;
  const key = permKey(resource, action);
  return user.permissions?.includes(key) ?? false;
}

/** Human-readable labels for built-in role codes. */
export function roleDisplayName(name: string): string {
  switch (name) {
    case "SUPER_ADMIN":
      return "Super Admin";
    case "ADMIN":
      return "Admin";
    case "SECURITY_ANALYST":
      return "Security Analyst";
    case "OPERATOR":
      return "Operator";
    case "VIEWER":
      return "Viewer";
    default:
      return name.replace(/_/g, " ");
  }
}
