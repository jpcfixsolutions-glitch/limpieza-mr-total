import { Router } from "express";
import { CashRegisterController } from "../controllers/cashRegister.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { requireRole } from "../middleware/role.middleware.js";

const router = Router();

router.get("/status", authenticate, CashRegisterController.getStatus);
router.post("/open", authenticate, requireRole("admin"), CashRegisterController.open);
router.post("/close", authenticate, requireRole("admin"), CashRegisterController.close);
router.get("/closed", authenticate, CashRegisterController.getClosed);

export default router;
