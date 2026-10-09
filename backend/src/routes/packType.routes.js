import { Router } from "express";
import { PackTypeController } from "../controllers/packType.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { requireRole } from "../middleware/role.middleware.js";

const router = Router();

router.get("/", authenticate, PackTypeController.getAll);
router.post("/", authenticate, requireRole("admin"), PackTypeController.create);
router.put("/:id", authenticate, requireRole("admin"), PackTypeController.update);
router.delete("/:id", authenticate, requireRole("admin"), PackTypeController.remove);

export default router;
