import { SubscriptionService } from "../services/subscription.service.js";
import { sendControllerError } from "./controllerError.js";

export const SubscriptionController = {
  async getStatus(req, res) {
    try {
      const status = await SubscriptionService.getStatus();
      res.json(status);
    } catch (err) {
      sendControllerError(res, err);
    }
  },

  async setCutoffDay(req, res) {
    try {
      const { cutoffDay } = req.body;
      const result = await SubscriptionService.setCutoffDay(cutoffDay);
      res.json(result);
    } catch (err) {
      sendControllerError(res, err);
    }
  },

  async reactivate(req, res) {
    try {
      const result = await SubscriptionService.reactivate();
      res.json(result);
    } catch (err) {
      sendControllerError(res, err);
    }
  },
};
