import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { env } from "../config/env.js";

// uploadId -> { type, title, category, mimeType, tempPath, bytesReceived, createdAt }
const sessions = new Map();

fs.mkdirSync(env.uploadTmpDir, { recursive: true });

export function createSession({ type, title, category, mimeType }) {
  const uploadId = uuidv4();
  const tempPath = path.join(env.uploadTmpDir, `${uploadId}.part`);
  fs.writeFileSync(tempPath, Buffer.alloc(0)); // touch empty file
  sessions.set(uploadId, {
    type,
    title,
    category,
    mimeType,
    tempPath,
    bytesReceived: 0,
    createdAt: Date.now(),
  });
  return uploadId;
}

export function getSession(uploadId) {
  return sessions.get(uploadId);
}

export async function appendChunk(uploadId, buffer) {
  const session = sessions.get(uploadId);
  if (!session) throw new Error("Unknown or expired upload session.");
  await fs.promises.appendFile(session.tempPath, buffer);
  session.bytesReceived += buffer.length;
  return session;
}

export function dropSession(uploadId) {
  const session = sessions.get(uploadId);
  if (!session) return;
  fs.promises.unlink(session.tempPath).catch(() => {});
  sessions.delete(uploadId);
}

// Chunked uploads that are started but never completed or cancelled (e.g. the
// user closed the tab mid-upload) would otherwise leak temp files forever.
// Sweep anything older than 6 hours.
const STALE_MS = 6 * 60 * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  for (const [uploadId, session] of sessions.entries()) {
    if (now - session.createdAt > STALE_MS) {
      dropSession(uploadId);
    }
  }
}, 30 * 60 * 1000).unref();
