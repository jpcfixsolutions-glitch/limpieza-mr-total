import { PriceGroupService } from "../services/priceGroup.service.js";
import { sendControllerError } from "./controllerError.js";

export const PriceGroupController = {
  async getAll(req, res) {
    try {
      res.json(await PriceGroupService.getAll(req.query.type));
    } catch (err) {
      sendControllerError(res, err);
    }
  },

  async create(req, res) {
    try {
      const created = await PriceGroupService.create(req.body);
      res.status(201).json(created);
    } catch (err) {
      sendControllerError(res, err);
    }
  },

  async update(req, res) {
    try {
      res.json(await PriceGroupService.update(req.params.id, req.body));
    } catch (err) {
      sendControllerError(res, err);
    }
  },

  async remove(req, res) {
    try {
      res.json(await PriceGroupService.remove(req.params.id));
    } catch (err) {
      sendControllerError(res, err);
    }
  },

  async applyIncrease(req, res) {
    try {
      res.json(await PriceGroupService.applyIncrease(req.params.id, req.body));
    } catch (err) {
      sendControllerError(res, err);
    }
  },
};
