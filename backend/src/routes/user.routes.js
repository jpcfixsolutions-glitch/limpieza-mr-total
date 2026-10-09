import { Router } from "express";
import { UserController } from "../controllers/user.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { requireRole } from "../middleware/role.middleware.js";

const router = Router();

router.use(authenticate, requireRole("admin"));

router.get("/", UserController.getAll);
router.put("/:id", UserController.update);
router.delete("/:id", UserController.remove);

export default router;
