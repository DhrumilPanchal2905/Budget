import { AuditLog, type UserDoc } from "./models";
import { publish } from "./realtime";

const SENSITIVE = /pass|token|secret|hash|session|cookie|auth|key/i;

function sanitize(meta: unknown, depth = 0): unknown {
  if (meta === null || meta === undefined) return meta;
  if (depth > 3) return "[truncated]";
  if (Array.isArray(meta)) return meta.slice(0, 50).map((m) => sanitize(m, depth + 1));
  if (meta instanceof Date) return meta.toISOString();
  if (typeof meta === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(meta as Record<string, unknown>)) {
      if (SENSITIVE.test(k) || k.startsWith("$")) continue;
      out[k] = sanitize(v, depth + 1);
    }
    return out;
  }
  if (typeof meta === "string") return meta.slice(0, 300);
  return meta;
}

export interface AuditInput {
  actor?: Pick<UserDoc, "_id" | "email" | "role"> | null;
  action: string;
  resource?: string;
  resourceId?: string;
  targetUserId?: string;
  metadata?: Record<string, unknown>;
  ip?: string;
}

/** Writes an audit entry (never containing secrets) and streams it to admins in realtime. */
export async function audit(input: AuditInput) {
  try {
    const doc = await AuditLog.create({
      actorId: input.actor?._id,
      actorEmail: input.actor?.email,
      actorRole: input.actor?.role,
      action: input.action,
      resource: input.resource,
      resourceId: input.resourceId,
      targetUserId: input.targetUserId,
      metadata: sanitize(input.metadata ?? {}),
      ip: input.ip,
    });
    await publish(["admin"], "admin:activity", {
      id: String(doc._id),
      action: input.action,
      actorEmail: input.actor?.email ?? "system",
      resource: input.resource ?? null,
      targetUserId: input.targetUserId ?? null,
      at: doc.createdAt,
    });
  } catch (err) {
    console.error("[audit] failed", (err as Error).message);
  }
}
