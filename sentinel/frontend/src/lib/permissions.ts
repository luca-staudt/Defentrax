export function permKey(resource: string, action: string) {
  return `${resource}:${action}`;
}

export function hasPermission(
  user: { permissions?: string[]; roles?: string[] } | null | undefined,
  resource: string,
  action: string,
): boolean {
  if (!user) return false;
  if (user.roles?.includes("ADMIN")) return true;
  const key = permKey(resource, action);
  return user.permissions?.includes(key) ?? false;
}
