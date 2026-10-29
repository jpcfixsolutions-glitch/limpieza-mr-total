import { TransactionService } from "../services/transaction.service.js";
import { sendControllerError } from "./controllerError.js";

export const TransactionController = {
  async getById(req, res) {
    try {
      res.json(await TransactionService.getById(req.params.id, req.businessUnit));
    } catch (err) {
      sendControllerError(res, err);
    }
  },

  async create(req, res) {
    try {
      const result = await TransactionService.create({
        ...req.body,
        idempotencyKey: req.headers["idempotency-key"] || req.body.idempotencyKey,
      }, req.user.id, req.businessUnit);
      res.status(201).json(result);
    } catch (err) {
      sendControllerError(res, err);
    }
  },

  async getByRegisterId(req, res) {
    try {
      const { registerId } = req.params;
      const result = await TransactionService.getByRegisterId(Number(registerId), req.businessUnit);
      res.json(result);
    } catch (err) {
      sendControllerError(res, err);
    }
  },
};
