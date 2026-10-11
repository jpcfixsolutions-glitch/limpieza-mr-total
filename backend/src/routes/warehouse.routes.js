import { Router } from "express";
import { WarehouseController } from "../controllers/warehouse.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { requireRole } from "../middleware/role.middleware.js";
import { requireBusinessUnit } from "../middleware/businessUnit.middleware.js";

const router = Router();
router.use(authenticate, requireRole("admin"), requireBusinessUnit("WAREHOUSE"));
router.get("/orders", WarehouseController.listOrders);
router.post("/orders", WarehouseController.createOrder);
router.put("/orders/:id", WarehouseController.updateOrder);
router.patch("/orders/:id/status", WarehouseController.changeOrderStatus);
router.get("/purchases", WarehouseController.listPurchases);
router.post("/purchases", WarehouseController.createPurchase);
router.patch("/purchases/:id/status", WarehouseController.changePurchaseStatus);
router.get("/stats", WarehouseController.stats);
export default router;
