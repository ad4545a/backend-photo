import cron from "node-cron";
import Video from "../models/Video.js";
import { deleteDriveFile } from "../config/googleDrive.js";

async function purgeExpiredVideos() {
  const expired = await Video.find({ expiresAt: { $lte: new Date() } });
  for (const video of expired) {
    await deleteDriveFile(video.driveFileId);
    await video.deleteOne();
    // eslint-disable-next-line no-console
    console.log(`[videos] purged expired video ${video._id} ("${video.title}")`);
  }
}

// Runs once a day at 3am server time. Videos are auto-removed
// VIDEO_RETENTION_MONTHS after upload, as shown to visitors in the UI.
export function scheduleVideoExpiry() {
  cron.schedule("0 3 * * *", () => {
    purgeExpiredVideos().catch((err) => {
      // eslint-disable-next-line no-console
      console.error("[videos] expiry sweep failed:", err);
    });
  });

  // Also run once at boot so nothing lingers if the server was down when a
  // video's expiry passed.
  purgeExpiredVideos().catch((err) => {
    // eslint-disable-next-line no-console
    console.error("[videos] initial expiry sweep failed:", err);
  });
}
