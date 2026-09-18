import { useState, useEffect } from "react";

export interface ConnectionsState {
  metaapi: "disconnected" | "connecting" | "connected";
  twelvedata: "disconnected" | "connecting" | "connected";
  finnhub: "disconnected" | "connecting" | "connected";
  activeSource: string;
  lastHeartbeat?: number;
  latencyMs?: number;
}

export function useConnections() {
  const [connections, setConnections] = useState<ConnectionsState | null>(null);

  useEffect(() => {
    const fetchConnections = async () => {
      try {
        const res = await fetch("/api/connections");
        if (res.ok) {
          const data = await res.json();
          setConnections(data);
        }
      } catch (err) {
        // ignore
      }
    };

    fetchConnections();
    const interval = setInterval(fetchConnections, 2000);
    return () => clearInterval(interval);
  }, []);

  return connections;
}
