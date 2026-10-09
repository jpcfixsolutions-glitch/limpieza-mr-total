import { PackTypeModel } from "../models/packType.model.js";

export const PackTypeService = {
  async getAll() {
    const list = await PackTypeModel.findAll();
    return list.sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }));
  },

  async create({ name }) {
    if (!name?.trim()) throw { status: 400, message: "El nombre del bulto es requerido." };
    try {
      const [created] = await PackTypeModel.create({ name: name.trim() });
      return created;
    } catch (err) {
      if (String(err?.message || "").toLowerCase().includes("unique")) {
        throw { status: 409, message: "Ya existe un tipo de bulto con ese nombre." };
      }
      throw err;
    }
  },

  async update(id, { name }) {
    if (!name?.trim()) throw { status: 400, message: "El nombre es requerido." };
    const existing = await PackTypeModel.findById(id);
    if (!existing) throw { status: 404, message: "Tipo de bulto no encontrado." };
    const [updated] = await PackTypeModel.update(id, { name: name.trim() });
    return updated;
  },

  async remove(id) {
    const existing = await PackTypeModel.findById(id);
    if (!existing) throw { status: 404, message: "Tipo de bulto no encontrado." };
    await PackTypeModel.remove(id);
    return { message: "Tipo de bulto eliminado." };
  },
};
