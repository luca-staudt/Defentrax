"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useAuth } from "@/context/auth-context";
import { apiFetch } from "@/lib/api/client";
import { canSeePage } from "@/lib/pages";
import { getQuerySnapshot, invalidateQueries, loadQuery } from "@/lib/panel/cache";
import type { DashboardStats } from "@/lib/types";
import { connectAlertSocket } from "@/lib/ws";

export type LinkStatus = "pending" | "live" | "offline";

const listeners = new Set<() => void>();
let linkStatus: LinkStatus = "pending";

function setLinkStatus(next: LinkStatus) {
  if (linkStatus === next) return;
  linkStatus = next;
  listeners.forEach((listener) => listener());
}

export function useLinkStatus(): LinkStatus {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => linkStatus,
    () => "pending" as LinkStatus,
  );
}

const REFRESH_MS = 15000;

export function PanelLive() {
  const { user } = useAuth();
  const canDashboard = canSeePage(user, "dashboard");
  const canAlerts = canSeePage(user, "alerts");

  useEffect(() => {
    if (!canDashboard) return;
    let cancelled = false;

    const tick = async () => {
      await loadQuery("stats", () => apiFetch<DashboardStats>("/dashboard/stats"), true);
      if (cancelled) return;
      const snap = getQuerySnapshot("stats");
      setLinkStatus(snap.error ? "offline" : "live");
    };

    void tick();
    const id = window.setInterval(() => {
      if (document.visibilityState === "hidden") return;
      void tick();
    }, REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [canDashboard]);

  useEffect(() => {
    if (!user || !canAlerts) return;
    return connectAlertSocket(
      user,
      () => {
        setLinkStatus("live");
        invalidateQueries(["stats", "alerts", "alert:", "events"]);
      },
      undefined,
      () => setLinkStatus("live"),
    );
  }, [user, canAlerts]);

  return null;
}
