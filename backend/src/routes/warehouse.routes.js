import { WarehouseStockOptionsService } from '../services/warehouseStockOptions.service.js';
import { WarehouseLiquidsService } from '../services/warehouseLiquids.service.js';
import { sendControllerError } from '../controllers/controllerError.js';
import { Router } from "express";
import { WarehouseController } from "../controllers/warehouse.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { requireRole } from "../middleware/role.middleware.js";
import { requireBusinessUnit } from "../middleware/businessUnit.middleware.js";

const router = Router();
router.use(authenticate, requireRole("admin", "EMPLEADO_GALPON"), requireBusinessUnit("WAREHOUSE"));
const adminOnly = requireRole("admin");
const liquidAction = action => async (req, res) => {
  try { res.set('Cache-Control','no-store').json(await action(req)); }
  catch (e) { if (String(e?.message).includes('warehouse_liquid_products.barcode')) return res.status(409).json({ message: 'El código ya existe en Galpón.' }); sendControllerError(res,e); }
};
const employeeLiquid = p => {
  const { cost, price, ...safe } = p; return safe;
};
router.get('/liquids', liquidAction(async req => {
  const rows = await WarehouseLiquidsService.list(req.businessUnit);
  return req.user.role === 'EMPLEADO_GALPON' ? rows.map(employeeLiquid) : rows;
}));
router.get('/stock-options', liquidAction(req => WarehouseStockOptionsService.list(req.businessUnit, req.user.role==='admin' && req.query.includeInactive==='true')));
router.post('/settings/:entity(category|container-type)', adminOnly, liquidAction(req => WarehouseStockOptionsService.save(req.businessUnit,req.params.entity,req.body,req.user.id)));
router.put('/settings/:entity(category|container-type)/:id', adminOnly, liquidAction(req => WarehouseStockOptionsService.save(req.businessUnit,req.params.entity,req.body,req.user.id,req.params.id)));
router.delete('/settings/:entity(category|container-type)/:id', adminOnly, liquidAction(req => WarehouseStockOptionsService.save(req.businessUnit,req.params.entity,req.body,req.user.id,req.params.id,true)));
router.get('/legacy-stock', liquidAction(req => WarehouseLiquidsService.legacy(req.businessUnit)));
router.post('/liquids', adminOnly, liquidAction(req => WarehouseLiquidsService.save(null, req.body, req.user.id, req.businessUnit)));
router.put('/liquids/:id', liquidAction(req => WarehouseLiquidsService.save(req.params.id, req.body, req.user.id, req.businessUnit, req.user.role === 'EMPLEADO_GALPON')));
router.delete('/liquids/:id', adminOnly, liquidAction(req => WarehouseLiquidsService.archive(req.params.id, req.body, req.user.id, req.businessUnit)));
router.get('/liquids/:id/history', adminOnly, liquidAction(req => WarehouseLiquidsService.history(req.params.id, req.businessUnit)));
router.get("/operations", WarehouseController.operations);
router.post("/production-preview", adminOnly, WarehouseController.productionPreview);
router.post("/customers", adminOnly, WarehouseController.createCustomer);
router.get("/orders", WarehouseController.listOrders);
router.post("/orders", adminOnly, WarehouseController.createOrder);
router.put("/orders/:id", adminOnly, WarehouseController.updateOrder);
router.patch("/orders/:id/status", WarehouseController.changeOrderStatus);
router.patch("/orders/:id/items/:itemId/status", WarehouseController.changeItemStatus);
router.patch("/stock/:id", WarehouseController.updateStock);
router.get("/purchases", adminOnly, WarehouseController.listPurchases);
router.post("/purchases", adminOnly, WarehouseController.createPurchase);
router.patch("/purchases/:id/status", adminOnly, WarehouseController.changePurchaseStatus);
router.get("/stats", adminOnly, WarehouseController.stats);
router.get("/activity/:date", adminOnly, WarehouseController.activity);
router.post("/expenses", adminOnly, WarehouseController.expense);
router.put("/expenses/:id", adminOnly, WarehouseController.expense);
router.delete("/expenses/:id", adminOnly, WarehouseController.expense);
router.post("/orders/:id/receipts", adminOnly, WarehouseController.receipt);
router.get('/settings', adminOnly, WarehouseController.settings);
router.post('/settings/:entity', adminOnly, WarehouseController.saveSetting);
router.put('/settings/:entity/:id', adminOnly, WarehouseController.saveSetting);
router.post('/fixed-occurrences/:id/pay', adminOnly, WarehouseController.settleFixed);
export default router;
