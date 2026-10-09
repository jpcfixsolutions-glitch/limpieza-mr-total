import { ProductService } from "../services/product.service.js";
import { sendControllerError } from "./controllerError.js";

export const ProductController = {
  async getAll(req, res) {
    try {
      const products = await ProductService.getAll();
      res.json(products);
    } catch (err) {
      sendControllerError(res, err);
    }
  },

  async getByCodbarra(req, res) {
    try {
      const product = await ProductService.getByCodbarra(req.params.codbarra);
      res.json(product);
    } catch (err) {
      sendControllerError(res, err);
    }
  },

  async create(req, res) {
    try {
      const product = await ProductService.create(req.body);
      res.status(201).json(product);
    } catch (err) {
      sendControllerError(res, err);
    }
  },

  async update(req, res) {
    try {
      const product = await ProductService.update(req.params.id, req.body);
      res.json(product);
    } catch (err) {
      sendControllerError(res, err);
    }
  },

  async remove(req, res) {
    try {
      const result = await ProductService.remove(req.params.id);
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
