import { DailyExpenseService } from "../services/dailyExpense.service.js";
import { sendControllerError } from "./controllerError.js";

export const DailyExpenseController = {
  async changeStatus(req,res) {
    try { res.json(await DailyExpenseService.changeStatus(req.params.id,req.body,req.user.id)); }
    catch(err) { sendControllerError(res,err); }
  },
  async getAll(req, res) {
    try {
      res.json(await DailyExpenseService.getAll());
    } catch (err) {
      sendControllerError(res, err);
    }
  },

  async create(req, res) {
    try {
      const created = await DailyExpenseService.create(req.body,req.user.id);
      res.status(201).json(created);
    } catch (err) {
      sendControllerError(res, err);
    }
  },
};
