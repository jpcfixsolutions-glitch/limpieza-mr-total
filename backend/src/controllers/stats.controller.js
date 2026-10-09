import { StatsService } from "../services/stats.service.js";
import { sendControllerError } from "./controllerError.js";

export const StatsController = {
  async getRestockCost(req, res) {
    try {
      res.json(await StatsService.getRestockCost());
    } catch (err) {
      sendControllerError(res, err);
    }
  },

  async getActivityLog(req, res) {
    try {
      res.json(await StatsService.getActivityLog());
    } catch (err) {
      sendControllerError(res, err);
    }
  },

  async createStockModification(req, res) {
    try {
      const result = await StatsService.createStockModification(req.body);
      res.status(201).json(result);
    } catch (err) {
      sendControllerError(res, err);
    }
  },

  async createInternalWithdrawal(req, res) {
    try {
      const result = await StatsService.createInternalWithdrawal(req.body);
      res.json(result);
    } catch (err) {
      sendControllerError(res, err);
    }
  },
};
