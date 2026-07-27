import path from "path";
import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";
import { env } from "../config/env.js";

ffmpeg.setFfmpegPath(ffmpegPath);

/**
 * Grab a single frame (at ~1s, or the start for very short clips) from a
 * video file on disk and save it as a small JPEG. Used so the gallery list
 * only ever has to load a lightweight thumbnail image, never the video
 * itself, until the visitor actually presses play.
 */
export function extractThumbnail(videoPath) {
  return new Promise((resolve, reject) => {
    const outPath = path.join(env.uploadTmpDir, `thumb-${Date.now()}-${Math.round(Math.random() * 1e6)}.jpg`);
    ffmpeg(videoPath)
      .on("end", () => resolve(outPath))
      .on("error", (err) => reject(err))
      .screenshots({
        timestamps: ["1"],
        filename: path.basename(outPath),
        folder: path.dirname(outPath),
        size: "480x?",
      });
  });
}
