import { Router } from "express";
import { PriceGroupController } from "../controllers/priceGroup.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { requireRole } from "../middleware/role.middleware.js";

const router = Router();

router.get("/", authenticate, PriceGroupController.getAll);
router.post("/", authenticate, requireRole("admin"), PriceGroupController.create);
router.put("/:id", authenticate, requireRole("admin"), PriceGroupController.update);
router.delete("/:id", authenticate, requireRole("admin"), PriceGroupController.remove);
router.post("/:id/increase", authenticate, requireRole("admin"), PriceGroupController.applyIncrease);

export default router;
