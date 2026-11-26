"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ClientMessage, PublicRoom, ServerMessage } from "./room";
import { roomToken } from "./storage";

export type Connection = "connecting" | "open" | "reconnecting" | "closed";

/**
 * Keeps a WebSocket open to a room. Reconnects automatically with the same
 * player token (so scores survive a refresh or a dropped connection), and
 * tracks the offset between this device's clock and the server's.
 */
export function useRoom(code: string, name: string) {
  const [room, setRoom] = useState<PublicRoom | null>(null);
  const [you, setYou] = useState("");
  const [connection, setConnection] = useState<Connection>("connecting");
  const [error, setError] = useState("");
  const [clockOffset, setClockOffset] = useState(0);
  const socket = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!code || !name) return;
    let stopped = false;
    let attempts = 0;
    let retryTimer = 0;
    let pingTimer = 0;

    const connect = () => {
      const protocol = location.protocol === "https:" ? "wss:" : "ws:";
      const params = new URLSearchParams({ token: roomToken(code), name });
      const ws = new WebSocket(`${protocol}//${location.host}/api/rooms/${code}/ws?${params}`);
      socket.current = ws;

      ws.onopen = () => {
        pingTimer = window.setInterval(() => { if (ws.readyState === WebSocket.OPEN) ws.send("ping"); }, 25000);
      };
      ws.onmessage = (event) => {
        if (event.data === "pong") return;
        let message: ServerMessage;
        try { message = JSON.parse(event.data as string) as ServerMessage; } catch { return; }
        if (message.type === "state") {
          attempts = 0;
          setRoom(message.room);
          setYou(message.you);
          setClockOffset(message.now - Date.now());
          setConnection("open");
          setError("");
        } else if (message.type === "error") {
          stopped = true;
          setError(message.message);
          setConnection("closed");
        }
      };
      ws.onclose = (event) => {
        window.clearInterval(pingTimer);
        if (stopped) return;
        if (event.code === 4001) {
          stopped = true;
          setError("This game was opened in another tab.");
          setConnection("closed");
          return;
        }
        attempts += 1;
        if (attempts > 8) {
          stopped = true;
          setError("Lost connection to the room.");
          setConnection("closed");
          return;
        }
        setConnection("reconnecting");
        retryTimer = window.setTimeout(connect, Math.min(4000, 400 * attempts));
      };
    };

    setConnection("connecting");
    setError("");
    connect();
    return () => {
      stopped = true;
      window.clearTimeout(retryTimer);
      window.clearInterval(pingTimer);
      socket.current?.close(1000);
      socket.current = null;
    };
  }, [code, name]);

  const send = useCallback((message: ClientMessage) => {
    const ws = socket.current;
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
  }, []);

  return { room, you, connection, error, clockOffset, send };
}

/** Server time, re-rendering a few times a second while `active`. */
export function useServerNow(clockOffset: number, active: boolean): number {
  const [now, setNow] = useState(() => Date.now() + clockOffset);
  useEffect(() => {
    setNow(Date.now() + clockOffset);
    if (!active) return;
    const timer = window.setInterval(() => setNow(Date.now() + clockOffset), 100);
    return () => window.clearInterval(timer);
  }, [clockOffset, active]);
  return now;
}
