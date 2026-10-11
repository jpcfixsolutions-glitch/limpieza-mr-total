import { InventoryService } from "../services/inventory.service.js";
import { sendControllerError } from "./controllerError.js";

export const InventoryController = {
  async movements(req, res) {
    try { res.json(await InventoryService.listMovements(req.businessUnit.id, req.query)); }
    catch (error) { sendControllerError(res, error); }
  },
  async transfer(req, res) {
    try {
      const result = await InventoryService.transfer({
        ...req.body,
        idempotencyKey: req.headers["idempotency-key"] || req.body.idempotencyKey,
      }, req.user.id);
      res.status(result.duplicated ? 200 : 201).json(result);
    } catch (error) { sendControllerError(res, error); }
  },
};
