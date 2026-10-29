import { useEffect, useState } from "react";
import { toast } from "sonner";
import api from "../../services/api.js";

function normalizePrintableTransaction(transaction) {
  return {
    ...transaction,
    id: String(transaction.id),
    total: Number(transaction.total || 0),
    discountPercent: Number(transaction.discountPercent || 0),
    discountAmount: Number(transaction.discountAmount || 0),
    payments: (transaction.payments || []).map((payment) => ({
      type: payment.type || payment.methodName,
      amount: Number(payment.amount || 0),
      baseAmount: Number(payment.baseAmount ?? payment.amount ?? 0),
      surchargePercent: Number(payment.surchargePercent || 0),
    })),
    items: (transaction.items || []).map((item) => ({
      ...item,
      name: item.name || item.productName,
      price: Number(item.price || 0),
      quantity: Number(item.quantity || 0),
      total: Number(item.total || 0),
      unitsPerPack: Number(item.unitsPerPack || item.packSize || 1),
    })),
  };
}

export function useSalePrinting() {
  const [printTransaction, setPrintTransaction] = useState(null);
  const [printJob, setPrintJob] = useState(null);
  const [loadingPrintId, setLoadingPrintId] = useState(null);

  useEffect(() => {
    if (!printJob) return undefined;
    const clearPrintJob = () => setPrintJob(null);
    const timer = window.setTimeout(() => window.print(), 150);
    window.addEventListener("afterprint", clearPrintJob, { once: true });
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("afterprint", clearPrintJob);
    };
  }, [printJob]);

  const openSalePrintOptions = async (transactionId) => {
    if (loadingPrintId) return;
    setLoadingPrintId(String(transactionId));
    try {
      const { data } = await api.get(`/transactions/${transactionId}`);
      setPrintTransaction(normalizePrintableTransaction(data));
    } catch (err) {
      toast.error(err.response?.data?.message || "No se pudo recuperar la venta para imprimir");
    } finally {
      setLoadingPrintId(null);
    }
  };

  const startThermalPrint = () => {
    if (!printTransaction) return;
    setPrintJob({ format: "thermal", transaction: printTransaction });
    setPrintTransaction(null);
  };

  const startA4Print = (details) => {
    if (!printTransaction) return;
    setPrintJob({ format: "a4", transaction: { ...printTransaction, ...details } });
    setPrintTransaction(null);
  };

  return {
    printTransaction,
    printJob,
    loadingPrintId,
    openSalePrintOptions,
    closePrintOptions: () => setPrintTransaction(null),
    startThermalPrint,
    startA4Print,
  };
}
