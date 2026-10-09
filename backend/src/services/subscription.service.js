import { SubscriptionModel } from "../models/subscription.model.js";

function computeStatus(cutoffDay, lastPaidAt) {
  if (cutoffDay === null || cutoffDay === undefined) {
    return { cutoffDay: null, isExpired: false, isWarningPhase: false, daysRemaining: null, lastPaidAt: lastPaidAt || null };
  }

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0-based
  const currentDay = now.getDate();
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const actualCutoff = Math.min(cutoffDay, daysInMonth);

  const paidThisMonth = lastPaidAt
    ? (() => {
        const [py, pm] = lastPaidAt.split("-").map(Number);
        return py === currentYear && pm - 1 === currentMonth;
      })()
    : false;

  let isExpired = false;
  let isWarningPhase = false;

  if (currentDay > actualCutoff) {
    isExpired = !paidThisMonth;
  } else if (actualCutoff - currentDay <= 5) {
    isWarningPhase = !paidThisMonth;
  }

  return {
    cutoffDay,
    isExpired,
    isWarningPhase,
    daysRemaining: Math.max(0, actualCutoff - currentDay),
    lastPaidAt: lastPaidAt || null,
  };
}

export const SubscriptionService = {
  async getStatus() {
    const config = await SubscriptionModel.getConfig();
    return computeStatus(config?.cutoffDay ?? null, config?.lastPaidAt ?? null);
  },

  async setCutoffDay(day) {
    const dayNum = parseInt(day, 10);
    if (isNaN(dayNum) || dayNum < 1 || dayNum > 31) {
      throw { status: 400, message: "El día de corte debe ser un número entre 1 y 31." };
    }
    const config = await SubscriptionModel.setCutoffDay(dayNum);
    return computeStatus(dayNum, config?.lastPaidAt ?? null);
  },

  async reactivate() {
    const config = await SubscriptionModel.markPaid();
    return computeStatus(config?.cutoffDay ?? null, config?.lastPaidAt ?? null);
  },
};
