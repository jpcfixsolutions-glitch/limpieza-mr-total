import bcrypt from "bcryptjs";
import { UserModel } from "../models/user.model.js";

export const UserService = {
  async getAll() {
    return UserModel.findAll();
  },

  async update(id, { name, role, password }) {
    const user = await UserModel.findById(id);
    if (!user) throw { status: 404, message: "Usuario no encontrado." };
    if (user.role === "creador") {
      throw { status: 403, message: "No puedes modificar este usuario." };
    }

    const validRoles = ["admin", "cajero"];
    if (role && !validRoles.includes(role)) {
      throw { status: 400, message: "Rol inválido." };
    }

    const updateData = {};
    if (name) updateData.name = name;
    if (role) updateData.role = role;
    if (password) updateData.password = await bcrypt.hash(password, 10);

    await UserModel.update(id, updateData);
    return { message: "Usuario actualizado." };
  },

  async remove(id, requestingUserId) {
    if (Number(id) === Number(requestingUserId)) {
      throw { status: 400, message: "No puedes eliminar tu propio usuario." };
    }
    const user = await UserModel.findById(id);
    if (!user) throw { status: 404, message: "Usuario no encontrado." };
    if (user.role === "creador") {
      throw { status: 403, message: "No puedes eliminar este usuario." };
    }
    await UserModel.remove(id);
    return { message: "Usuario eliminado." };
  },
};
