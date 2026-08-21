import { useState, useEffect, useCallback } from "react";

const API_BASE = `${import.meta.env.BASE_URL}api`;

async function getVapidKey(): Promise<string | null> {
  try {
    const res = await fetch(`${API_BASE}/push/vapid-public-key`);
    if (!res.ok) return null;
    const data = await res.json() as { publicKey?: string };
    return data.publicKey ?? null;
  } catch {
    return null;
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

async function registerSW(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`);
  } catch {
    return null;
  }
}

async function subscribeUser(reg: ServiceWorkerRegistration, vapidKey: string): Promise<PushSubscription | null> {
  try {
    const existing = await reg.pushManager.getSubscription();
    if (existing) return existing;
    return await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey),
    });
  } catch {
    return null;
  }
}

export type NotificationStatus = "unsupported" | "denied" | "idle" | "loading" | "subscribed" | "error";

export function useNotifications() {
  const [status, setStatus] = useState<NotificationStatus>("idle");

  useEffect(() => {
    if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      setStatus("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setStatus("denied");
      return;
    }
    // Check if already subscribed
    navigator.serviceWorker.getRegistration(`${import.meta.env.BASE_URL}sw.js`).then(async (reg) => {
      if (!reg) return;
      const sub = await reg.pushManager.getSubscription().catch(() => null);
      if (sub) setStatus("subscribed");
    });
  }, []);

  const enable = useCallback(async () => {
    if (status === "loading" || status === "subscribed") return;
    setStatus("loading");

    const vapidKey = await getVapidKey();
    if (!vapidKey) { setStatus("error"); return; }

    const permission = await Notification.requestPermission();
    if (permission !== "granted") { setStatus("denied"); return; }

    const reg = await registerSW();
    if (!reg) { setStatus("error"); return; }

    // Wait for SW to be active
    await new Promise<void>((resolve) => {
      if (reg.active) { resolve(); return; }
      reg.addEventListener("updatefound", () => {
        const sw = reg.installing;
        if (!sw) { resolve(); return; }
        sw.addEventListener("statechange", () => { if (sw.state === "activated") resolve(); });
      });
      setTimeout(resolve, 3000);
    });

    const sub = await subscribeUser(reg, vapidKey);
    if (!sub) { setStatus("error"); return; }

    const subJson = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
    try {
      const res = await fetch(`${API_BASE}/push/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: subJson.endpoint, keys: subJson.keys }),
      });
      if (!res.ok) throw new Error("subscribe failed");
      setStatus("subscribed");
    } catch {
      setStatus("error");
    }
  }, [status]);

  const disable = useCallback(async () => {
    const reg = await navigator.serviceWorker.getRegistration(`${import.meta.env.BASE_URL}sw.js`).catch(() => null);
    const sub = await reg?.pushManager.getSubscription().catch(() => null);
    if (sub) {
      await fetch(`${API_BASE}/push/unsubscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: sub.endpoint }),
      }).catch(() => {});
      await sub.unsubscribe().catch(() => {});
    }
    setStatus("idle");
  }, []);

  return { status, enable, disable };
}
