import { Router } from "express";
import { CashRegisterController } from "../controllers/cashRegister.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { requireRole } from "../middleware/role.middleware.js";
import { requireBusinessUnit } from "../middleware/businessUnit.middleware.js";

const router = Router();
const localOnly = requireBusinessUnit("LOCAL");

router.get("/status", authenticate, localOnly, CashRegisterController.getStatus);
router.post("/open", authenticate, localOnly, requireRole("admin"), CashRegisterController.open);
router.post("/close", authenticate, localOnly, requireRole("admin"), CashRegisterController.close);
router.get("/closed", authenticate, localOnly, CashRegisterController.getClosed);

export default router;
