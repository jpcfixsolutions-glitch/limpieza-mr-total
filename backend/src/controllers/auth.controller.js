import { AuthService } from "../services/auth.service.js";
import { sendControllerError } from "./controllerError.js";

export const AuthController = {
  async login(req, res) {
    try {
      const { email, password } = req.body;
      const result = await AuthService.login(email, password);
      res.json(result);
    } catch (err) {
      sendControllerError(res, err);
    }
  },

  async register(req, res) {
    try {
      const { name, email, password, role } = req.body;
      const user = await AuthService.register(name, email, password, role);
      res.status(201).json(user);
    } catch (err) {
      sendControllerError(res, err);
    }
  },
};
