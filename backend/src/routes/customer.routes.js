import { Router } from "express";
import { CustomerController } from "../controllers/customer.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { requireRole } from "../middleware/role.middleware.js";

const router = Router();

const operativo = requireRole("admin", "cajero");

router.get("/", authenticate, operativo, CustomerController.list);
router.post("/", authenticate, operativo, CustomerController.create);
// Rutas específicas antes de "/:id" para que no las capture el parámetro
router.get("/payments/register/:registerId", authenticate, operativo, CustomerController.getPaymentsByRegister);
router.get("/movements", authenticate, operativo, CustomerController.listMovements);
router.get("/document/:document", authenticate, operativo, CustomerController.getByDocument);
router.get("/:id", authenticate, operativo, CustomerController.getDetail);
router.post("/:id/payments", authenticate, operativo, CustomerController.registerPayment);

export default router;
