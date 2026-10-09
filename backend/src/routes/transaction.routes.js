import { Router } from "express";
import { TransactionController } from "../controllers/transaction.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";

const router = Router();

router.post("/", authenticate, TransactionController.create);
router.get("/register/:registerId", authenticate, TransactionController.getByRegisterId);

export default router;
