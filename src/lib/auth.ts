import { createHash, randomBytes } from "crypto";
import { hash, verify } from "@node-rs/argon2";
import type { NextResponse } from "next/server";
import { Session, User, type UserDoc } from "./models";
import { SECURE_COOKIES, SESSION_ABSOLUTE_DAYS, SESSION_COOKIE, SESSION_IDLE_DAYS } from "./env";
import { effectivePermissions, type Permission } from "./permissions";

const DAY = 24 * 60 * 60 * 1000;

// ---------- Passwords (Argon2id — the library default — with OWASP-recommended parameters) ----------
const ARGON_OPTS = { memoryCost: 19456, timeCost: 2, parallelism: 1, outputLen: 32 };

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON_OPTS);
}

let dummyHash: Promise<string> | null = null;

/** Constant-ish time verification: runs Argon2 even when the user does not exist. */
export async function verifyPassword(passwordHash: string | null | undefined, password: string): Promise<boolean> {
  if (!passwordHash) {
    dummyHash ??= hash("timing-equaliser-not-a-real-password", ARGON_OPTS);
    await verify(await dummyHash, password).catch(() => false);
    return false;
  }
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

// ---------- Sessions ----------
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string, ip: string, userAgent: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await Session.create({
    tokenHash: hashToken(token),
    userId,
    expiresAt: new Date(Date.now() + SESSION_IDLE_DAYS * DAY),
    ip,
    userAgent: userAgent.slice(0, 300),
  });
  return token;
}

export function setSessionCookie(res: NextResponse, token: string) {
  res.cookies.set({
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: SECURE_COOKIES,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_ABSOLUTE_DAYS * 24 * 60 * 60,
  });
}

export function clearSessionCookie(res: NextResponse) {
  res.cookies.set({
    name: SESSION_COOKIE,
    value: "",
    httpOnly: true,
    secure: SECURE_COOKIES,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export interface AuthState {
  user: UserDoc;
  perms: Permission[];
  sessionId: string;
}

/** Resolve a raw session token to the active user. Returns null for invalid/expired/disabled. */
export async function resolveSession(token: string | undefined | null): Promise<AuthState | null> {
  if (!token || token.length > 200) return null;
  const now = new Date();
  const session = await Session.findOne({ tokenHash: hashToken(token), expiresAt: { $gt: now } }).lean<{
    _id: unknown;
    userId: unknown;
    lastSeenAt?: Date;
    createdAt: Date;
  }>();
  if (!session) return null;

  // Absolute lifetime cap.
  if (now.getTime() - new Date(session.createdAt).getTime() > SESSION_ABSOLUTE_DAYS * DAY) {
    await Session.deleteOne({ _id: session._id });
    return null;
  }

  const user = await User.findById(session.userId).lean<UserDoc>();
  if (!user || user.status !== "active") {
    await Session.deleteOne({ _id: session._id });
    return null;
  }

  // Sliding idle expiry — refresh at most once per hour to keep writes cheap.
  if (!session.lastSeenAt || now.getTime() - new Date(session.lastSeenAt).getTime() > 60 * 60 * 1000) {
    await Session.updateOne(
      { _id: session._id },
      { $set: { lastSeenAt: now, expiresAt: new Date(now.getTime() + SESSION_IDLE_DAYS * DAY) } },
    );
  }

  return { user, perms: effectivePermissions(user.role, user.permissions ?? []), sessionId: String(session._id) };
}

export async function destroySession(token: string | undefined | null) {
  if (!token) return;
  await Session.deleteOne({ tokenHash: hashToken(token) });
}

export function publicUser(user: UserDoc, perms: Permission[]) {
  return {
    id: String(user._id),
    email: user.email,
    name: user.name,
    role: user.role,
    plan: user.plan,
    status: user.status,
    currency: user.currency || "INR",
    theme: user.theme || "midnight",
    permissions: perms,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt ?? null,
  };
}

export type PublicUser = ReturnType<typeof publicUser>;
