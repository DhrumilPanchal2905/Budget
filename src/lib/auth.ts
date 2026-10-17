import { createHash, randomBytes } from "crypto";
import { hash, verify } from "@node-rs/argon2";
import type { NextResponse } from "next/server";
import { Session, User, type UserDoc } from "./models";
import { SECURE_COOKIES, SESSION_ABSOLUTE_DAYS, SESSION_COOKIE, SESSION_IDLE_DAYS, SHORT_SESSION_HOURS } from "./env";
import { effectivePermissions, type Permission } from "./permissions";
import { geoFromHeaders } from "./geo";

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

const HOUR = 60 * 60 * 1000;
const idleMs = (remember: boolean) => (remember ? SESSION_IDLE_DAYS * DAY : SHORT_SESSION_HOURS * HOUR);

/**
 * Creates a server-side session. Only a random token goes to the browser (HttpOnly cookie);
 * the database stores its SHA-256 hash, so a DB leak cannot be replayed as a login.
 */
export async function createSession(
  userId: string,
  ip: string,
  userAgent: string,
  opts: { remember?: boolean; method?: "password" | "passkey" | "register"; headers?: Headers } = {},
): Promise<string> {
  const remember = Boolean(opts.remember);
  const token = randomBytes(32).toString("base64url");
  let geo: { country?: string; region?: string; city?: string } = {};
  try {
    geo = opts.headers ? geoFromHeaders(opts.headers) : {};
    // location is a nice-to-have: it must never block a sign-in
    if (geo.country) await User.updateOne({ _id: userId }, { $set: { lastLocation: { country: geo.country, region: geo.region, city: geo.city }, lastSeenAt: new Date() } });
  } catch (e) {
    console.error("[auth] location update skipped:", (e as Error)?.message);
  }
  await Session.create({
    country: geo.country,
    region: geo.region,
    city: geo.city,
    tokenHash: hashToken(token),
    userId,
    expiresAt: new Date(Date.now() + idleMs(remember)),
    ip,
    userAgent: userAgent.slice(0, 300),
    remember,
    method: opts.method ?? "password",
  });
  return token;
}

/**
 * remember = true  → persistent cookie (survives browser restarts, up to the absolute cap)
 * remember = false → browser-session cookie (deleted when the browser closes)
 * Always HttpOnly (JS can't read it), Secure on HTTPS, SameSite=Lax, __Host- prefixed in production.
 */
export function setSessionCookie(res: NextResponse, token: string, remember = false) {
  res.cookies.set({
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: SECURE_COOKIES,
    sameSite: "lax",
    path: "/",
    ...(remember ? { maxAge: SESSION_ABSOLUTE_DAYS * 24 * 60 * 60 } : {}),
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
    remember?: boolean;
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

  // Admins always use the Unlimited plan — keep stored data consistent (one-time, self-healing migration).
  if (user.role === "admin" && user.plan !== "unlimited") {
    await User.updateOne({ _id: user._id }, { $set: { plan: "unlimited" } });
    user.plan = "unlimited";
  }

  // Sliding idle expiry — refresh at most every 15 minutes to keep writes cheap.
  if (!session.lastSeenAt || now.getTime() - new Date(session.lastSeenAt).getTime() > 15 * 60 * 1000) {
    await Session.updateOne(
      { _id: session._id },
      { $set: { lastSeenAt: now, expiresAt: new Date(now.getTime() + idleMs(Boolean(session.remember))) } },
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
    language: user.replyLanguage || "auto",
    emailVerified: user.emailVerified !== false,
    permissions: perms,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt ?? null,
  };
}

export type PublicUser = ReturnType<typeof publicUser>;
