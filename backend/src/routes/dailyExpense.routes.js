import { Router } from "express";
import { DailyExpenseController } from "../controllers/dailyExpense.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { requireBusinessUnit } from "../middleware/businessUnit.middleware.js";
import { requireRole } from '../middleware/role.middleware.js';

const router = Router();

router.get("/", authenticate, requireBusinessUnit("LOCAL"), DailyExpenseController.getAll);
router.post("/", authenticate, requireBusinessUnit("LOCAL"), DailyExpenseController.create);
router.patch('/:id/status', authenticate, requireBusinessUnit('LOCAL'), requireRole('admin','cajero'), DailyExpenseController.changeStatus);

router.post('/:id/payments', authenticate, requireBusinessUnit('LOCAL'), requireRole('admin','cajero'), DailyExpenseController.registerPayment);
export default router;
