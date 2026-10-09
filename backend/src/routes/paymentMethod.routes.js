import { Router } from "express";
import { PaymentMethodController } from "../controllers/paymentMethod.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { requireRole } from "../middleware/role.middleware.js";

const router = Router();

router.get("/", authenticate, PaymentMethodController.getAll);
router.post("/", authenticate, requireRole("admin"), PaymentMethodController.create);
router.put("/:id", authenticate, requireRole("admin"), PaymentMethodController.update);
router.delete("/:id", authenticate, requireRole("admin"), PaymentMethodController.remove);

export default router;
