import webpush from "web-push";
import { getPushSubscriptions, deletePushSubscription } from "@workspace/db";
import { logger } from "./logger.js";

let initialized = false;

export function initWebPush() {
  const publicKey  = process.env["VAPID_PUBLIC_KEY"];
  const privateKey = process.env["VAPID_PRIVATE_KEY"];
  if (!publicKey || !privateKey) {
    logger.warn("VAPID keys not set — push notifications disabled");
    return;
  }
  webpush.setVapidDetails("mailto:noreply@goldswingai.app", publicKey, privateKey);
  initialized = true;
  logger.info("Web Push initialized");
}

export function getVapidPublicKey(): string | null {
  return process.env["VAPID_PUBLIC_KEY"] ?? null;
}

export async function sendPushToAll(payload: object): Promise<void> {
  if (!initialized) return;

  const subs = await getPushSubscriptions();
  if (subs.length === 0) return;

  const message = JSON.stringify(payload);
  const dead: string[] = [];

  await Promise.allSettled(
    subs.map(async (sub: any) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          message,
        );
      } catch (err: any) {
        if (err?.statusCode === 410 || err?.statusCode === 404) {
          dead.push(sub.endpoint);
        } else {
          logger.warn({ err, endpoint: sub.endpoint }, "Push send failed");
        }
      }
    }),
  );

  if (dead.length > 0) {
    for (const endpoint of dead) {
      await deletePushSubscription(endpoint).catch(() => {});
    }
    logger.info({ removed: dead.length }, "Removed expired push subscriptions");
  }
}
