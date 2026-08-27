import { useEffect, useState } from "react";

export interface StreamPrice {
  price: number;
  bid: number;
  ask: number;
  spread: number;
  change: number;
  changePercent: number;
  high24h: number;
  low24h: number;
  direction: "up" | "down" | "unchanged";
  timestamp: string;
  ms: number;
  source?: "twelvedata" | "finnhub" | "polygon" | "goldprice" | "yahoo" | "synthetic" | "metaapi";
}

export interface PriceStreamState {
  data: StreamPrice | null;
  history: StreamPrice[];
  connected: boolean;
  error: boolean;
  tickCount: number;
  transport: "websocket" | "sse" | "none";
}

let globalState: PriceStreamState = {
  data: null,
  history: [],
  connected: false,
  error: false,
  tickCount: 0,
  transport: "none",
};

const listeners = new Set<(state: PriceStreamState) => void>();

let ws: WebSocket | null = null;
let es: EventSource | null = null;
let retryTimeout: ReturnType<typeof setTimeout> | null = null;
let wsFailed = false;
let connections = 0;

function broadcast() {
  listeners.forEach(l => l(globalState));
}

function handleMessage(raw: string) {
  try {
    const parsed = JSON.parse(raw);
    if (parsed.type === "history" && Array.isArray(parsed.ticks)) {
      const ticks = parsed.ticks as StreamPrice[];
      if (ticks.length > 0) {
        globalState = {
          ...globalState,
          history: ticks,
          data: ticks[ticks.length - 1],
          connected: true,
          error: false,
          tickCount: globalState.tickCount + ticks.length,
        };
        broadcast();
      }
      return;
    }
    const incoming = parsed as StreamPrice;
    if (!incoming.price) return;
    globalState = {
      ...globalState,
      data: incoming,
      connected: true,
      error: false,
      tickCount: globalState.tickCount + 1,
    };
    broadcast();
  } catch {}
}

function connectSSE() {
  if (es) {
    es.close();
    es = null;
  }
  es = new EventSource("/api/price/stream");
  es.onopen = () => {
    globalState = { ...globalState, connected: true, error: false, transport: "sse" };
    broadcast();
  };
  es.onmessage = (event) => {
    handleMessage(event.data);
    if (globalState.transport !== "sse") {
      globalState = { ...globalState, transport: "sse" };
      broadcast();
    }
  };
  es.onerror = () => {
    es?.close();
    es = null;
    globalState = { ...globalState, connected: false, error: true };
    broadcast();
    retryTimeout = setTimeout(connectSSE, 3000);
  };
}

function connectWS() {
  if (ws) {
    ws.close();
    ws = null;
  }
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  const url = `${proto}//${window.location.host}/api/price/ws`;
  ws = new WebSocket(url);
  
  const openTimeout = setTimeout(() => {
    if (ws && ws.readyState !== WebSocket.OPEN) {
      ws.close();
      wsFailed = true;
      connectSSE();
    }
  }, 5000);
  
  ws.onopen = () => {
    clearTimeout(openTimeout);
    globalState = { ...globalState, connected: true, error: false, transport: "websocket" };
    broadcast();
  };
  ws.onmessage = (event) => {
    handleMessage(event.data);
    if (globalState.transport !== "websocket") {
      globalState = { ...globalState, transport: "websocket" };
      broadcast();
    }
  };
  ws.onerror = () => {
    clearTimeout(openTimeout);
    wsFailed = true;
  };
  ws.onclose = () => {
    clearTimeout(openTimeout);
    ws = null;
    globalState = { ...globalState, connected: false };
    broadcast();
    if (wsFailed) {
      if (!es) connectSSE();
    } else {
      retryTimeout = setTimeout(connectWS, 3000);
    }
  };
}

function initStream() {
  connections++;
  if (connections === 1) {
    connectWS();
  }
}

function releaseStream() {
  connections--;
  if (connections <= 0) {
    connections = 0;
    ws?.close();
    es?.close();
    ws = null;
    es = null;
    if (retryTimeout) {
      clearTimeout(retryTimeout);
      retryTimeout = null;
    }
  }
}

export function usePriceStream(): PriceStreamState {
  const [state, setState] = useState<PriceStreamState>(globalState);
  
  useEffect(() => {
    listeners.add(setState);
    initStream();
    
    return () => {
      listeners.delete(setState);
      releaseStream();
    };
  }, []);
  
  return state;
}
