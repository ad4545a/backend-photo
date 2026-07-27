import mongoose from "mongoose";

const videoSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    category: { type: String, required: true, index: true }, // category slug

    // The actual video bytes live on Google Drive.
    driveFileId: { type: String, required: true },

    // The thumbnail (a single extracted frame) is small, so it's stored the
    // same way photos are - on Telegram - to keep infra to two services.
    thumbnailTelegramFileId: { type: String },

    mimeType: { type: String },
    size: { type: Number },

    // Videos are only kept for VIDEO_RETENTION_MONTHS; a cron job deletes
    // both the Drive file and this document once expiresAt passes.
    expiresAt: { type: Date, required: true, index: true },
  },
  { timestamps: true }
);

videoSchema.index({ createdAt: -1 });

export default mongoose.model("Video", videoSchema);
