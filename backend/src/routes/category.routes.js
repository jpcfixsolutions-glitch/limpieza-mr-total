import { Router } from "express";
import { CategoryController } from "../controllers/category.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { requireRole } from "../middleware/role.middleware.js";

const router = Router();

router.get("/", authenticate, CategoryController.getAll);
router.post("/", authenticate, requireRole("admin"), CategoryController.create);
router.put("/:id", authenticate, requireRole("admin"), CategoryController.update);
router.delete("/:id", authenticate, requireRole("admin"), CategoryController.remove);

export default router;
