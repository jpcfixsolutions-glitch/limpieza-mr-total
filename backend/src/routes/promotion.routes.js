import { Router } from "express";
import { PromotionController } from "../controllers/promotion.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { requireRole } from "../middleware/role.middleware.js";

const router = Router();
router.get("/", authenticate, PromotionController.getAll);
router.post("/", authenticate, requireRole("admin"), PromotionController.create);
router.put("/:id", authenticate, requireRole("admin"), PromotionController.update);
router.delete("/:id", authenticate, requireRole("admin"), PromotionController.remove);
export default router;
