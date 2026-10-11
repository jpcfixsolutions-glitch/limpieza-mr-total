import { Router } from "express";
import { FixedExpenseController } from "../controllers/fixedExpense.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { requireRole } from "../middleware/role.middleware.js";
import { requireBusinessUnit } from "../middleware/businessUnit.middleware.js";

const router = Router();
router.use(authenticate, requireBusinessUnit("LOCAL"));

router.get("/", FixedExpenseController.getAll);
router.post("/", requireRole("admin"), FixedExpenseController.create);
router.put("/:id", requireRole("admin"), FixedExpenseController.update);
router.delete("/:id", requireRole("admin"), FixedExpenseController.remove);

export default router;
