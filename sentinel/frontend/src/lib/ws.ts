"use client";

import type { User } from "@/lib/types";

export type AlertWsMessage = {
  type: string;
  data: {
    type?: string;
    alert_id: string;
    status?: string;
    severity?: string;
    title?: string;
  };
};

function wsBase() {
  if (typeof window === "undefined") return "";
  const env = process.env.NEXT_PUBLIC_WS_URL;
  if (env) return env.replace(/\/$/, "");
  const { protocol, hostname } = window.location;
  const wsProto = protocol === "https:" ? "wss:" : "ws:";
  return `${wsProto}//${hostname}:8080`;
}

export function connectAlertSocket(
  _user: User | null,
  onMessage: (msg: AlertWsMessage) => void,
  onError?: () => void,
  onOpen?: () => void,
): () => void {
  const base = wsBase();
  if (!base) return () => undefined;
  const url = `${base}/api/v1/ws/alerts`;
  let closed = false;
  let socket: WebSocket | null = null;
  let retryMs = 1000;

  const connect = () => {
    if (closed) return;
    socket = new WebSocket(url);
    socket.onmessage = (ev) => {
      try {
        onMessage(JSON.parse(ev.data) as AlertWsMessage);
      } catch {
        /* ignore malformed */
      }
    };
    socket.onerror = () => onError?.();
    socket.onclose = () => {
      if (closed) return;
      setTimeout(connect, retryMs);
      retryMs = Math.min(retryMs * 2, 30000);
    };
    socket.onopen = () => {
      retryMs = 1000;
      onOpen?.();
    };
  };

  connect();

  return () => {
    closed = true;
    socket?.close();
  };
}
