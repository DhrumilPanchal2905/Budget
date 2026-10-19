// Indian income tax for individuals — FY 2026-27 (AY 2027-28). Budget 2026 kept the FY 2025-26 slabs unchanged.
// New regime (default): 0–4L nil, 4–8L 5%, 8–12L 10%, 12–16L 15%, 16–20L 20%, 20–24L 25%, >24L 30%;
//   standard deduction ₹75,000 (salaried); 87A rebate up to ₹60,000 → no tax up to ₹12 lakh taxable (with marginal relief).
// Old regime: 0–2.5L nil (3L for 60–80, 5L for 80+), 2.5–5L 5%, 5–10L 20%, >10L 30%; standard deduction ₹50,000;
//   87A rebate up to ₹12,500 → no tax up to ₹5 lakh taxable.
// Surcharge: 10% > ₹50L, 15% > ₹1Cr, 25% > ₹2Cr, 37% > ₹5Cr (old regime only; new regime capped at 25%), with
// marginal relief. Health & education cess 4%. Special-rate incomes (capital gains etc.) are not included.

export type Regime = "new" | "old";
export type AgeGroup = "below60" | "60to80" | "above80";

export interface TaxInput {
  regime: Regime;
  /** gross annual income from salary / pension */
  salary: number;
  /** other income taxed at slab rates (interest, rent after 30%, freelance profit …) */
  other: number;
  /** old regime only: 80C, 80D, HRA, home-loan interest, NPS etc. (already capped by the user) */
  deductions: number;
  age: AgeGroup;
}

export interface TaxResult {
  regime: Regime;
  gross: number;
  standardDeduction: number;
  taxable: number;
  slabTax: number;
  rebate: number;
  surcharge: number;
  cess: number;
  total: number;
  effectiveRate: number;
  monthlyTds: number;
  breakdown: { from: number; to: number | null; rate: number; tax: number }[];
}

const L = 100000;

function slabs(regime: Regime, age: AgeGroup): { upto: number | null; rate: number }[] {
  if (regime === "new")
    return [
      { upto: 4 * L, rate: 0 },
      { upto: 8 * L, rate: 5 },
      { upto: 12 * L, rate: 10 },
      { upto: 16 * L, rate: 15 },
      { upto: 20 * L, rate: 20 },
      { upto: 24 * L, rate: 25 },
      { upto: null, rate: 30 },
    ];
  const basic = age === "above80" ? 5 * L : age === "60to80" ? 3 * L : 2.5 * L;
  const out: { upto: number | null; rate: number }[] = [{ upto: basic, rate: 0 }];
  if (basic < 5 * L) out.push({ upto: 5 * L, rate: 5 });
  out.push({ upto: 10 * L, rate: 20 }, { upto: null, rate: 30 });
  return out;
}

function slabTaxOf(income: number, regime: Regime, age: AgeGroup) {
  let prev = 0;
  let tax = 0;
  const breakdown: TaxResult["breakdown"] = [];
  for (const s of slabs(regime, age)) {
    const top = s.upto ?? Infinity;
    if (income > prev) {
      const part = Math.min(income, top) - prev;
      const t = (part * s.rate) / 100;
      tax += t;
      breakdown.push({ from: prev, to: s.upto, rate: s.rate, tax: t });
    }
    prev = top;
    if (income <= top) break;
  }
  return { tax, breakdown };
}

function surchargeRate(income: number, regime: Regime): number {
  if (income > 5 * 100 * L) return regime === "new" ? 25 : 37;
  if (income > 2 * 100 * L) return 25;
  if (income > 100 * L) return 15;
  if (income > 50 * L) return 10;
  return 0;
}

/** Tax + surcharge with marginal relief (the extra tax above a threshold can't exceed the extra income). */
function withSurcharge(income: number, regime: Regime, age: AgeGroup, taxAfterRebate: number): number {
  const rate = surchargeRate(income, regime);
  if (!rate) return 0;
  const sur = (taxAfterRebate * rate) / 100;
  const thresholds = [50 * L, 100 * L, 200 * L, 500 * L];
  const threshold = [...thresholds].reverse().find((t) => income > t)!;
  const taxAt = slabTaxOf(threshold, regime, age).tax;
  const surAt = (taxAt * surchargeRate(threshold, regime)) / 100;
  const maxTotal = taxAt + surAt + (income - threshold);
  return Math.max(0, Math.min(sur, maxTotal - taxAfterRebate));
}

export function incomeTax(i: TaxInput): TaxResult {
  const gross = Math.max(0, i.salary) + Math.max(0, i.other);
  const sd = i.salary > 0 ? Math.min(i.salary, i.regime === "new" ? 75000 : 50000) : 0;
  const ded = i.regime === "old" ? Math.max(0, i.deductions) : 0;
  const taxable = Math.max(0, Math.round(gross - sd - ded));
  const { tax: slabTax, breakdown } = slabTaxOf(taxable, i.regime, i.age);
  let rebate = 0;
  if (i.regime === "new") {
    if (taxable <= 12 * L) rebate = Math.min(slabTax, 60000);
    else if (slabTax > taxable - 12 * L) rebate = slabTax - (taxable - 12 * L); // marginal relief just above ₹12 lakh
  } else if (taxable <= 5 * L) rebate = Math.min(slabTax, 12500);
  const afterRebate = Math.max(0, slabTax - rebate);
  const surcharge = withSurcharge(taxable, i.regime, i.age, afterRebate);
  const cess = ((afterRebate + surcharge) * 4) / 100;
  const total = Math.round(afterRebate + surcharge + cess);
  return {
    regime: i.regime,
    gross,
    standardDeduction: sd,
    taxable,
    slabTax: Math.round(slabTax),
    rebate: Math.round(rebate),
    surcharge: Math.round(surcharge),
    cess: Math.round(cess),
    total,
    effectiveRate: gross ? (total / gross) * 100 : 0,
    monthlyTds: Math.round(total / 12),
    breakdown,
  };
}
