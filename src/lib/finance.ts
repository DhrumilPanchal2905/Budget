import type { Model, Types } from "mongoose";
import { Budget, Debt, Expense, Goal, GoalContribution, Income, oid, isObjectId, type UserDoc } from "./models";
import { DATE_FIELDS, MONEY_FIELDS, RESOURCES, type ResourceKey } from "./finance-config";
import { fromMinor } from "./money";
import { limitLabel, planForUser } from "./plans";
import { Errors } from "./errors";
import type { Permission } from "./permissions";
import { createSchemas, updateSchemas } from "./validation";
import { audit } from "./audit";
import { publish, userChannel } from "./realtime";
import { notifyUser, runAfter } from "./notify";
import { checkBudgetAlerts } from "./budgets";
import { goalInsight } from "./goals";
export { goalInsight, type GoalInsight } from "./goals";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const MODELS: Record<ResourceKey, Model<any>> = { income: Income, expense: Expense, debt: Debt, goal: Goal };

export function requiredPerms(resource: ResourceKey, action: "view" | "create" | "update" | "delete"): Permission[] {
  const base: Permission = action === "view" ? "finance.read" : "finance.write";
  return [base, `${resource}.${action}` as Permission];
}

const toDateStr = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString().slice(0, 10) : null);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function serializeRecord(resource: ResourceKey, doc: any, paceMinor?: number | null) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const out: Record<string, any> = { id: String(doc._id) };
  for (const f of RESOURCES[resource].fields) out[f.name] = doc[f.name] ?? (f.type === "text" || f.type === "textarea" ? "" : null);
  for (const f of MONEY_FIELDS[resource]) out[f] = fromMinor(doc[f]);
  for (const f of DATE_FIELDS[resource]) out[f] = toDateStr(doc[f]);
  if (resource === "goal") {
    out.progress = doc.targetAmount ? Math.min(100, Math.round((doc.currentAmount / doc.targetAmount) * 1000) / 10) : 0;
    out.insight = goalInsight(doc, paceMinor);
  }
  if (resource === "income" || resource === "expense") {
    out.autoRepeat = Boolean(doc.autoRepeat);
    out.recurrenceNext = doc.autoRepeat && doc.recurrenceNext ? toDateStr(doc.recurrenceNext) : null;
    out.autoAdded = Boolean(doc.recurringParentId);
  }
  if (resource === "debt") {
    out.paidAmount = fromMinor(Math.max(0, (doc.totalAmount ?? 0) - (doc.remainingAmount ?? 0)));
    out.progress = doc.totalAmount ? Math.round(((doc.totalAmount - doc.remainingAmount) / doc.totalAmount) * 1000) / 10 : 0;
  }
  if (resource === "expense" && doc.debtId) out.debtId = String(doc.debtId);
  out.createdAt = doc.createdAt;
  out.updatedAt = doc.updatedAt;
  return out;
}

const MONTH_MS = 30.4375 * 86400000;

/** Average monthly NET contribution per goal over the last 90 days (from the goal ledger). */
export async function goalPaces(goalIds: unknown[]): Promise<Map<string, number>> {
  if (!goalIds.length) return new Map();
  const since = new Date(Date.now() - 90 * 86400000);
  const rows = await GoalContribution.aggregate([
    { $match: { goalId: { $in: goalIds }, date: { $gte: since }, source: { $nin: ["initial", "edit"] } } },
    { $group: { _id: "$goalId", t: { $sum: "$amount" }, first: { $min: "$date" } } },
  ]);
  const out = new Map<string, number>();
  for (const r of rows as { _id: unknown; t: number; first: Date }[]) {
    const months = Math.max(1, Math.min(3, (Date.now() - new Date(r.first).getTime()) / MONTH_MS));
    out.set(String(r._id), r.t / months);
  }
  return out;
}

// ---------------- Auto-repeat (recurring) ----------------
/** Next occurrence. `anchorDay` = the original day-of-month (so a 31st entry goes 31 Jan → 28 Feb → 31 Mar, no drift). */
export function stepDate(d: Date, recurring: string, anchorDay?: number): Date {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = anchorDay ?? d.getUTCDate();
  if (recurring === "weekly") return new Date(d.getTime() + 7 * 86400000);
  if (recurring === "yearly") {
    const last = new Date(Date.UTC(y + 1, m + 1, 0)).getUTCDate();
    return new Date(Date.UTC(y + 1, m, Math.min(day, last)));
  }
  const last = new Date(Date.UTC(y, m + 2, 0)).getUTCDate();
  return new Date(Date.UTC(y, m + 1, Math.min(day, last)));
}

/** First repeat date that is after both the entry's own date and today (never back-fills old months). */
export function firstRecurrence(date: Date, recurring: string, today: Date): Date {
  const anchor = date.getUTCDate();
  let next = stepDate(date, recurring, anchor);
  let guard = 0;
  while (next.getTime() <= today.getTime() && guard++ < 600) next = stepDate(next, recurring, anchor);
  return next;
}

function todayUtcMidnight(): Date {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyRecurrence(doc: any) {
  if (doc.autoRepeat && doc.recurring && doc.recurring !== "none") {
    doc.recurrenceNext = firstRecurrence(new Date(doc.date), doc.recurring, todayUtcMidnight());
  } else {
    doc.autoRepeat = false;
    doc.recurrenceNext = undefined;
  }
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const SORTABLE: Record<ResourceKey, string[]> = {
  income: ["date", "amount", "title", "createdAt"],
  expense: ["date", "amount", "title", "createdAt"],
  debt: ["dueDate", "remainingAmount", "emiAmount", "title", "createdAt"],
  goal: ["targetDate", "targetAmount", "currentAmount", "name", "createdAt"],
};

export interface ListQuery {
  q?: string | null;
  category?: string | null;
  status?: string | null;
  month?: string | null; // YYYY-MM
  sort?: string | null;
  order?: string | null;
  page?: number;
  limit?: number;
}

export async function listRecords(ownerId: string, resource: ResourceKey, query: ListQuery) {
  const model = MODELS[resource];
  const def = RESOURCES[resource];
  const filter: Record<string, unknown> = { userId: oid(ownerId) };

  if (query.q && typeof query.q === "string") {
    filter[def.titleField] = { $regex: escapeRegex(query.q.slice(0, 60)), $options: "i" };
  }
  if (query.category && typeof query.category === "string" && (resource === "income" || resource === "expense")) {
    filter.category = query.category.slice(0, 40);
  }
  if (query.status && typeof query.status === "string" && (resource === "debt" || resource === "goal")) {
    filter.status = query.status.slice(0, 20);
  }
  if (query.month && /^\d{4}-\d{2}$/.test(query.month)) {
    const [y, m] = query.month.split("-").map(Number);
    filter[def.dateField] = { $gte: new Date(Date.UTC(y, m - 1, 1)), $lt: new Date(Date.UTC(y, m, 1)) };
  }

  const sortField = query.sort && SORTABLE[resource].includes(query.sort) ? query.sort : def.dateField;
  const sortDir = query.order === "asc" ? 1 : -1;
  const limit = Math.min(100, Math.max(1, query.limit || 20));
  const page = Math.max(1, query.page || 1);

  const amountField = resource === "debt" ? "remainingAmount" : resource === "goal" ? "currentAmount" : "amount";

  const [items, total, sumAgg] = await Promise.all([
    model.find(filter).sort({ [sortField]: sortDir, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    model.countDocuments(filter),
    model.aggregate([{ $match: filter }, { $group: { _id: null, total: { $sum: `$${amountField}` } } }]),
  ]);

  const paces = resource === "goal" ? await goalPaces(items.map((d) => d._id)) : null;
  return {
    items: items.map((d) => serializeRecord(resource, d, paces ? paces.get(String(d._id)) ?? null : undefined)),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
    limit,
    sum: fromMinor(sumAgg[0]?.total ?? 0),
  };
}

export async function getUsage(ownerId: string) {
  const userId = oid(ownerId);
  const [incomes, expenses, debts, goals] = await Promise.all([
    Income.countDocuments({ userId }),
    Expense.countDocuments({ userId }),
    Debt.countDocuments({ userId }),
    Goal.countDocuments({ userId }),
  ]);
  return { incomes, expenses, debts, goals, financeRecords: incomes + expenses + debts };
}

/** SERVER-SIDE plan enforcement — called before every record creation. */
export async function assertPlanCapacity(owner: Pick<UserDoc, "_id" | "plan" | "role">, resource: ResourceKey, adding = 1) {
  const plan = planForUser(owner);
  if (plan.unlimited) return; // Unlimited plan (and every admin): no record limits
  const usage = await getUsage(String(owner._id));
  if (resource === "goal") {
    if (plan.maxGoals !== null && usage.goals + adding > plan.maxGoals) {
      throw Errors.planLimit(`Your ${plan.name} plan allows up to ${plan.maxGoals} goals. Upgrade your plan to add more.`);
    }
  } else if (plan.maxFinanceRecords !== null && usage.financeRecords + adding > plan.maxFinanceRecords) {
    throw Errors.planLimit(
      `Your ${plan.name} plan allows up to ${limitLabel(plan.maxFinanceRecords)} finance records. Upgrade your plan to add more.`,
    );
  }
}

export interface Actor {
  user: UserDoc;
  ip: string;
}

/** After any mutation: realtime refresh for the owner, admin activity via audit, and notify if an admin acted. */
async function afterChange(
  actor: Actor,
  owner: Pick<UserDoc, "_id" | "email">,
  resource: ResourceKey,
  action: "create" | "update" | "delete",
  recordId: string,
  label: string,
  extra: Record<string, unknown> = {},
) {
  const ownerId = String(owner._id);
  const byAdmin = String(actor.user._id) !== ownerId;
  await audit({
    actor: actor.user,
    action: byAdmin ? `admin.finance.${action}` : `finance.${action}`,
    resource,
    resourceId: recordId,
    targetUserId: ownerId,
    metadata: { label, ...extra, ...(byAdmin ? { ownerEmail: owner.email } : {}) },
    ip: actor.ip,
  });
  await publish([userChannel(ownerId)], "finance:changed", { resource, action, id: recordId });
  if (byAdmin) {
    const verb = action === "create" ? "added" : action === "update" ? "updated" : "deleted";
    await notifyUser(ownerId, {
      type: "admin",
      title: `${RESOURCES[resource].label} ${verb} by admin`,
      message: `An administrator ${verb} "${label}" in your ${RESOURCES[resource].plural.toLowerCase()}.`,
      link: RESOURCES[resource].path,
    });
  }
}

export async function createRecord(actor: Actor, owner: UserDoc, resource: ResourceKey, body: unknown) {
  const data = createSchemas[resource].parse(body);
  await assertPlanCapacity(owner, resource);
  if (resource === "goal" && data.currentAmount >= data.targetAmount && data.status === "active") data.status = "achieved";
  if (resource === "debt" && data.remainingAmount === 0) data.status = "closed";
  const doc = new MODELS[resource]({ ...data, userId: owner._id });
  if (resource === "income" || resource === "expense") applyRecurrence(doc);
  await doc.save();
  if (resource === "goal" && doc.currentAmount > 0) {
    await GoalContribution.create({ userId: owner._id, goalId: doc._id, amount: doc.currentAmount, date: new Date(), note: "Starting amount", source: "initial" });
  }
  const label = doc[RESOURCES[resource].titleField];
  await afterChange(actor, owner, resource, "create", String(doc._id), label, amountMeta(resource, doc));
  if (resource === "expense") runAfter(() => checkBudgetAlerts(owner, doc.category));
  return serializeRecord(resource, doc.toObject());
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function amountMeta(resource: ResourceKey, doc: any) {
  const f = MONEY_FIELDS[resource][0];
  return { amount: fromMinor(doc[f]) };
}

async function findOwned(ownerId: string, resource: ResourceKey, id: string) {
  if (!isObjectId(id)) throw Errors.notFound(RESOURCES[resource].label);
  // Ownership enforced IN THE QUERY → another user's id simply does not exist for this user (IDOR-safe).
  const doc = await MODELS[resource].findOne({ _id: oid(id), userId: oid(ownerId) });
  if (!doc) throw Errors.notFound(RESOURCES[resource].label);
  return doc;
}

export async function updateRecord(actor: Actor, owner: UserDoc, resource: ResourceKey, id: string, body: unknown) {
  const data = updateSchemas[resource].parse(body) as Record<string, unknown>;
  for (const k of Object.keys(data)) if (data[k] === undefined) delete data[k];
  if (!Object.keys(data).length) throw Errors.badRequest("Nothing to update.");
  const doc = await findOwned(String(owner._id), resource, id);
  const beforeAmount = resource === "goal" ? doc.currentAmount : 0;
  doc.set(data);
  if ((resource === "income" || resource === "expense") && ("autoRepeat" in data || "recurring" in data || "date" in data)) applyRecurrence(doc);

  if (resource === "debt") {
    if (doc.remainingAmount > doc.totalAmount) throw Errors.badRequest("Remaining amount cannot exceed total amount.", { remainingAmount: "Remaining amount cannot exceed total amount." });
    if (doc.remainingAmount === 0 && doc.status === "active") doc.status = "closed";
  }
  if (resource === "goal" && doc.currentAmount >= doc.targetAmount && doc.status === "active") doc.status = "achieved";

  await doc.save();
  if (resource === "goal" && doc.currentAmount !== beforeAmount) {
    await GoalContribution.create({ userId: owner._id, goalId: doc._id, amount: doc.currentAmount - beforeAmount, date: new Date(), note: "Saved amount edited", source: "edit" });
  }
  const label = doc[RESOURCES[resource].titleField];
  await afterChange(actor, owner, resource, "update", String(doc._id), label, { fields: Object.keys(data) });
  if (resource === "expense") runAfter(() => checkBudgetAlerts(owner, doc.category));
  return serializeRecord(resource, doc.toObject());
}

export async function deleteRecord(actor: Actor, owner: UserDoc, resource: ResourceKey, id: string) {
  const doc = await findOwned(String(owner._id), resource, id);
  const label = doc[RESOURCES[resource].titleField];
  await doc.deleteOne();
  if (resource === "debt") {
    // Keep payment history (expenses) but unlink them from the deleted debt.
    await Expense.updateMany({ userId: owner._id, debtId: doc._id }, { $unset: { debtId: 1 } });
  }
  if (resource === "goal") await GoalContribution.deleteMany({ userId: owner._id, goalId: doc._id });
  await afterChange(actor, owner, resource, "delete", id, label, amountMeta(resource, doc));
  return { id };
}

function addMonthUTC(d: Date): Date {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  const last = new Date(Date.UTC(y, m + 2, 0)).getUTCDate();
  return new Date(Date.UTC(y, m + 1, Math.min(day, last)));
}

/** Records an EMI payment: creates an "EMI / Debt" expense and reduces the remaining balance. */
export async function payDebt(actor: Actor, owner: UserDoc, debtId: string, amount: number, date: Date) {
  const debt = await findOwned(String(owner._id), "debt", debtId);
  if (debt.status === "closed") throw Errors.badRequest("This debt is already closed.");
  if (amount <= 0) throw Errors.badRequest("Payment must be greater than zero.", { amount: "Payment must be greater than zero." });
  if (amount > debt.remainingAmount) {
    throw Errors.badRequest("Payment exceeds the remaining amount.", { amount: "Payment exceeds the remaining amount." });
  }
  await assertPlanCapacity(owner, "expense");

  const expense = await Expense.create({
    userId: owner._id,
    title: `EMI — ${debt.title}`.slice(0, 120),
    category: "EMI / Debt",
    amount,
    date,
    recurring: "monthly",
    notes: "Recorded from Debts & EMIs",
    debtId: debt._id,
  });
  try {
    debt.remainingAmount = debt.remainingAmount - amount;
    if (debt.remainingAmount <= 0) {
      debt.remainingAmount = 0;
      debt.status = "closed";
    } else if (amount >= debt.emiAmount) {
      debt.dueDate = addMonthUTC(debt.dueDate);
    }
    await debt.save();
  } catch (err) {
    await Expense.deleteOne({ _id: expense._id });
    throw err;
  }

  await audit({
    actor: actor.user,
    action: String(actor.user._id) === String(owner._id) ? "finance.debt.payment" : "admin.finance.debt.payment",
    resource: "debt",
    resourceId: String(debt._id),
    targetUserId: String(owner._id),
    metadata: { label: debt.title, amount: fromMinor(amount), remaining: fromMinor(debt.remainingAmount) },
    ip: actor.ip,
  });
  await publish([userChannel(String(owner._id))], "finance:changed", { resource: "debt", action: "update", id: String(debt._id) });
  if (debt.status === "closed") {
    await notifyUser(String(owner._id), {
      type: "debt",
      title: "Debt fully repaid 🎉",
      message: `Congratulations! "${debt.title}" is now fully paid off.`,
      link: "/debts",
    });
  } else if (String(actor.user._id) !== String(owner._id)) {
    await notifyUser(String(owner._id), {
      type: "admin",
      title: "EMI payment recorded by admin",
      message: `An administrator recorded a payment for "${debt.title}".`,
      link: "/debts",
    });
  }
  return serializeRecord("debt", debt.toObject());
}

/**
 * Adds money to a savings goal (or takes it out with `withdraw`). Every movement is written to the goal ledger
 * with its date, so history and the real saving pace are exact. Marks achieved + notifies at 100%.
 */
export async function contributeGoal(
  actor: Actor,
  owner: UserDoc,
  goalId: string,
  amount: number,
  opts: { withdraw?: boolean; date?: Date; note?: string; source?: "app" | "angel" | "admin" } = {},
) {
  if (amount <= 0) throw Errors.badRequest("Amount must be greater than zero.", { amount: "Amount must be greater than zero." });
  const goal = await findOwned(String(owner._id), "goal", goalId);
  if (goal.status === "cancelled") throw Errors.badRequest("This goal is cancelled.");
  if (opts.withdraw && amount > goal.currentAmount) throw Errors.badRequest("You can't withdraw more than the goal holds.", { amount: "More than the saved amount." });
  const wasAchieved = goal.currentAmount >= goal.targetAmount;
  goal.currentAmount += opts.withdraw ? -amount : amount;
  const nowAchieved = goal.currentAmount >= goal.targetAmount;
  if (nowAchieved && goal.status !== "paused") goal.status = "achieved";
  if (!nowAchieved && goal.status === "achieved") goal.status = "active";
  await goal.save();
  const byAdmin = String(actor.user._id) !== String(owner._id);
  await GoalContribution.create({
    userId: owner._id,
    goalId: goal._id,
    amount: opts.withdraw ? -amount : amount,
    date: opts.date ?? new Date(),
    note: (opts.note ?? "").slice(0, 200),
    source: opts.source ?? (byAdmin ? "admin" : "app"),
  });

  await audit({
    actor: actor.user,
    action: `${byAdmin ? "admin." : ""}finance.goal.${opts.withdraw ? "withdrawal" : "contribution"}`,
    resource: "goal",
    resourceId: String(goal._id),
    targetUserId: String(owner._id),
    metadata: { label: goal.name, amount: fromMinor(amount) },
    ip: actor.ip,
  });
  await publish([userChannel(String(owner._id))], "finance:changed", { resource: "goal", action: "update", id: String(goal._id) });
  if (nowAchieved && !wasAchieved) {
    await notifyUser(String(owner._id), {
      type: "goal",
      title: "Goal achieved 🎯",
      message: `You reached your savings goal "${goal.name}". Great work!`,
      link: "/goals",
    });
  }
  const paces = await goalPaces([goal._id]);
  return serializeRecord("goal", goal.toObject(), paces.get(String(goal._id)) ?? null);
}

/** Ledger of one goal (newest first). */
export async function goalHistory(ownerId: string, goalId: string) {
  await findOwned(ownerId, "goal", goalId);
  const rows = await GoalContribution.find({ userId: oid(ownerId), goalId: oid(goalId) }).sort({ date: -1, createdAt: -1 }).limit(200).lean();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return rows.map((r: any) => ({ id: String(r._id), amount: fromMinor(r.amount), date: toDateStr(r.date), note: r.note ?? "", source: r.source }));
}

/** Removes every finance record of a user (account deletion / admin delete user). */
export async function purgeUserFinance(userId: Types.ObjectId | string) {
  const id = oid(String(userId));
  await Promise.all([
    Income.deleteMany({ userId: id }),
    Expense.deleteMany({ userId: id }),
    Debt.deleteMany({ userId: id }),
    Goal.deleteMany({ userId: id }),
    Budget.deleteMany({ userId: id }),
    GoalContribution.deleteMany({ userId: id }),
  ]);
}
