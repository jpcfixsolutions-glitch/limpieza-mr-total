import { CustomerService } from "../services/customer.service.js";
import { sendControllerError } from "./controllerError.js";

export const CustomerController = {
  async list(req, res) {
    try {
      res.json(await CustomerService.list({ search: req.query.search }, req.businessUnit));
    } catch (err) {
      sendControllerError(res, err);
    }
  },

  async getByDocument(req, res) {
    try {
      res.json(await CustomerService.getByDocument(req.params.document, req.businessUnit));
    } catch (err) {
      sendControllerError(res, err);
    }
  },

  async create(req, res) {
    try {
      res.status(201).json(await CustomerService.create(req.body, req.businessUnit));
    } catch (err) {
      sendControllerError(res, err);
    }
  },

  async getDetail(req, res) {
    try {
      res.json(await CustomerService.getDetail(req.params.id, req.businessUnit));
    } catch (err) {
      sendControllerError(res, err);
    }
  },

  async registerPayment(req, res) {
    try {
      if (req.businessUnit?.code === 'WAREHOUSE' && req.user.role !== 'admin') return res.status(403).json({message:'Operación exclusiva de administradores.'});
      const result = await CustomerService.registerPayment(
        req.params.id,
        req.body,
        req.user.id,
        req.businessUnit
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
    try { res.json(await CustomerService.listMovements(req.businessUnit)); } catch (err) { sendControllerError(res, err); }
  },
};
