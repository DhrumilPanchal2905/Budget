import { z } from "zod";
import { ok, parseBody, type AuthCtx } from "./api";
import { Errors } from "./errors";
import { isResourceKey, RESOURCES, type ResourceKey } from "./finance-config";
import { contributeGoal, createRecord, deleteRecord, listRecords, payDebt, requiredPerms, updateRecord } from "./finance";
import { debtPaymentSchema, goalContributionSchema } from "./validation";
import type { UserDoc } from "./models";
import type { Permission } from "./permissions";

// Shared by /api/finance/* (owner = signed-in user) and /api/admin/users/[id]/finance/* (owner = selected user).

export function assertPerms(ctx: AuthCtx, perms: Permission[]) {
  if (perms.some((p) => !ctx.perms.includes(p))) throw Errors.forbidden();
}

export function resourceParam(value: unknown): ResourceKey {
  if (typeof value !== "string" || !isResourceKey(value)) throw Errors.notFound("Resource");
  return value;
}

export async function handleList(ctx: AuthCtx, owner: UserDoc, resource: ResourceKey) {
  const sp = ctx.req.nextUrl.searchParams;
  const data = await listRecords(String(owner._id), resource, {
    q: sp.get("q"),
    category: sp.get("category"),
    status: sp.get("status"),
    month: sp.get("month"),
    sort: sp.get("sort"),
    order: sp.get("order"),
    page: Number(sp.get("page")) || 1,
    limit: Number(sp.get("limit")) || 20,
  });
  return ok(data);
}

export async function handleCreate(ctx: AuthCtx, owner: UserDoc, resource: ResourceKey) {
  const body = await parseBody(ctx.req, z.unknown());
  const record = await createRecord({ user: ctx.user, ip: ctx.ip }, owner, resource, body);
  return ok({ record }, `${RESOURCES[resource].label} added successfully.`, 201);
}

export async function handleUpdate(ctx: AuthCtx, owner: UserDoc, resource: ResourceKey, id: string) {
  const body = await parseBody(ctx.req, z.unknown());
  const record = await updateRecord({ user: ctx.user, ip: ctx.ip }, owner, resource, id, body);
  return ok({ record }, `${RESOURCES[resource].label} updated successfully.`);
}

export async function handleDelete(ctx: AuthCtx, owner: UserDoc, resource: ResourceKey, id: string) {
  await deleteRecord({ user: ctx.user, ip: ctx.ip }, owner, resource, id);
  return ok({ id }, `${RESOURCES[resource].label} deleted successfully.`);
}

export async function handleAction(ctx: AuthCtx, owner: UserDoc, resource: ResourceKey, id: string, action: string) {
  if (resource === "debt" && action === "pay") {
    const { amount, date } = await parseBody(ctx.req, debtPaymentSchema);
    const record = await payDebt({ user: ctx.user, ip: ctx.ip }, owner, id, amount, date);
    return ok({ record }, "EMI payment recorded successfully.");
  }
  if (resource === "goal" && action === "contribute") {
    const { amount } = await parseBody(ctx.req, goalContributionSchema);
    const record = await contributeGoal({ user: ctx.user, ip: ctx.ip }, owner, id, amount);
    return ok({ record }, "Contribution added successfully.");
  }
  throw Errors.notFound("Action");
}

/** Permissions needed for actions: paying a debt creates an expense + updates the debt. */
export function actionPerms(resource: ResourceKey, action: string): Permission[] {
  if (resource === "debt" && action === "pay") return [...requiredPerms("debt", "update"), "expense.create"];
  return requiredPerms(resource, "update");
}
