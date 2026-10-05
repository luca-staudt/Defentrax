"use client";

import type { ApiError } from "@/lib/types";

const API_PREFIX = "/api/v1";

export class ApiRequestError extends Error {
  status: number;
  code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const url = path.startsWith("/api/") ? path : `${API_PREFIX}${path}`;
  const res = await fetch(url, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });

  if (res.status === 204) {
    return undefined as T;
  }

  const body = (await res.json().catch(() => ({}))) as T &
    ApiError & { message?: string; code?: string };
  if (!res.ok) {
    throw new ApiRequestError(
      res.status,
      body.error?.message || body.message || res.statusText,
      body.error?.code || body.code,
    );
  }
  return body;
}
