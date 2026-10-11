import { WarehouseService } from "../services/warehouse.service.js";
import { sendControllerError } from "./controllerError.js";

function requestKey(req) {
  return req.headers["idempotency-key"] || req.body?.idempotencyKey;
}

export const WarehouseController = {
  async listOrders(req, res) { try { res.json(await WarehouseService.listOrders(req.businessUnit)); } catch (e) { sendControllerError(res, e); } },
  async createOrder(req, res) {
    try {
      const result = await WarehouseService.createOrder({ ...req.body, idempotencyKey: requestKey(req) }, req.user.id, req.businessUnit);
      res.status(result.duplicated ? 200 : 201).json(result);
    } catch (e) { sendControllerError(res, e); }
  },
  async updateOrder(req, res) {
    try { res.json(await WarehouseService.updateDraftOrder(req.params.id, req.body, req.businessUnit)); }
    catch (e) { sendControllerError(res, e); }
  },
  async changeOrderStatus(req, res) {
    try { res.json(await WarehouseService.changeOrderStatus(req.params.id, req.body.status, req.user.id, req.businessUnit)); }
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
  async stats(req, res) { try { res.json(await WarehouseService.stats(req.businessUnit)); } catch (e) { sendControllerError(res, e); } },
};
