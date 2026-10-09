import { PaymentMethodService } from "../services/paymentMethod.service.js";
import { sendControllerError } from "./controllerError.js";

export const PaymentMethodController = {
  async getAll(req, res) {
    try {
      res.json(await PaymentMethodService.getAll());
    } catch (err) {
      sendControllerError(res, err);
    }
  },

  async create(req, res) {
    try {
      const created = await PaymentMethodService.create(req.body);
      res.status(201).json(created);
    } catch (err) {
      sendControllerError(res, err);
    }
  },

  async update(req, res) {
    try {
      const updated = await PaymentMethodService.update(req.params.id, req.body);
      res.json(updated);
    } catch (err) {
      sendControllerError(res, err);
    }
  },

  async remove(req, res) {
    try {
      res.json(await PaymentMethodService.remove(req.params.id));
    } catch (err) {
      sendControllerError(res, err);
    }
  },
};
