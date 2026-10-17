// Widely used personal-finance rules of thumb, shared by insights, Angel AI and the free calculators.

/** 50/30/20 buckets for the app's expense categories. "Investments" count as savings. */
export const NEEDS = new Set(["Rent", "Utilities", "Groceries", "Health", "Insurance", "EMI / Debt", "Transport", "Fuel", "Education"]);
export const WANTS = new Set(["Food & Dining", "Shopping", "Entertainment", "Travel", "Subscriptions", "Family", "Other"]);
export const SAVINGS_CATS = new Set(["Investments"]);

export function bucketOf(category: string): "needs" | "wants" | "savings" {
  if (NEEDS.has(category)) return "needs";
  if (SAVINGS_CATS.has(category)) return "savings";
  return "wants";
}

/** Sums a category → amount map into needs / wants / invested (same units as the input). */
export function needsWantsOf(cats: Map<string, number> | { category: string; total: number }[]): { needs: number; wants: number; invested: number } {
  const entries: [string, number][] = cats instanceof Map ? [...cats.entries()] : cats.map((c) => [c.category, c.total]);
  let needs = 0;
  let wants = 0;
  let invested = 0;
  for (const [c, v] of entries) {
    const b = bucketOf(c);
    if (b === "needs") needs += v;
    else if (b === "savings") invested += v;
    else wants += v;
  }
  return { needs, wants, invested };
}

/** Standard EMI formula. principal in major units, annual rate in %, months. */
export function emi(principal: number, annualRatePct: number, months: number): number {
  if (months <= 0) return 0;
  const r = annualRatePct / 12 / 100;
  if (r === 0) return principal / months;
  const f = Math.pow(1 + r, months);
  return (principal * r * f) / (f - 1);
}

/** Future value of a monthly SIP (end-of-month contributions). */
export function sipFutureValue(monthly: number, annualRatePct: number, months: number): number {
  const r = annualRatePct / 12 / 100;
  if (r === 0) return monthly * months;
  return monthly * ((Math.pow(1 + r, months) - 1) / r) * (1 + r);
}
