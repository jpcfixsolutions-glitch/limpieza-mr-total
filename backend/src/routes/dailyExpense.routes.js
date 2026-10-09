import { Router } from "express";
import { DailyExpenseController } from "../controllers/dailyExpense.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";

const router = Router();

router.get("/", authenticate, DailyExpenseController.getAll);
router.post("/", authenticate, DailyExpenseController.create);

export default router;
