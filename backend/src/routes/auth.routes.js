import { Router } from "express";
import { AuthController } from "../controllers/auth.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { requireRole } from "../middleware/role.middleware.js";

const router = Router();

router.post("/login", AuthController.login);
router.post("/register", authenticate, requireRole("admin"), AuthController.register);

export default router;
