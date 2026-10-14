// Shared description of finance resources — drives forms/tables on the client and
// validation/permission mapping on the server.

export type ResourceKey = "income" | "expense" | "debt" | "goal";
export const RESOURCE_KEYS: ResourceKey[] = ["income", "expense", "debt", "goal"];

export function isResourceKey(v: string): v is ResourceKey {
  return (RESOURCE_KEYS as string[]).includes(v);
}

export const INCOME_CATEGORIES = [
  "Salary",
  "Freelance",
  "Business",
  "Investment",
  "Rental",
  "Bonus",
  "Gift",
  "Refund",
  "Other",
] as const;

export const EXPENSE_CATEGORIES = [
  "Food & Dining",
  "Groceries",
  "Rent",
  "Utilities",
  "Transport",
  "Fuel",
  "Shopping",
  "Health",
  "Education",
  "Entertainment",
  "Travel",
  "Insurance",
  "Subscriptions",
  "EMI / Debt",
  "Investments",
  "Family",
  "Other",
] as const;

export const RECURRING = ["none", "weekly", "monthly", "yearly"] as const;
export const INCOME_TYPES = ["salary", "extra"] as const;
export const DEBT_STATUS = ["active", "paused", "closed"] as const;
export const GOAL_STATUS = ["active", "paused", "achieved", "cancelled"] as const;

export type FieldType = "text" | "money" | "date" | "select" | "textarea" | "percent";

export interface FieldDef {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: readonly string[];
  optionLabels?: Record<string, string>;
  placeholder?: string;
  half?: boolean;
}

export interface ResourceDef {
  key: ResourceKey;
  label: string;
  plural: string;
  path: string;
  titleField: string;
  dateField: string;
  fields: FieldDef[];
}

const recurringLabels = { none: "One-time", weekly: "Weekly", monthly: "Monthly", yearly: "Yearly" };

export const RESOURCES: Record<ResourceKey, ResourceDef> = {
  income: {
    key: "income",
    label: "Income",
    plural: "Income",
    path: "/income",
    titleField: "title",
    dateField: "date",
    fields: [
      { name: "title", label: "Source / title", type: "text", required: true, placeholder: "e.g. October salary" },
      { name: "type", label: "Type", type: "select", options: INCOME_TYPES, optionLabels: { salary: "Salary", extra: "Extra income" }, required: true, half: true },
      { name: "category", label: "Category", type: "select", options: INCOME_CATEGORIES, required: true, half: true },
      { name: "amount", label: "Amount", type: "money", required: true, half: true },
      { name: "date", label: "Date", type: "date", required: true, half: true },
      { name: "recurring", label: "Recurring", type: "select", options: RECURRING, optionLabels: recurringLabels, half: true },
      { name: "notes", label: "Notes", type: "textarea" },
    ],
  },
  expense: {
    key: "expense",
    label: "Expense",
    plural: "Expenses",
    path: "/expenses",
    titleField: "title",
    dateField: "date",
    fields: [
      { name: "title", label: "Title", type: "text", required: true, placeholder: "e.g. Groceries at DMart" },
      { name: "category", label: "Category", type: "select", options: EXPENSE_CATEGORIES, required: true, half: true },
      { name: "amount", label: "Amount", type: "money", required: true, half: true },
      { name: "date", label: "Date", type: "date", required: true, half: true },
      { name: "recurring", label: "Recurring", type: "select", options: RECURRING, optionLabels: recurringLabels, half: true },
      { name: "notes", label: "Notes", type: "textarea" },
    ],
  },
  debt: {
    key: "debt",
    label: "Debt / EMI",
    plural: "Debts & EMIs",
    path: "/debts",
    titleField: "title",
    dateField: "dueDate",
    fields: [
      { name: "title", label: "Title", type: "text", required: true, placeholder: "e.g. Home loan — SBI" },
      { name: "totalAmount", label: "Total amount", type: "money", required: true, half: true },
      { name: "remainingAmount", label: "Remaining amount", type: "money", required: true, half: true },
      { name: "emiAmount", label: "Monthly EMI", type: "money", required: true, half: true },
      { name: "interestRate", label: "Interest rate (% p.a.)", type: "percent", half: true },
      { name: "dueDate", label: "Next due date", type: "date", required: true, half: true },
      { name: "status", label: "Status", type: "select", options: DEBT_STATUS, optionLabels: { active: "Active", paused: "Paused", closed: "Closed" }, half: true },
      { name: "notes", label: "Notes", type: "textarea" },
    ],
  },
  goal: {
    key: "goal",
    label: "Savings goal",
    plural: "Savings goals",
    path: "/goals",
    titleField: "name",
    dateField: "targetDate",
    fields: [
      { name: "name", label: "Goal name", type: "text", required: true, placeholder: "e.g. Emergency fund" },
      { name: "targetAmount", label: "Target amount", type: "money", required: true, half: true },
      { name: "currentAmount", label: "Saved so far", type: "money", half: true },
      { name: "targetDate", label: "Target date", type: "date", required: true, half: true },
      { name: "status", label: "Status", type: "select", options: GOAL_STATUS, optionLabels: { active: "Active", paused: "Paused", achieved: "Achieved", cancelled: "Cancelled" }, half: true },
      { name: "notes", label: "Notes", type: "textarea" },
    ],
  },
};

export const MONEY_FIELDS: Record<ResourceKey, string[]> = {
  income: ["amount"],
  expense: ["amount"],
  debt: ["totalAmount", "remainingAmount", "emiAmount"],
  goal: ["targetAmount", "currentAmount"],
};

export const DATE_FIELDS: Record<ResourceKey, string[]> = {
  income: ["date"],
  expense: ["date"],
  debt: ["dueDate"],
  goal: ["targetDate"],
};
