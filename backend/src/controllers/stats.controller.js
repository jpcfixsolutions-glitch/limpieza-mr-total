import { StatsService } from "../services/stats.service.js";
import { sendControllerError } from "./controllerError.js";

export const StatsController = {
  async getProfitability(req, res) {
    try {
      res.json(await StatsService.getProfitability(req.query, req.businessUnit));
    } catch (err) {
      sendControllerError(res, err);
    }
  },

  async getRestockCost(req, res) {
    try {
      res.json(await StatsService.getRestockCost(req.query, req.businessUnit));
    } catch (err) {
      sendControllerError(res, err);
    }
  },

  async getTopProducts(req, res) {
    try {
      res.json(await StatsService.getTopProducts(req.query, req.businessUnit));
    } catch (err) {
      sendControllerError(res, err);
    }
  },

  async getActivityLog(req, res) {
    try {
      res.json(await StatsService.getActivityLog(req.businessUnit));
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
      const result = await StatsService.createInternalWithdrawal(req.body, req.businessUnit, req.user.id);
      res.json(result);
    } catch (err) {
      sendControllerError(res, err);
    }
  },
};
