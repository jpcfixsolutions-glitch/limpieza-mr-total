import { Router } from "express";
import { StatsController } from "../controllers/stats.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { requireRole } from "../middleware/role.middleware.js";

const router = Router();

router.post("/", authenticate, requireRole("admin"), StatsController.createInternalWithdrawal);

export default router;
