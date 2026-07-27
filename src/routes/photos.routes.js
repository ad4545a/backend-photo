import { Router } from "express";
import express from "express";
import fs from "fs";
import Photo from "../models/Photo.js";
import Category from "../models/Category.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { env } from "../config/env.js";
import { uploadFileToTelegram, streamTelegramFile, deleteTelegramMessage } from "../config/telegram.js";
import { createSession, getSession, appendChunk, dropSession } from "../utils/uploadSessions.js";

const router = Router();
const rawChunk = express.raw({ type: "application/octet-stream", limit: "5mb" });

function toPublicPhoto(req, photo) {
  const base = `${req.protocol}://${req.get("host")}`;
  return {
    id: photo._id.toString(),
    title: photo.title,
    category: photo.category,
    createdAt: photo.createdAt,
    fileUrl: `${base}/api/photos/${photo._id}/file`,
  };
}

// ---------- Public: paginated gallery listing ----------
// GET /api/photos?category=events&page=1
// Always capped server-side to PHOTOS_PAGE_SIZE, regardless of what's asked
// for, so the gallery can never accidentally pull every photo at once.
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { category } = req.query;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = env.photosPageSize;

    const filter = category && category !== "all" ? { category } : {};
    const photos = await Photo.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    res.json(photos.map((p) => toPublicPhoto(req, p)));
  })
);

// ---------- Admin: full list for the management tab ----------
// GET /api/photos/admin/all - not paginated (admin needs to see/delete everything),
// but this route requires a valid token so it's never exposed publicly.
router.get(
  "/admin/all",
  requireAuth,
  asyncHandler(async (req, res) => {
    const photos = await Photo.find().sort({ createdAt: -1 }).lean();
    res.json(photos.map((p) => toPublicPhoto(req, p)));
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
      type: "photo",
      title: title || "तस्वीर",
      category,
      mimeType: mimeType || "image/jpeg",
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

// ---------- Chunked upload: finalize (push the assembled file to Telegram) ----------
router.post(
  "/upload/complete/:uploadId",
  requireAuth,
  asyncHandler(async (req, res) => {
    const uploadId = req.params.uploadId;
    const session = getSession(uploadId);
    if (!session || session.type !== "photo") {
      return res.status(404).json({ error: "Upload session not found or expired." });
    }

    if (!fs.existsSync(session.tempPath) || fs.statSync(session.tempPath).size === 0) {
      dropSession(uploadId);
      return res.status(400).json({ error: "No file data was received." });
    }

    const ext = session.mimeType?.split("/")[1] || "jpg";
    const filename = `${session.title.replace(/[^\w\-]+/g, "_")}.${ext}`;

    const { fileId, messageId, fileSize } = await uploadFileToTelegram(
      session.tempPath,
      filename,
      session.mimeType
    );

    const photo = await Photo.create({
      title: session.title,
      category: session.category,
      telegramFileId: fileId,
      telegramMessageId: messageId,
      mimeType: session.mimeType,
      size: fileSize,
    });

    dropSession(uploadId);
    res.status(201).json(toPublicPhoto(req, photo));
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

// ---------- Stream the image bytes (used as <img src>) ----------
router.get(
  "/:id/file",
  asyncHandler(async (req, res) => {
    const photo = await Photo.findById(req.params.id).lean();
    if (!photo) return res.status(404).json({ error: "Photo not found." });
    await streamTelegramFile(photo.telegramFileId, res);
  })
);

// ---------- Download with a friendly filename ----------
router.get(
  "/:id/download",
  asyncHandler(async (req, res) => {
    const photo = await Photo.findById(req.params.id).lean();
    if (!photo) return res.status(404).json({ error: "Photo not found." });
    const ext = photo.mimeType?.split("/")[1] || "jpg";
    await streamTelegramFile(photo.telegramFileId, res, {
      download: true,
      filename: `${photo.title || "photo"}.${ext}`,
    });
  })
);

// ---------- Delete ----------
router.delete(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const photo = await Photo.findById(req.params.id);
    if (!photo) return res.status(404).json({ error: "Photo not found." });

    if (photo.telegramMessageId) {
      await deleteTelegramMessage(photo.telegramMessageId);
    }
    await photo.deleteOne();
    res.json({ success: true });
  })
);

export default router;
