import { Router } from "express";
import { StatsController } from "../controllers/stats.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { requireRole } from "../middleware/role.middleware.js";

const router = Router();

router.get("/restock", authenticate, requireRole("admin"), StatsController.getRestockCost);
router.get("/activity-log", authenticate, StatsController.getActivityLog);
router.post("/stock-modifications", authenticate, requireRole("admin"), StatsController.createStockModification);

export default router;
