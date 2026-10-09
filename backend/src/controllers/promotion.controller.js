import { PromotionService } from "../services/promotion.service.js";
import { sendControllerError } from "./controllerError.js";

export const PromotionController = {
  async getAll(req, res) {
    try { res.json(await PromotionService.getAll()); } catch (error) { sendControllerError(res, error); }
  },
  async create(req, res) {
    try { res.status(201).json(await PromotionService.create(req.body)); } catch (error) { sendControllerError(res, error); }
  },
  async remove(req, res) {
    try { res.json(await PromotionService.remove(req.params.id)); } catch (error) { sendControllerError(res, error); }
  },
  async update(req, res) {
    try { res.json(await PromotionService.update(req.params.id, req.body)); } catch (error) { sendControllerError(res, error); }
  },
};
