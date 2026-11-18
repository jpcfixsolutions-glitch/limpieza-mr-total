import { WarehouseSettingsService } from "../services/warehouseSettings.service.js";
import { WarehouseService } from "../services/warehouse.service.js";
import { sendControllerError } from "./controllerError.js";
import { employeeOperations, employeeOrder, employeeOrderInput, employeeCustomerInput, employeeCustomer, employeePreview, employeeStateInput } from "../services/warehouseEmployee.js";
import { SubscriptionService } from "../services/subscription.service.js";
import { WarehouseActivityService } from "../services/warehouseActivity.service.js";

const isEmployee = (req) => req.user.role === "EMPLEADO_GALPON";

function requestKey(req) {
  return req.headers["idempotency-key"] || req.body?.idempotencyKey;
}

export const WarehouseController = {
  async expenseStatus(req,res) { try { res.json(await WarehouseActivityService.changeExpenseStatus(req.businessUnit,req.params.id,req.body,req.user.id)); } catch(e) { sendControllerError(res,e); } },
  async settings(req,res) { try { res.set('Cache-Control','no-store').json(await WarehouseSettingsService.get(req.businessUnit)); } catch(e) { sendControllerError(res,e); } },
  async saveSetting(req,res) { try {
    if (!['expense','method'].includes(req.params.entity)) return res.status(404).json({message:'Configuración no encontrada.'});
    res.json(await WarehouseSettingsService.save(req.businessUnit,req.params.entity,req.body,req.user.id,req.params.id));
  } catch(e) { sendControllerError(res,e); } },
  async settleFixed(req,res) { try { res.json(await WarehouseSettingsService.settle(req.businessUnit,req.params.id,req.body,req.user.id)); } catch(e) { sendControllerError(res,e); } },
  async operations(req, res) {
    try {
      const data = await WarehouseService.operations(req.businessUnit);
      if (!isEmployee(req)) return res.set("Cache-Control", "no-store").json(data);
      // Conservar el bloqueo de acceso existente sin dar al empleado acceso
      // al módulo de configuración de suscripción ni a sus datos de pago.
      const { isExpired, isWarningPhase, daysRemaining } = await SubscriptionService.getStatus();
      res.set("Cache-Control", "no-store").json({ ...employeeOperations(data), access: { isExpired, isWarningPhase, daysRemaining } });
    } catch (e) { sendControllerError(res, e); }
  },
  async productionPreview(req, res) {
    try {
      if (!Array.isArray(req.body.items) || !req.body.items.length) return res.status(400).json({ message: "Agregá productos para calcular la producción." });
      const items=isEmployee(req)?employeeOrderInput(req.body,true).items:req.body.items;
      const result = await WarehouseService.operations(req.businessUnit, items, {useCatalogPrices:isEmployee(req)});
      res.set("Cache-Control", "no-store").json(isEmployee(req)?employeePreview(result.preview):result.preview);
    } catch (e) { sendControllerError(res, e); }
  },
  async createCustomer(req, res) {
    try {
      const input=isEmployee(req)?employeeCustomerInput(req.body):req.body;
      const result = await WarehouseService.createCustomer(input, req.businessUnit);
      res.status(result.duplicated ? 200 : 201).json(isEmployee(req)?employeeCustomer(result):result);
    } catch (e) { sendControllerError(res, e); }
  },
  async listOrders(req, res) { try { const orders = await WarehouseService.listOrders(req.businessUnit); res.json(isEmployee(req) ? orders.map(employeeOrder) : orders); } catch (e) { sendControllerError(res, e); } },
  async createOrder(req, res) {
    try {
      const body={...req.body,idempotencyKey:requestKey(req)};
      const input=isEmployee(req)?employeeOrderInput(body):body;
      const result = await WarehouseService.createOrder(input, req.user.id, req.businessUnit, {useCatalogPrices:isEmployee(req)});
      res.status(result.duplicated ? 200 : 201).json(isEmployee(req)?{...employeeOrder(result),duplicated:result.duplicated}:result);
    } catch (e) { sendControllerError(res, e); }
  },
  async updateOrder(req, res) {
    try { res.json(await WarehouseService.updateDraftOrder(req.params.id, req.body, req.businessUnit)); }
    catch (e) { sendControllerError(res, e); }
  },
  async changeOrderStatus(req, res) {
    try {
      if (isEmployee(req) && !["preparing", "ready", "dispatched", "delivered"].includes(req.body.status)) return res.status(403).json({ message: "No tenés permiso para cancelar ni confirmar borradores." });
      if(isEmployee(req)) employeeStateInput(req.body, true);
      const order = await WarehouseService.changeOrderStatus(req.params.id, req.body.status, req.user.id, req.businessUnit, req.body.expectedVersion, req.body.liquidAllocations);
      res.json(isEmployee(req) ? employeeOrder(order) : order);
    }
    catch (e) { sendControllerError(res, e); }
  },
  async changeItemStatus(req, res) {
    try { if(isEmployee(req)) employeeStateInput(req.body);const order = await WarehouseService.changeItemStatus(req.params.id, req.params.itemId, req.body.status, req.businessUnit, req.body.expectedVersion); res.json(isEmployee(req) ? employeeOrder(order) : order); }
    catch (e) { sendControllerError(res, e); }
  },
  async updateStock(req, res) {
    try { res.json(await WarehouseService.updateStock(req.params.id, req.body, req.user.id, req.businessUnit)); }
    catch (e) { sendControllerError(res, e); }
  },
  async listPurchases(req, res) { try { res.json(await WarehouseService.listPurchases(req.businessUnit)); } catch (e) { sendControllerError(res, e); } },
  async createPurchase(req, res) {
    try {
      const result = await WarehouseService.createPurchase({ ...req.body, idempotencyKey: requestKey(req) }, req.user.id, req.businessUnit);
      res.status(result.duplicated ? 200 : 201).json(result);
    } catch (e) { sendControllerError(res, e); }
  },
  async changePurchaseStatus(req, res) {
    try { res.json(await WarehouseService.changePurchaseStatus(req.params.id, req.body.status, req.user.id, req.businessUnit)); }
    catch (e) { sendControllerError(res, e); }
  },
  async stats(req, res) { try { res.set("Cache-Control", "no-store").json(await WarehouseActivityService.stats(req.businessUnit, req.query)); } catch (e) { sendControllerError(res, e); } },
  async activity(req, res) { try { res.set("Cache-Control", "no-store").json(await WarehouseActivityService.day(req.businessUnit, req.params.date)); } catch (e) { sendControllerError(res, e); } },
  async expense(req, res) { try { res.json(await WarehouseActivityService.expense(req.businessUnit, { ...req.body, idempotencyKey: requestKey(req) }, req.user.id, req.params.id, req.method === "DELETE")); } catch (e) { sendControllerError(res, e); } },
  async receipt(req, res) { try { res.json(await WarehouseActivityService.receipt(req.businessUnit, req.params.id, { ...req.body, idempotencyKey: requestKey(req) }, req.user.id)); } catch (e) { sendControllerError(res, e); } },
};
