import { ProductExtractionService } from "../services/productExtraction.service.js";
import { sendControllerError } from "./controllerError.js";

export const ProductExtractionController = {
  async create(req, res) { try { res.status(201).json(await ProductExtractionService.create(req.body, req.user, req.businessUnit)); } catch (err) { sendControllerError(res, err); } },
  async list(req, res) { try { res.json(await ProductExtractionService.getByPeriod(req.query)); } catch (err) { sendControllerError(res, err); } },
  async summary(req, res) { try { res.json(await ProductExtractionService.getSummary(req.query)); } catch (err) { sendControllerError(res, err); } },
};
