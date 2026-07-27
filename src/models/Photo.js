import mongoose from "mongoose";

const photoSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    category: { type: String, required: true, index: true }, // category slug

    // Where the actual bytes live - Telegram, not our disk.
    telegramFileId: { type: String, required: true },
    telegramMessageId: { type: Number },

    mimeType: { type: String },
    size: { type: Number },
  },
  { timestamps: true }
);

photoSchema.index({ createdAt: -1 });

export default mongoose.model("Photo", photoSchema);
