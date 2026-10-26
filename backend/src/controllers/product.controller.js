import { ProductService } from "../services/product.service.js";
import { sendControllerError } from "./controllerError.js";

export const ProductController = {
  async getAll(req, res) {
    try {
      const products = await ProductService.getAll(req.businessUnit);
      res.json(products);
    } catch (err) {
      sendControllerError(res, err);
    }
  },

  async getByCodbarra(req, res) {
    try {
      const includeInactive = req.query.includeInactive === "true" && req.user?.role === "admin";
      const product = await ProductService.getByCodbarra(req.params.codbarra, req.businessUnit, includeInactive);
      res.json(product);
    } catch (err) {
      sendControllerError(res, err);
    }
  },

  async create(req, res) {
    try {
      const product = await ProductService.create(req.body, req.businessUnit);
      res.status(201).json(product);
    } catch (err) {
      sendControllerError(res, err);
    }
  },

  async update(req, res) {
    try {
      const product = await ProductService.update(req.params.id, req.body, req.businessUnit, req.user.id);
      res.json(product);
    } catch (err) {
      sendControllerError(res, err);
    }
  },

  async remove(req, res) {
    try {
      const result = await ProductService.remove(req.params.id, req.businessUnit);
      res.json(result);
    } catch (err) {
      sendControllerError(res, err);
    }
  },

  async bulkAssign(req, res) {
    try {
      res.json(await ProductService.bulkAssign(req.body));
    } catch (err) {
      sendControllerError(res, err);
    }
  },
};
