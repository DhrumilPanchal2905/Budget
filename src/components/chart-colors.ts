// Categorical palette (validated, theme-aware via CSS variables). Assigned in fixed order.
// Kept separate from charts.tsx so pages can use the colours without loading the chart library.
export const SERIES = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)", "var(--series-5)", "var(--series-6)", "var(--series-7)", "var(--series-8)"];
export const INCOME_COLOR = SERIES[0];
export const EXPENSE_COLOR = SERIES[1];
export const SAVINGS_COLOR = SERIES[2];
