// Razorpay REST client (no SDK needed). Keys stay on the server; the browser only ever sees the public key id.
// Docs: https://razorpay.com/docs/api/
import { createHmac, timingSafeEqual } from "crypto";

const API = "https://api.razorpay.com/v1";

export function razorpayKeys(): { keyId: string; keySecret: string } | null {
  const keyId = process.env.RAZORPAY_KEY_ID?.trim();
  const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim();
  return keyId && keySecret ? { keyId, keySecret } : null;
}

export function razorpayMode(): "live" | "test" | "off" {
  const k = razorpayKeys();
  if (!k) return "off";
  return k.keyId.startsWith("rzp_live_") ? "live" : "test";
}

export class RazorpayError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const k = razorpayKeys();
  if (!k) throw new RazorpayError("Payments are not set up yet.", 503);
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Basic ${Buffer.from(`${k.keyId}:${k.keySecret}`).toString("base64")}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as { error?: { description?: string } };
  if (!res.ok) throw new RazorpayError(json.error?.description || `Razorpay error ${res.status}`, res.status);
  return json as T;
}

export interface RzpOrder {
  id: string;
  amount: number;
  currency: string;
  receipt: string;
  status: "created" | "attempted" | "paid";
  notes?: Record<string, string>;
}

export interface RzpPayment {
  id: string;
  order_id: string;
  amount: number;
  currency: string;
  status: "created" | "authorized" | "captured" | "refunded" | "failed";
  method?: string;
  email?: string;
  error_description?: string | null;
  notes?: Record<string, string>;
}

export function createOrder(amountPaise: number, receipt: string, notes: Record<string, string>): Promise<RzpOrder> {
  return call<RzpOrder>("POST", "/orders", { amount: amountPaise, currency: "INR", receipt: receipt.slice(0, 40), notes, payment_capture: 1 });
}

export function fetchPayment(paymentId: string): Promise<RzpPayment> {
  return call<RzpPayment>("GET", `/payments/${encodeURIComponent(paymentId)}`);
}

export function fetchOrderPayments(orderId: string): Promise<{ items: RzpPayment[] }> {
  return call<{ items: RzpPayment[] }>("GET", `/orders/${encodeURIComponent(orderId)}/payments`);
}

/** Captures an authorized payment (only needed when auto-capture is off in the Razorpay dashboard). */
export function capturePayment(paymentId: string, amountPaise: number): Promise<RzpPayment> {
  return call<RzpPayment>("POST", `/payments/${encodeURIComponent(paymentId)}/capture`, { amount: amountPaise, currency: "INR" });
}

function safeEqualHex(a: string, b: string): boolean {
  const x = Buffer.from(a, "utf8");
  const y = Buffer.from(b, "utf8");
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Checkout signature: HMAC_SHA256(order_id + "|" + payment_id, key_secret). */
export function verifyCheckoutSignature(orderId: string, paymentId: string, signature: string): boolean {
  const k = razorpayKeys();
  if (!k || !signature) return false;
  const expected = createHmac("sha256", k.keySecret).update(`${orderId}|${paymentId}`).digest("hex");
  return safeEqualHex(expected, signature);
}

/** Webhook signature: HMAC_SHA256(raw body, webhook secret) in the X-Razorpay-Signature header. */
export function verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET?.trim();
  if (!secret || !signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  return safeEqualHex(expected, signature);
}
