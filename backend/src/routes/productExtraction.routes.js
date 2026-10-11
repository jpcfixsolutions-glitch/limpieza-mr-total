import { Router } from "express";
import { ProductExtractionController } from "../controllers/productExtraction.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { requireRole } from "../middleware/role.middleware.js";

const router = Router();
router.get("/summary", authenticate, ProductExtractionController.summary);
router.get("/", authenticate, ProductExtractionController.list);
router.post("/", authenticate, requireRole("admin"), ProductExtractionController.create);
export default router;
