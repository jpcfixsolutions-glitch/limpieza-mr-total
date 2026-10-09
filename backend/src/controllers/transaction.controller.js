import { TransactionService } from "../services/transaction.service.js";
import { sendControllerError } from "./controllerError.js";

export const TransactionController = {
  async create(req, res) {
    try {
      const result = await TransactionService.create(req.body, req.user.id);
      res.status(201).json(result);
    } catch (err) {
      sendControllerError(res, err);
    }
  },

  async getByRegisterId(req, res) {
    try {
      const { registerId } = req.params;
      const result = await TransactionService.getByRegisterId(Number(registerId));
      res.json(result);
    } catch (err) {
      sendControllerError(res, err);
    }
  },
};
