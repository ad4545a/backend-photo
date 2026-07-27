import dotenv from "dotenv";
dotenv.config();

function required(name) {
  const v = process.env[name];
  if (!v) {
    // eslint-disable-next-line no-console
    console.warn(`[env] Warning: ${name} is not set. The app may not work correctly until it is.`);
  }
  return v;
}

export const env = {
  port: process.env.PORT || 5000,
  corsOrigin: (process.env.CORS_ORIGIN || "*").split(",").map((s) => s.trim()),

  mongoUri: required("MONGO_URI"),

  jwtSecret: required("JWT_SECRET"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
  adminUsername: required("ADMIN_USERNAME"),
  adminPasswordHash: required("ADMIN_PASSWORD_HASH"),

  telegramBotToken: required("TELEGRAM_BOT_TOKEN"),
  telegramChatId: required("TELEGRAM_CHAT_ID"),

  googleClientId: required("GOOGLE_CLIENT_ID"),
  googleClientSecret: required("GOOGLE_CLIENT_SECRET"),
  googleRedirectUri: process.env.GOOGLE_REDIRECT_URI || "http://localhost:3000/oauth2callback",
  googleRefreshToken: required("GOOGLE_REFRESH_TOKEN"),
  googleDriveFolderId: required("GOOGLE_DRIVE_FOLDER_ID"),

  videoRetentionMonths: Number(process.env.VIDEO_RETENTION_MONTHS || 4),
  photosPageSize: Number(process.env.PHOTOS_PAGE_SIZE || 10),
  videosPageSize: Number(process.env.VIDEOS_PAGE_SIZE || 5),

  uploadTmpDir: process.env.UPLOAD_TMP_DIR || "./tmp_uploads",
};
