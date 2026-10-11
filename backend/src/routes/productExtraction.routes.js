import { Router } from "express";
import { ProductExtractionController } from "../controllers/productExtraction.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { requireRole } from "../middleware/role.middleware.js";
import { requireBusinessUnit } from "../middleware/businessUnit.middleware.js";

const router = Router();
router.use(authenticate, requireBusinessUnit("LOCAL"));
router.get("/summary", ProductExtractionController.summary);
router.get("/", ProductExtractionController.list);
router.post("/", requireRole("admin"), ProductExtractionController.create);
export default router;
