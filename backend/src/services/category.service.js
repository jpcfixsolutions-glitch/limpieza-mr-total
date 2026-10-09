import { CategoryModel } from "../models/category.model.js";

export const CategoryService = {
  async getAll() {
    return CategoryModel.findAll();
  },

  async create({ name }) {
    if (!name?.trim()) throw { status: 400, message: "El nombre es requerido." };
    const [created] = await CategoryModel.create({ name: name.trim() });
    return created;
  },

  async update(id, { name }) {
    if (!name?.trim()) throw { status: 400, message: "El nombre es requerido." };
    const existing = await CategoryModel.findById(id);
    if (!existing) throw { status: 404, message: "Categoría no encontrada." };
    const [updated] = await CategoryModel.update(id, { name: name.trim() });
    return updated;
  },

  async remove(id) {
    const existing = await CategoryModel.findById(id);
    if (!existing) throw { status: 404, message: "Categoría no encontrada." };
    await CategoryModel.remove(id);
    return { message: "Categoría eliminada." };
  },
};
