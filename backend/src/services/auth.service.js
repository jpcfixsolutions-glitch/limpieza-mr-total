import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { UserModel } from "../models/user.model.js";

if (!process.env.JWT_SECRET) {
  console.error("❌ La variable de entorno JWT_SECRET no está definida. El servidor no puede iniciarse de forma segura.");
  process.exit(1);
}

const JWT_SECRET = process.env.JWT_SECRET;
const SESSION_DURATION = "1d";

export const AuthService = {
  async login(email, password) {
    if (!email || !password) {
      throw { status: 400, message: "Usuario y contraseña son requeridos." };
    }

    const user = await UserModel.findByLogin(email);
    if (!user) {
      throw { status: 401, message: "Credenciales inválidas." };
    }

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      throw { status: 401, message: "Credenciales inválidas." };
    }

    const payload = { id: user.id, name: user.name, email: user.email, role: user.role };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: SESSION_DURATION });

    return {
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    };
  },

  async register(name, email, password, role = "cajero") {
    if (!name || !email || !password) {
      throw { status: 400, message: "Nombre, email y contraseña son requeridos." };
    }

    const existing = await UserModel.findByEmail(email);
    if (existing) {
      throw { status: 409, message: "Ya existe un usuario con ese email." };
    }

    const validRoles = ["admin", "cajero"];
    if (!validRoles.includes(role)) {
      throw { status: 400, message: "Rol inválido. Debe ser 'admin' o 'cajero'." };
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const [created] = await UserModel.create({ name, email, password: hashedPassword, role });
    return created;
  },

  verifyToken(token) {
    try {
      return jwt.verify(token, JWT_SECRET);
    } catch {
      throw { status: 401, message: "Token inválido o expirado." };
    }
  },
};
