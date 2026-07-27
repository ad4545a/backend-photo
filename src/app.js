import express from "express";
import cors from "cors";
import { env } from "./config/env.js";
import { errorHandler, notFound } from "./middleware/errorHandler.js";

import authRoutes from "./routes/auth.routes.js";
import categoryRoutes from "./routes/categories.routes.js";
import photoRoutes from "./routes/photos.routes.js";
import videoRoutes from "./routes/videos.routes.js";

const app = express();

app.use(
  cors({
    origin: env.corsOrigin.includes("*") ? true : env.corsOrigin,
  })
);

// NOTE: the raw-body chunk upload routes (photos/videos upload/chunk/:id)
// register their own express.raw() middleware scoped to just that route,
// so this global json parser doesn't interfere with binary chunk bodies.
app.use(express.json({ limit: "2mb" }));

app.get("/health", (req, res) => res.json({ ok: true }));

app.use("/api/auth", authRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/photos", photoRoutes);
app.use("/api/videos", videoRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
