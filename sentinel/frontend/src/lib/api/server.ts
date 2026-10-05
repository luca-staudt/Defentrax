import { cookies } from "next/headers";

function internalBase() {
  return (
    process.env.API_INTERNAL_URL ||
    process.env.API_PROXY_TARGET ||
    "http://127.0.0.1:8080"
  );
}

export async function serverApiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<{ data?: T; status: number }> {
  const base = internalBase().replace(/\/$/, "");
  const url = `${base}${path.startsWith("/api/") ? path : `/api/v1${path}`}`;
  const jar = await cookies();
  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init?.headers || {}),
      cookie: jar.toString(),
    },
    cache: "no-store",
  });
  if (res.status === 204) {
    return { status: res.status };
  }
  const data = (await res.json().catch(() => undefined)) as T | undefined;
  return { data, status: res.status };
}
