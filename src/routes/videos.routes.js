import { Router } from "express";
import express from "express";
import fs from "fs";
import Video from "../models/Video.js";
import Category from "../models/Category.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { env } from "../config/env.js";
import { streamTelegramFile, uploadFileToTelegram } from "../config/telegram.js";
import {
  uploadFileToDrive,
  getDriveEmbedUrl,
  streamDriveFile,
  deleteDriveFile,
} from "../config/googleDrive.js";
import { extractThumbnail } from "../utils/thumbnail.js";
import { createSession, getSession, appendChunk, dropSession } from "../utils/uploadSessions.js";

const router = Router();
const rawChunk = express.raw({ type: "application/octet-stream", limit: "5mb" });

// Note: the list/gallery response deliberately never includes the Drive
// embed/stream URL - only a lightweight thumbnail. The actual video is only
// resolved (GET /:id/play) the moment a visitor presses play, per the
// "don't load video until the user plays it" requirement.
function toPublicVideo(req, video) {
  const base = `${req.protocol}://${req.get("host")}`;
  return {
    id: video._id.toString(),
    title: video.title,
    category: video.category,
    createdAt: video.createdAt,
    expiresAt: video.expiresAt,
    thumbnailUrl: video.thumbnailTelegramFileId ? `${base}/api/videos/${video._id}/thumbnail` : "",
  };
}

// ---------- Public: paginated gallery listing (thumbnails only) ----------
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { category } = req.query;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = env.videosPageSize;

    const filter = category && category !== "all" ? { category } : {};
    const videos = await Video.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    res.json(videos.map((v) => toPublicVideo(req, v)));
  })
);

// ---------- Admin: full list for the management tab ----------
router.get(
  "/admin/all",
  requireAuth,
  asyncHandler(async (req, res) => {
    const videos = await Video.find().sort({ createdAt: -1 }).lean();
    res.json(videos.map((v) => toPublicVideo(req, v)));
  })
);

// ---------- Lazy playback resolution - called only when the user presses play ----------
router.get(
  "/:id/play",
  asyncHandler(async (req, res) => {
    const video = await Video.findById(req.params.id).lean();
    if (!video) return res.status(404).json({ error: "Video not found." });
    res.json({ embedUrl: getDriveEmbedUrl(video.driveFileId) });
  })
);

// ---------- Chunked upload: init ----------
router.post(
  "/upload/init",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { title, category, mimeType } = req.body || {};
    if (!category) return res.status(400).json({ error: "Category is required." });

    const categoryExists = await Category.findOne({ slug: category });
    if (!categoryExists) return res.status(400).json({ error: "Unknown category." });

    const uploadId = createSession({
      type: "video",
      title: title || "वीडियो",
      category,
      mimeType: mimeType || "video/mp4",
    });

    res.json({ uploadId });
  })
);

// ---------- Chunked upload: receive one chunk ----------
router.post(
  "/upload/chunk/:uploadId",
  requireAuth,
  rawChunk,
  asyncHandler(async (req, res) => {
    const session = getSession(req.params.uploadId);
    if (!session) return res.status(404).json({ error: "Upload session not found or expired." });

    const buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    await appendChunk(req.params.uploadId, buffer);
    res.json({ received: true });
  })
);

// ---------- Chunked upload: finalize ----------
// 1. extract a thumbnail frame from the assembled temp file
// 2. push the thumbnail to Telegram (small image, same path as photos)
// 3. push the full video to Google Drive
// 4. save metadata + both references + a 4-month expiry in Mongo
router.post(
  "/upload/complete/:uploadId",
  requireAuth,
  asyncHandler(async (req, res) => {
    const uploadId = req.params.uploadId;
    const session = getSession(uploadId);
    if (!session || session.type !== "video") {
      return res.status(404).json({ error: "Upload session not found or expired." });
    }

    if (!fs.existsSync(session.tempPath) || fs.statSync(session.tempPath).size === 0) {
      dropSession(uploadId);
      return res.status(400).json({ error: "No file data was received." });
    }

    let thumbnailFileId = null;
    try {
      const thumbPath = await extractThumbnail(session.tempPath);
      const thumbUpload = await uploadFileToTelegram(thumbPath, "thumbnail.jpg", "image/jpeg");
      thumbnailFileId = thumbUpload.fileId;
      fs.promises.unlink(thumbPath).catch(() => {});
    } catch (err) {
      // A missing thumbnail shouldn't block the whole upload - the frontend
      // just falls back to its plain "play" icon placeholder.
      // eslint-disable-next-line no-console
      console.warn("[videos] thumbnail extraction failed:", err.message);
    }

    const ext = session.mimeType?.split("/")[1] || "mp4";
    const filename = `${session.title.replace(/[^\w\-]+/g, "_")}.${ext}`;
    const { fileId, size } = await uploadFileToDrive(session.tempPath, filename, session.mimeType);

    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + env.videoRetentionMonths);

    const video = await Video.create({
      title: session.title,
      category: session.category,
      driveFileId: fileId,
      thumbnailTelegramFileId: thumbnailFileId,
      mimeType: session.mimeType,
      size,
      expiresAt,
    });

    dropSession(uploadId);
    res.status(201).json(toPublicVideo(req, video));
  })
);

// ---------- Chunked upload: cancel ----------
router.post(
  "/upload/cancel/:uploadId",
  requireAuth,
  asyncHandler(async (req, res) => {
    dropSession(req.params.uploadId);
    res.json({ success: true });
  })
);

// ---------- Thumbnail image ----------
router.get(
  "/:id/thumbnail",
  asyncHandler(async (req, res) => {
    const video = await Video.findById(req.params.id).lean();
    if (!video || !video.thumbnailTelegramFileId) {
      return res.status(404).json({ error: "Thumbnail not found." });
    }
    await streamTelegramFile(video.thumbnailTelegramFileId, res);
  })
);

// ---------- Download (proxied through our server from Drive) ----------
router.get(
  "/:id/download",
  asyncHandler(async (req, res) => {
    const video = await Video.findById(req.params.id).lean();
    if (!video) return res.status(404).json({ error: "Video not found." });
    const ext = video.mimeType?.split("/")[1] || "mp4";
    await streamDriveFile(video.driveFileId, res, {
      download: true,
      filename: `${video.title || "video"}.${ext}`,
    });
  })
);

// ---------- Delete ----------
router.delete(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const video = await Video.findById(req.params.id);
    if (!video) return res.status(404).json({ error: "Video not found." });

    await deleteDriveFile(video.driveFileId);
    await video.deleteOne();
    res.json({ success: true });
  })
);

export default router;
