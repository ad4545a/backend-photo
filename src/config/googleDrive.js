import fs from "fs";
import { google } from "googleapis";
import { env } from "./env.js";

let driveClient = null;
let oAuthClient = null;

// Uses a regular Google account via OAuth2 (not a service account). The
// refresh token is obtained once via scripts/getGoogleRefreshToken.js and
// then reused indefinitely - googleapis transparently exchanges it for a
// fresh access token on every call.
function getAuth() {
  if (!oAuthClient) {
    if (!env.googleClientId || !env.googleClientSecret || !env.googleRefreshToken) {
      throw new Error(
        "Google OAuth is not configured - set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_REFRESH_TOKEN (run `npm run google-auth` to get a refresh token)."
      );
    }
    oAuthClient = new google.auth.OAuth2(
      env.googleClientId,
      env.googleClientSecret,
      env.googleRedirectUri
    );
    oAuthClient.setCredentials({ refresh_token: env.googleRefreshToken });
  }
  return oAuthClient;
}

function getDrive() {
  if (!driveClient) {
    driveClient = google.drive({ version: "v3", auth: getAuth() });
  }
  return driveClient;
}

/**
 * Upload a file already sitting on local disk (assembled from chunks) to
 * Google Drive. Streams from disk so we never hold the whole video in memory.
 * Makes the file readable-by-link and returns its Drive file id.
 */
export async function uploadFileToDrive(filePath, filename, mimeType) {
  const drive = getDrive();

  const { data } = await drive.files.create({
    requestBody: {
      name: filename,
      parents: [env.googleDriveFolderId],
    },
    media: {
      mimeType: mimeType || "video/mp4",
      body: fs.createReadStream(filePath),
    },
    fields: "id, size",
  });

  // Anyone-with-the-link can view/stream. Needed for the <iframe> preview
  // embed and for our download proxy to be able to fetch bytes.
  await drive.permissions.create({
    fileId: data.id,
    requestBody: { role: "reader", type: "anyone" },
  });

  return { fileId: data.id, size: data.size };
}

export function getDriveEmbedUrl(fileId) {
  return `https://drive.google.com/file/d/${fileId}/preview`;
}

export function getDriveDownloadUrl(fileId) {
  return `https://drive.google.com/uc?export=download&id=${fileId}`;
}

export async function streamDriveFile(fileId, res, { download, filename } = {}) {
  const drive = getDrive();
  const { data, headers } = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "stream" }
  );
  if (headers["content-type"]) res.setHeader("Content-Type", headers["content-type"]);
  if (headers["content-length"]) res.setHeader("Content-Length", headers["content-length"]);
  if (download) res.setHeader("Content-Disposition", `attachment; filename="${filename || "video"}"`);
  data.pipe(res);
}

export async function deleteDriveFile(fileId) {
  try {
    await getDrive().files.delete({ fileId });
  } catch {
    // Best-effort - Mongo remains the source of truth for what the gallery shows.
  }
}
