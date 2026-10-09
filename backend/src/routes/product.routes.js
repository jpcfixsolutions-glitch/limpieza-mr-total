import { Router } from "express";
import { ProductController } from "../controllers/product.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { requireRole } from "../middleware/role.middleware.js";

const router = Router();

router.get("/", authenticate, ProductController.getAll);
router.get("/by-barcode/:codbarra", authenticate, ProductController.getByCodbarra);
router.post("/", authenticate, requireRole("admin"), ProductController.create);
router.post("/bulk-assign", authenticate, requireRole("admin"), ProductController.bulkAssign);
router.put("/:id", authenticate, requireRole("admin"), ProductController.update);
router.delete("/:id", authenticate, requireRole("admin"), ProductController.remove);

export default router;
