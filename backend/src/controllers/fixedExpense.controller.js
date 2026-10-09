import { FixedExpenseService } from "../services/fixedExpense.service.js";
import { sendControllerError } from "./controllerError.js";

export const FixedExpenseController = {
  async getAll(req, res) {
    try {
      res.json(await FixedExpenseService.getAll());
    } catch (err) {
      sendControllerError(res, err);
    }
  },

  async create(req, res) {
    try {
      const created = await FixedExpenseService.create(req.body);
      res.status(201).json(created);
    } catch (err) {
      sendControllerError(res, err);
    }
  },

  async update(req, res) {
    try {
      const updated = await FixedExpenseService.update(req.params.id, req.body);
      res.json(updated);
    } catch (err) {
      sendControllerError(res, err);
    }
  },

  async remove(req, res) {
    try {
      res.json(await FixedExpenseService.remove(req.params.id));
    } catch (err) {
      sendControllerError(res, err);
    }
  },
};
