import { z } from "zod";
import { toMinor } from "./money";
import {
  DEBT_STATUS,
  EXPENSE_CATEGORIES,
  GOAL_STATUS,
  INCOME_CATEGORIES,
  INCOME_TYPES,
  RECURRING,
  type ResourceKey,
} from "./finance-config";
import { ALL_PERMISSIONS } from "./permissions";
import { PLAN_IDS } from "./plans";

// zod schemas only accept primitive types → objects like {"$gt": ""} are rejected (NoSQL injection safe).

export const emailSchema = z
  .string({ required_error: "Email is required." })
  .trim()
  .toLowerCase()
  .max(254)
  .email("Enter a valid email address.");

export const passwordSchema = z
  .string({ required_error: "Password is required." })
  .min(8, "Password must be at least 8 characters.")
  .max(128, "Password is too long.")
  .regex(/[A-Za-z]/, "Password must contain a letter.")
  .regex(/[0-9]/, "Password must contain a number.");

export const nameSchema = z
  .string({ required_error: "Name is required." })
  .trim()
  .min(2, "Name must be at least 2 characters.")
  .max(80, "Name is too long.")
  .regex(/^[^<>{}$]*$/, "Name contains invalid characters.");

const text = (max: number, label: string) =>
  z.string({ required_error: `${label} is required.` }).trim().min(1, `${label} is required.`).max(max, `${label} is too long.`);

const notes = z.string().trim().max(1000, "Notes are too long.").optional().default("");

export const money = (label: string) =>
  z
    .union([z.string(), z.number()], { required_error: `${label} is required.`, invalid_type_error: `${label} must be a number.` })
    .transform((v, ctx) => {
      const m = toMinor(v);
      if (m === null) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label} must be a valid amount (max 2 decimals).` });
        return z.NEVER;
      }
      return m;
    });

export const dateOnly = (label: string) =>
  z
    .string({ required_error: `${label} is required.` })
    .regex(/^\d{4}-\d{2}-\d{2}$/, `${label} must be a valid date.`)
    .transform((s, ctx) => {
      const d = new Date(`${s}T00:00:00.000Z`);
      if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label} must be a valid date.` });
        return z.NEVER;
      }
      const y = d.getUTCFullYear();
      if (y < 1970 || y > 2100) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label} is out of range.` });
        return z.NEVER;
      }
      return d;
    });

// ---------- Auth ----------
export const registerSchema = z.object({ name: nameSchema, email: emailSchema, password: passwordSchema });
export const loginSchema = z.object({ email: emailSchema, password: z.string().min(1, "Password is required.").max(128) });
export const profileSchema = z.object({
  name: nameSchema.optional(),
  currency: z.enum(["INR", "USD", "EUR", "GBP", "AED", "SGD", "AUD", "CAD"]).optional(),
  theme: z.enum(["midnight", "graphite", "ocean", "emerald", "royal", "sunset", "light"]).optional(),
});
export const changePasswordSchema = z
  .object({ currentPassword: z.string().min(1, "Current password is required.").max(128), newPassword: passwordSchema })
  .refine((d) => d.currentPassword !== d.newPassword, { message: "New password must be different.", path: ["newPassword"] });
export const deleteAccountSchema = z.object({
  password: z.string().min(1, "Password is required.").max(128),
  confirm: z.literal("DELETE", { errorMap: () => ({ message: 'Type "DELETE" to confirm.' }) }),
});

// ---------- Finance ----------
const recurring = z.enum(RECURRING).optional().default("none");

const incomeBase = z.object({
  title: text(120, "Title"),
  type: z.enum(INCOME_TYPES).default("extra"),
  category: z.enum(INCOME_CATEGORIES, { errorMap: () => ({ message: "Choose a valid category." }) }),
  amount: money("Amount"),
  date: dateOnly("Date"),
  recurring,
  notes,
});

const expenseBase = z.object({
  title: text(120, "Title"),
  category: z.enum(EXPENSE_CATEGORIES, { errorMap: () => ({ message: "Choose a valid category." }) }),
  amount: money("Amount"),
  date: dateOnly("Date"),
  recurring,
  notes,
});

const interest = z
  .union([z.string(), z.number()])
  .optional()
  .transform((v, ctx) => {
    if (v === undefined || v === "") return 0;
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Interest must be between 0 and 100." });
      return z.NEVER;
    }
    return Math.round(n * 100) / 100;
  });

const debtBase = z.object({
  title: text(120, "Title"),
  totalAmount: money("Total amount"),
  remainingAmount: money("Remaining amount"),
  emiAmount: money("EMI amount"),
  interestRate: interest,
  dueDate: dateOnly("Due date"),
  status: z.enum(DEBT_STATUS).default("active"),
  notes,
});

const goalBase = z.object({
  name: text(120, "Goal name"),
  targetAmount: money("Target amount"),
  currentAmount: money("Saved amount").optional().default(0),
  targetDate: dateOnly("Target date"),
  status: z.enum(GOAL_STATUS).default("active"),
  notes,
});

export const createSchemas: Record<ResourceKey, z.ZodTypeAny> = {
  income: incomeBase,
  expense: expenseBase,
  debt: debtBase.refine((d) => d.remainingAmount <= d.totalAmount, {
    message: "Remaining amount cannot exceed total amount.",
    path: ["remainingAmount"],
  }),
  goal: goalBase.refine((d) => d.targetAmount > 0, { message: "Target must be greater than zero.", path: ["targetAmount"] }),
};

// For PATCH, every field optional but still validated; `.default()` must not inject values.
export const updateSchemas: Record<ResourceKey, z.ZodTypeAny> = {
  income: z.object({
    title: text(120, "Title").optional(),
    type: z.enum(INCOME_TYPES).optional(),
    category: z.enum(INCOME_CATEGORIES).optional(),
    amount: money("Amount").optional(),
    date: dateOnly("Date").optional(),
    recurring: z.enum(RECURRING).optional(),
    notes: z.string().trim().max(1000).optional(),
  }),
  expense: z.object({
    title: text(120, "Title").optional(),
    category: z.enum(EXPENSE_CATEGORIES).optional(),
    amount: money("Amount").optional(),
    date: dateOnly("Date").optional(),
    recurring: z.enum(RECURRING).optional(),
    notes: z.string().trim().max(1000).optional(),
  }),
  debt: z.object({
    title: text(120, "Title").optional(),
    totalAmount: money("Total amount").optional(),
    remainingAmount: money("Remaining amount").optional(),
    emiAmount: money("EMI amount").optional(),
    interestRate: interest.optional(),
    dueDate: dateOnly("Due date").optional(),
    status: z.enum(DEBT_STATUS).optional(),
    notes: z.string().trim().max(1000).optional(),
  }),
  goal: z.object({
    name: text(120, "Goal name").optional(),
    targetAmount: money("Target amount").optional(),
    currentAmount: money("Saved amount").optional(),
    targetDate: dateOnly("Target date").optional(),
    status: z.enum(GOAL_STATUS).optional(),
    notes: z.string().trim().max(1000).optional(),
  }),
};

export const debtPaymentSchema = z.object({
  amount: money("Payment amount"),
  date: dateOnly("Payment date"),
});

export const goalContributionSchema = z.object({ amount: money("Contribution amount") });

// ---------- Admin ----------
const permissionList = z.array(z.enum(ALL_PERMISSIONS)).max(ALL_PERMISSIONS.length);

export const adminCreateUserSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
  role: z.enum(["user", "admin"]).default("user"),
  plan: z.enum(PLAN_IDS as [string, ...string[]]).default("free"),
  permissions: permissionList.optional(),
});

export const adminUpdateUserSchema = z.object({
  name: nameSchema.optional(),
  email: emailSchema.optional(),
  role: z.enum(["user", "admin"]).optional(),
  plan: z.enum(PLAN_IDS as [string, ...string[]]).optional(),
  status: z.enum(["active", "disabled"]).optional(),
  permissions: permissionList.optional(),
  password: passwordSchema.optional(),
  notifyUser: z.boolean().optional().default(true),
});

export const broadcastSchema = z.object({
  title: text(140, "Title"),
  message: text(1000, "Message"),
  audience: z.enum(["all", "free", "plus", "pro", "admins"]).default("all"),
  push: z.boolean().optional().default(true),
});

export const dbDeleteSchema = z.object({
  collection: z.enum(["notifications", "auditlogs", "realtimeevents", "ratelimits", "sessions", "pushsubscriptions"]),
  olderThanDays: z.number().int().min(0).max(3650).default(0),
  confirm: z.string(),
  password: z.string().min(1, "Password is required.").max(128),
});

export const pushSubscribeSchema = z.object({
  endpoint: z.string().url().max(1000).refine((u) => u.startsWith("https://"), "Invalid endpoint."),
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(4).max(100) }),
});

export const notificationListQuery = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  unread: z.enum(["1", "0"]).optional(),
});
