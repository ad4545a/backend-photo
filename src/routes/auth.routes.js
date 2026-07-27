import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

// There's a single admin account (no signup flow), configured via env vars.
// POST /api/auth/login  { username, password } -> { token }
router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: "Username and password are required." });
    }

    if (username !== env.adminUsername) {
      return res.status(401).json({ error: "Invalid username or password." });
    }

    const ok = await bcrypt.compare(password, env.adminPasswordHash || "");
    if (!ok) {
      return res.status(401).json({ error: "Invalid username or password." });
    }

    const token = jwt.sign({ sub: username, role: "admin" }, env.jwtSecret, {
      expiresIn: env.jwtExpiresIn,
    });

    res.json({ token });
  })
);

export default router;
