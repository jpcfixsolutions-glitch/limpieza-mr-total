import { Router } from "express";
import { InventoryController } from "../controllers/inventory.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { requireRole } from "../middleware/role.middleware.js";

const router = Router();
router.get("/movements", authenticate, InventoryController.movements);
router.post("/transfers", authenticate, requireRole("admin"), InventoryController.transfer);
export default router;
