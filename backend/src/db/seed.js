import "dotenv/config";
import bcrypt from "bcryptjs";
import { db } from "./client.js";
import {
  users,
  categories,
  paymentMethods,
  subscriptionConfig,
  appSettings,
} from "./schema.js";

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`❌ Variable de entorno requerida no definida: ${name}`);
    process.exit(1);
  }
  return value;
}

async function seed() {
  console.log("🌱 Iniciando seed...");

  const adminName     = requireEnv("SEED_ADMIN_NAME");
  const adminEmail    = requireEnv("SEED_ADMIN_EMAIL");
  const adminPassword = await bcrypt.hash(requireEnv("SEED_ADMIN_PASSWORD"), 10);

  const cajeroName     = requireEnv("SEED_CAJERO_NAME");
  const cajeroEmail    = requireEnv("SEED_CAJERO_EMAIL");
  const cajeroPassword = await bcrypt.hash(requireEnv("SEED_CAJERO_PASSWORD"), 10);

  const creadorPassword = await bcrypt.hash(requireEnv("SEED_CREADOR_PASSWORD"), 10);

  await db.insert(users).values([
    { name: adminName,  email: adminEmail,  password: adminPassword,  role: "admin" },
    { name: cajeroName, email: cajeroEmail, password: cajeroPassword, role: "cajero" },
    { name: "Creador", email: requireEnv("SEED_CREADOR_EMAIL"), password: creadorPassword, role: "creador" },
  ]).onConflictDoNothing();

  // Configuración inicial de suscripción (sin corte activo)
  const existingConfig = await db.select().from(subscriptionConfig).limit(1);
  if (existingConfig.length === 0) {
    await db.insert(subscriptionConfig).values({ cutoffDay: null });
    console.log("✅ Configuración de suscripción inicializada");
  }

  console.log("✅ Usuarios creados");

  // Categorías
  await db.insert(categories).values([
    { name: "Vasos" },
    { name: "Platos" },
    { name: "Cubiertos" },
    { name: "Envases" },
    { name: "Bolsas" },
    { name: "Limpieza" },
    { name: "Varios" },
  ]).onConflictDoNothing();

  console.log("✅ Categorías creadas");

  // Métodos de pago
  await db.insert(paymentMethods).values([
    { name: "Efectivo", surcharge: 0 },
    { name: "Transferencia", surcharge: 0 },
    { name: "Débito", surcharge: 0 },
    { name: "Crédito", surcharge: 10 },
    { name: "Mercado Pago", surcharge: 5 },
  ]).onConflictDoNothing();

  console.log("✅ Métodos de pago creados");

  await db.insert(appSettings).values({
    key: "suggested_price_percents",
    value: JSON.stringify([80]),
  }).onConflictDoNothing();
  console.log("✅ Porcentaje de precio sugerido inicializado");

  console.log("✅ Sin productos ni gastos fijos de ejemplo — la app arranca limpia");

  console.log("🎉 Seed completado exitosamente.");
  process.exit(0);
}

seed().catch((e) => {
  console.error("❌ Error en seed:", e);
  process.exit(1);
});
