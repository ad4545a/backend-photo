import { Router } from "express";
import Category from "../models/Category.js";
import Photo from "../models/Photo.js";
import Video from "../models/Video.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { slugify } from "../utils/slugify.js";

const router = Router();

// Public: list all categories
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const categories = await Category.find().sort({ createdAt: 1 }).lean();
    res.json(categories.map((c) => ({ name: c.name, slug: c.slug })));
  })
);

// Admin: create a category
router.post(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { name } = req.body || {};
    if (!name || !name.trim()) {
      return res.status(400).json({ error: "Category name is required." });
    }

    const slug = slugify(name);
    const existing = await Category.findOne({ slug });
    if (existing) {
      return res.status(409).json({ error: "This category already exists." });
    }

    const category = await Category.create({ name: name.trim(), slug });
    res.status(201).json({ name: category.name, slug: category.slug });
  })
);

// Admin: delete a category. Photos/videos already tagged with it are left
// alone (they just keep their old category slug) rather than being deleted.
router.delete(
  "/:slug",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { slug } = req.params;
    const inUsePhotos = await Photo.countDocuments({ category: slug });
    const inUseVideos = await Video.countDocuments({ category: slug });
    if (inUsePhotos > 0 || inUseVideos > 0) {
      return res.status(409).json({
        error: `Can't delete - ${inUsePhotos + inUseVideos} item(s) still use this category.`,
      });
    }

    await Category.deleteOne({ slug });
    res.json({ success: true });
  })
);

export default router;
