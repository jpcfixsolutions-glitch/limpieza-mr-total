import { PackTypeService } from "../services/packType.service.js";
import { sendControllerError } from "./controllerError.js";

export const PackTypeController = {
  async getAll(req, res) {
    try {
      res.json(await PackTypeService.getAll());
    } catch (err) {
      sendControllerError(res, err);
    }
  },

  async create(req, res) {
    try {
      const created = await PackTypeService.create(req.body);
      res.status(201).json(created);
    } catch (err) {
      sendControllerError(res, err);
    }
  },

  async update(req, res) {
    try {
      res.json(await PackTypeService.update(req.params.id, req.body));
    } catch (err) {
      sendControllerError(res, err);
    }
  },

  async remove(req, res) {
    try {
      res.json(await PackTypeService.remove(req.params.id));
    } catch (err) {
      sendControllerError(res, err);
    }
  },
};
