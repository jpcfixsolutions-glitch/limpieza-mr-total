import { CategoryService } from "../services/category.service.js";
import { sendControllerError } from "./controllerError.js";

export const CategoryController = {
  async getAll(req, res) {
    try {
      res.json(await CategoryService.getAll());
    } catch (err) {
      sendControllerError(res, err);
    }
  },

  async create(req, res) {
    try {
      const created = await CategoryService.create(req.body);
      res.status(201).json(created);
    } catch (err) {
      sendControllerError(res, err);
    }
  },

  async update(req, res) {
    try {
      const updated = await CategoryService.update(req.params.id, req.body);
      res.json(updated);
    } catch (err) {
      sendControllerError(res, err);
    }
  },

  async remove(req, res) {
    try {
      res.json(await CategoryService.remove(req.params.id));
    } catch (err) {
      sendControllerError(res, err);
    }
  },
};
