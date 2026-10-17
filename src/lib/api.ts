import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type ZodTypeAny, type z } from "zod";
import { connectDB } from "./db";
import { ApiError, Errors } from "./errors";
import { resolveSession, type AuthState } from "./auth";
import { SESSION_COOKIE, IS_PROD } from "./env";
import { clientIp } from "./ratelimit";
import type { Permission } from "./permissions";
import { keyFor, open as openSealed, sealResponse } from "./secure-channel";

/** AES key of the encrypted channel for this request (set by route(), read by parseBody()). */
const CHANNEL = new WeakMap<object, Buffer>();
/** Requests whose encrypted body could not be opened (browser holds an old server key) → tell it to renegotiate. */
const REKEY = new WeakSet<object>();
const REQUIRE_ENC = process.env.REQUIRE_ENCRYPTED_API === "true";

// ---------- Consistent responses ----------
export function ok<T>(data: T, message?: string, status = 200) {
  return NextResponse.json({ success: true, message, data }, { status, headers: { "Cache-Control": "no-store" } });
}

export function fail(status: number, message: string, errors?: Record<string, string>) {
  return NextResponse.json({ success: false, message, errors }, { status, headers: { "Cache-Control": "no-store" } });
}

// ---------- Request context ----------
export interface BaseCtx {
  req: NextRequest;
  ip: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  params: Record<string, any>;
}
export interface AuthCtx extends BaseCtx, AuthState {}

interface Options {
  /** Require a valid session (default true). */
  auth?: boolean;
  /** Require role === "admin". */
  admin?: boolean;
  /** Every listed permission is required. */
  perms?: Permission[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type NextCtx = { params: Promise<any> };

export function route(opts: Options & { auth: false }, fn: (ctx: BaseCtx) => Promise<Response>): (req: NextRequest, ctx: NextCtx) => Promise<Response>;
export function route(opts: Options, fn: (ctx: AuthCtx) => Promise<Response>): (req: NextRequest, ctx: NextCtx) => Promise<Response>;
export function route(opts: Options, fn: (ctx: AuthCtx) => Promise<Response>) {
  return async (req: NextRequest, nextCtx: NextCtx) => {
    let key: Buffer | null = null;
    try {
      key = keyFor(req.headers.get("x-bp-key"));
    } catch (e) {
      console.error("[api] secure channel key error:", (e as Error)?.message);
    }
    if (key) CHANNEL.set(req, key);
    const res = await run(req, nextCtx, key);
    if (REKEY.has(req)) {
      // Nothing was executed. Plain (unsealed) answer so the browser can refresh its key and safely retry.
      return NextResponse.json({ success: false, message: "Secure connection refreshed — please try again." }, { status: 409, headers: { "x-bp-rekey": "1", "Cache-Control": "no-store" } });
    }
    if (!key) return res;
    try {
      return await sealResponse(res, key);
    } catch (e) {
      console.error("[api] could not encrypt response:", (e as Error)?.message);
      return res;
    }
  };

  async function run(req: NextRequest, nextCtx: NextCtx, key: Buffer | null): Promise<Response> {
    try {
      // Pusher's own auth call and the cron job can't use our encrypted channel.
      const exempt = req.nextUrl.pathname.startsWith("/api/realtime/pusher-auth") || req.nextUrl.pathname.startsWith("/api/cron/");
      if (REQUIRE_ENC && !key && !exempt && req.method !== "GET" && req.method !== "HEAD") throw new ApiError(400, "Please reload the page (secure connection required).");
      const params = (await nextCtx?.params) ?? {};
      const ip = clientIp(req.headers);
      await connectDB();
      if (opts.auth === false) {
        return await (fn as unknown as (c: BaseCtx) => Promise<Response>)({ req, ip, params });
      }
      // 1–2. Authenticate session → authenticated user (never trust ids from the client)
      const state = await resolveSession(req.cookies.get(SESSION_COOKIE)?.value);
      if (!state) throw Errors.unauthenticated();
      // 3. Role check
      if (opts.admin && state.user.role !== "admin") throw Errors.forbidden();
      // 4. Permission check
      if (opts.perms?.some((p) => !state.perms.includes(p))) throw Errors.forbidden();
      return await fn({ req, ip, params, ...state });
    } catch (err) {
      return handleError(err);
    }
  }
}

export function handleError(err: unknown) {
  if (err instanceof ApiError) return fail(err.status, err.message, err.errors);
  if (err instanceof ZodError) {
    const errors: Record<string, string> = {};
    for (const issue of err.issues) {
      const key = issue.path.join(".") || "form";
      if (!errors[key]) errors[key] = issue.message;
    }
    const first = Object.values(errors)[0];
    return fail(400, first || "Please check the highlighted fields.", errors);
  }
  const e = err as { code?: number; name?: string };
  if (e?.code === 11000) return fail(409, "This record already exists.");
  if (e?.name === "CastError") return fail(400, "Invalid identifier.");
  if (e?.name === "ValidationError") return fail(400, "Please check the highlighted fields.");
  const ee = err as { message?: string; code?: unknown; codeName?: string };
  console.error("[api] unexpected error:", IS_PROD ? `${ee?.message}${ee?.code ? ` (code ${String(ee.code)}${ee.codeName ? ` ${ee.codeName}` : ""})` : ""}` : err);
  return fail(500, "Something went wrong. Please try again.");
}

// ---------- Body parsing + validation ----------
const MAX_BODY = 64 * 1024;

export async function parseBody<S extends ZodTypeAny>(req: NextRequest, schema: S): Promise<z.infer<S>> {
  const len = Number(req.headers.get("content-length") || 0);
  if (len > MAX_BODY) throw new ApiError(413, "Request is too large.");
  let raw: unknown;
  try {
    const text = await req.text();
    if (text.length > MAX_BODY) throw new ApiError(413, "Request is too large.");
    raw = text ? JSON.parse(text) : {};
    // Encrypted body from our own frontend → decrypt with this request's channel key.
    const key = CHANNEL.get(req);
    if (raw && typeof raw === "object" && typeof (raw as { __e?: unknown }).__e === "string") {
      let opened: string | null = null;
      try {
        opened = key ? openSealed(key, (raw as { __e: string }).__e) : null;
      } catch {
        opened = null;
      }
      if (opened === null) {
        REKEY.add(req);
        throw new ApiError(409, "Secure connection refreshed — please try again.");
      }
      raw = JSON.parse(opened);
    }
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw Errors.badRequest("Malformed JSON body.");
  }
  return schema.parse(raw);
}

export function searchParams(req: NextRequest) {
  return req.nextUrl.searchParams;
}
