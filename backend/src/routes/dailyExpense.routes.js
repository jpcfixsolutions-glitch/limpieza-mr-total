import { Router } from "express";
import { DailyExpenseController } from "../controllers/dailyExpense.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { requireBusinessUnit } from "../middleware/businessUnit.middleware.js";

const router = Router();

router.get("/", authenticate, requireBusinessUnit("LOCAL"), DailyExpenseController.getAll);
router.post("/", authenticate, requireBusinessUnit("LOCAL"), DailyExpenseController.create);

export default router;
