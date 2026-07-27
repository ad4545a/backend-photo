import fs from "fs";
import fetch from "node-fetch";
import FormData from "form-data";
import { env } from "./env.js";

const API_BASE = `https://api.telegram.org/bot${env.telegramBotToken}`;
const FILE_BASE = `https://api.telegram.org/file/bot${env.telegramBotToken}`;

// Telegram's sendPhoto compresses images and caps around ~10MB, and it also
// strips/re-encodes them (fine for gallery thumbnails but lossy). We use
// sendDocument instead so the original file bytes are preserved untouched -
// this matters for a photo archive. sendDocument allows up to 50MB per file
// on the standard Bot API.
const MAX_TELEGRAM_DOCUMENT_BYTES = 50 * 1024 * 1024;

/**
 * Upload a file on disk to the configured Telegram chat and return the
 * Telegram file_id we can use later to fetch/stream it back.
 */
export async function uploadFileToTelegram(filePath, filename, mimeType) {
  const stats = fs.statSync(filePath);
  if (stats.size > MAX_TELEGRAM_DOCUMENT_BYTES) {
    throw new Error(
      `File is ${(stats.size / 1024 / 1024).toFixed(1)}MB, which is over Telegram's 50MB bot upload limit.`
    );
  }

  const form = new FormData();
  form.append("chat_id", env.telegramChatId);
  form.append("document", fs.createReadStream(filePath), {
    filename,
    contentType: mimeType || "application/octet-stream",
  });

  const res = await fetch(`${API_BASE}/sendDocument`, { method: "POST", body: form });
  const data = await res.json();

  if (!data.ok) {
    throw new Error(`Telegram upload failed: ${data.description || "unknown error"}`);
  }

  const doc = data.result.document || data.result.photo?.at(-1);
  if (!doc) throw new Error("Telegram upload succeeded but returned no file reference.");

  return {
    fileId: doc.file_id,
    messageId: data.result.message_id,
    fileSize: doc.file_size,
  };
}

/**
 * Resolve a Telegram file_id to a temporary direct download path.
 * Telegram file paths can go stale after a while, so we re-resolve this
 * every time we actually need to serve the bytes rather than caching it.
 */
export async function resolveTelegramFileUrl(fileId) {
  const res = await fetch(`${API_BASE}/getFile?file_id=${encodeURIComponent(fileId)}`);
  const data = await res.json();
  if (!data.ok) {
    throw new Error(`Telegram getFile failed: ${data.description || "unknown error"}`);
  }
  return `${FILE_BASE}/${data.result.file_path}`;
}

/**
 * Stream a Telegram-stored file straight through to an HTTP response,
 * so the bot token / raw Telegram URL is never exposed to the browser.
 */
export async function streamTelegramFile(fileId, res, { download, filename } = {}) {
  const url = await resolveTelegramFileUrl(fileId);
  const upstream = await fetch(url);
  if (!upstream.ok || !upstream.body) {
    throw new Error("Could not fetch file from Telegram.");
  }
  if (upstream.headers.get("content-type")) {
    res.setHeader("Content-Type", upstream.headers.get("content-type"));
  }
  if (upstream.headers.get("content-length")) {
    res.setHeader("Content-Length", upstream.headers.get("content-length"));
  }
  if (download) {
    res.setHeader("Content-Disposition", `attachment; filename="${filename || "file"}"`);
  }
  // Cache thumbnails/photos aggressively at the edge/browser - content is immutable once uploaded.
  res.setHeader("Cache-Control", "public, max-age=86400");
  upstream.body.pipe(res);
}

export async function deleteTelegramMessage(messageId) {
  try {
    await fetch(`${API_BASE}/deleteMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: env.telegramChatId, message_id: messageId }),
    });
  } catch {
    // Best-effort only - if Telegram cleanup fails we don't want to block
    // deleting the Mongo record, since the DB is the source of truth for the gallery.
  }
}
