import { FixedExpenseModel } from "../models/fixedExpense.model.js";
import { sql } from 'drizzle-orm';
import { getArgentinaTime } from '../db/timeUtils.js';
import { runWarehouseTransaction as transaction } from './warehouse.service.js';
import { amountValue, materializeLocalFixed, fail } from './localExpensePayments.js';

export const FixedExpenseService = {
  async getAll() {
    return FixedExpenseModel.findAll();
  },

  async create({ name, amount }) {
    if (!name?.trim()) throw { status: 400, message: "El nombre es requerido." };
    if (amount === undefined || Number(amount) < 0) {
      throw { status: 400, message: "El monto debe ser un número positivo." };
    }
    const value=amountValue(amount,true);
    return transaction(async tx=>{
      const [created]=await tx.all(sql`INSERT INTO fixed_expenses(name,amount,start_period) VALUES(${name.trim()},${value},${getArgentinaTime().datetime.slice(0,7)}) RETURNING *`);
      await materializeLocalFixed(tx);
      return created;
    });
  },

  async update(id, { name, amount, expectedVersion }) {
    return transaction(async tx=>{
      const [before]=await tx.all(sql`SELECT * FROM fixed_expenses WHERE id=${Number(id)} AND active=1`);
      if(!before) fail(404,'Gasto fijo no encontrado.');
      if(expectedVersion!==before.version) fail(409,'La configuración cambió. Actualizá antes de reintentar.');
      await materializeLocalFixed(tx);
      const [updated]=await tx.all(sql`UPDATE fixed_expenses SET name=${name?.trim()||before.name},amount=${amount===undefined?before.amount:amountValue(amount,true)},version=version+1 WHERE id=${before.id} AND version=${before.version} RETURNING *`);
      if(!updated) fail(409,'La configuración cambió.');
      return updated;
    });
  },

  async remove(id) {
    return transaction(async tx=>{
      await materializeLocalFixed(tx);
      const [updated]=await tx.all(sql`UPDATE fixed_expenses SET active=0,version=version+1 WHERE id=${Number(id)} AND active=1 RETURNING id`);
      if(!updated) fail(404,'Gasto fijo no encontrado.');
      return {message:'Recurrencia desactivada. Los períodos y pagos anteriores se conservan.'};
    });
  },
};
