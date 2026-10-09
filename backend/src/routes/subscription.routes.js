import { Router } from "express";
import { SubscriptionController } from "../controllers/subscription.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { requireRole } from "../middleware/role.middleware.js";

const router = Router();

// Cualquier usuario autenticado puede consultar el estado (para mostrar el bloqueo)
router.get("/status", authenticate, SubscriptionController.getStatus);

// Solo el creador puede modificar la configuración
router.post("/set-cutoff", authenticate, requireRole("creador"), SubscriptionController.setCutoffDay);
router.post("/reactivate", authenticate, requireRole("creador"), SubscriptionController.reactivate);

export default router;
