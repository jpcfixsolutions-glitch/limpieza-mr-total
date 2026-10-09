import { Router } from "express";
import { FixedExpenseController } from "../controllers/fixedExpense.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { requireRole } from "../middleware/role.middleware.js";

const router = Router();

router.get("/", authenticate, FixedExpenseController.getAll);
router.post("/", authenticate, requireRole("admin"), FixedExpenseController.create);
router.put("/:id", authenticate, requireRole("admin"), FixedExpenseController.update);
router.delete("/:id", authenticate, requireRole("admin"), FixedExpenseController.remove);

export default router;
