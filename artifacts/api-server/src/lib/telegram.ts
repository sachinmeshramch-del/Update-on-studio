import { logger } from "./logger.js";
import { getSystemSettings } from "@workspace/db";

const TELEGRAM_BOT_TOKEN = "8782482280:AAHzCqJL52OQ925dsG1211AWjYEn9ibVNpU";
let TELEGRAM_CHAT_ID: string | null = null;

async function fetchChatId() {
    try {
        const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates`);
        const data = await response.json();
        if (data.ok && data.result.length > 0) {
            // Get the chat ID from the latest message
            const lastUpdate = data.result[data.result.length - 1];
            if (lastUpdate.message && lastUpdate.message.chat) {
                TELEGRAM_CHAT_ID = lastUpdate.message.chat.id.toString();
                logger.info(`[Telegram] Fetched chat ID automatically: ${TELEGRAM_CHAT_ID}`);
                return TELEGRAM_CHAT_ID;
            }
        }
    } catch (err) {
        logger.error({ err }, "[Telegram] Failed to fetch chat ID");
    }
    return null;
}

export async function sendTelegramNotification(message: string) {
    if (!TELEGRAM_BOT_TOKEN) return;

    if (!TELEGRAM_CHAT_ID) {
        await fetchChatId();
    }

    if (!TELEGRAM_CHAT_ID) {
        logger.warn("[Telegram] Cannot send notification, no Chat ID found. Please send a message to the bot first.");
        return;
    }

    try {
        const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                chat_id: TELEGRAM_CHAT_ID,
                text: message,
                parse_mode: 'HTML'
            })
        });

        const data = await response.json();
        if (!data.ok) {
            logger.error({ error: data.description }, "[Telegram] Failed to send message");
        } else {
            logger.info("[Telegram] Sent notification successfully");
        }
    } catch (err) {
        logger.error({ err }, "[Telegram] Failed to send message");
    }
}
