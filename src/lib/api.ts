import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type ZodTypeAny, type z } from "zod";
import { connectDB } from "./db";
import { ApiError, Errors } from "./errors";
import { resolveSession, type AuthState } from "./auth";
import { SESSION_COOKIE, IS_PROD } from "./env";
import { clientIp } from "./ratelimit";
import type { Permission } from "./permissions";

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
    try {
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
  };
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
  console.error("[api] unexpected error:", IS_PROD ? (err as Error)?.message : err);
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
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw Errors.badRequest("Malformed JSON body.");
  }
  return schema.parse(raw);
}

export function searchParams(req: NextRequest) {
  return req.nextUrl.searchParams;
}
