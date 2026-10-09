import "dotenv/config";
import express from "express";
import cors from "cors";
import { initializeDatabase } from "./db/databaseLifecycle.js";

import authRoutes from "./routes/auth.routes.js";
import userRoutes from "./routes/user.routes.js";
import productRoutes from "./routes/product.routes.js";
import categoryRoutes from "./routes/category.routes.js";
import paymentMethodRoutes from "./routes/paymentMethod.routes.js";
import cashRegisterRoutes from "./routes/cashRegister.routes.js";
import transactionRoutes from "./routes/transaction.routes.js";
import fixedExpenseRoutes from "./routes/fixedExpense.routes.js";
import dailyExpenseRoutes from "./routes/dailyExpense.routes.js";
import statsRoutes from "./routes/stats.routes.js";
import internalWithdrawalRoutes from "./routes/internalWithdrawal.routes.js";
import subscriptionRoutes from "./routes/subscription.routes.js";
import priceGroupRoutes from "./routes/priceGroup.routes.js";
import packTypeRoutes from "./routes/packType.routes.js";
import customerRoutes from "./routes/customer.routes.js";
import promotionRoutes from "./routes/promotion.routes.js";

await initializeDatabase();

const app = express();
const PORT = process.env.PORT || 3001;

// ─── Middlewares globales ─────────────────────────────────────────────────────

const allowedOrigins = [
  "http://localhost:5173",
  ...(process.env.FRONTEND_URL || "")
    .split(",")
    .map((url) => url.trim().replace(/\/$/, ""))
    .filter(Boolean),
];

function isLocalDevOrigin(origin) {
  try {
    const { hostname } = new URL(origin);
    return hostname === "localhost" || hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

const corsOptions = {
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    const normalized = origin.replace(/\/$/, "");
    if (allowedOrigins.includes(normalized) || isLocalDevOrigin(normalized)) {
      callback(null, true);
    } else {
      console.warn(`CORS bloqueado: ${origin}. Permitidos: ${allowedOrigins.join(", ")}`);
      callback(null, false);
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));
app.use(express.json());

// ─── Rutas ────────────────────────────────────────────────────────────────────

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/products", productRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/payment-methods", paymentMethodRoutes);
app.use("/api/cash-register", cashRegisterRoutes);
app.use("/api/transactions", transactionRoutes);
app.use("/api/fixed-expenses", fixedExpenseRoutes);
app.use("/api/daily-expenses", dailyExpenseRoutes);
app.use("/api/stats", statsRoutes);
app.use("/api/internal-withdrawals", internalWithdrawalRoutes);
app.use("/api/subscription", subscriptionRoutes);
app.use("/api/price-groups", priceGroupRoutes);
app.use("/api/pack-types", packTypeRoutes);
app.use("/api/customers", customerRoutes);
app.use("/api/promotions", promotionRoutes);

// ─── Health check ─────────────────────────────────────────────────────────────

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ─── Error handler global ─────────────────────────────────────────────────────

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ message: "Error interno del servidor." });
});

if (process.env.VERCEL !== "1") {
  app.listen(PORT, () => {
    console.log(`🚀 Servidor Descartables Yofre corriendo en http://localhost:${PORT}`);
    console.log(`📦 Base de datos: ${process.env.TURSO_DATABASE_URL}`);
  });
}

export default app;
