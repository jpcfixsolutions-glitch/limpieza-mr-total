import { Router } from "express";
import { BusinessUnitController } from "../controllers/businessUnit.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";

const router = Router();
router.get("/", authenticate, BusinessUnitController.list);
export default router;
