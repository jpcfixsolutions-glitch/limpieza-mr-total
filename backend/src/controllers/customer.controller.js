import { CustomerService } from "../services/customer.service.js";
import { sendControllerError } from "./controllerError.js";

export const CustomerController = {
  async list(req, res) {
    try {
      res.json(await CustomerService.list({ search: req.query.search }));
    } catch (err) {
      sendControllerError(res, err);
    }
  },

  async getByDocument(req, res) {
    try {
      res.json(await CustomerService.getByDocument(req.params.document));
    } catch (err) {
      sendControllerError(res, err);
    }
  },

  async create(req, res) {
    try {
      res.status(201).json(await CustomerService.create(req.body));
    } catch (err) {
      sendControllerError(res, err);
    }
  },

  async getDetail(req, res) {
    try {
      res.json(await CustomerService.getDetail(req.params.id));
    } catch (err) {
      sendControllerError(res, err);
    }
  },

  async registerPayment(req, res) {
    try {
      const result = await CustomerService.registerPayment(
        req.params.id,
        req.body,
        req.user.id
      );
      res.status(201).json(result);
    } catch (err) {
      sendControllerError(res, err);
    }
  },

  async getPaymentsByRegister(req, res) {
    try {
      res.json(await CustomerService.getPaymentsByRegister(req.params.registerId));
    } catch (err) {
      sendControllerError(res, err);
    }
  },
  async listMovements(req, res) {
    try { res.json(await CustomerService.listMovements()); } catch (err) { sendControllerError(res, err); }
  },
};
