import app from "./app.js";
import { env } from "./config/env.js";
import { connectDB } from "./config/db.js";
import { scheduleVideoExpiry } from "./utils/expireVideos.js";

async function main() {
  await connectDB();
  scheduleVideoExpiry();

  app.listen(env.port, () => {
    // eslint-disable-next-line no-console
    console.log(`[server] listening on http://localhost:${env.port}`);
  });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[server] failed to start:", err);
  process.exit(1);
});
