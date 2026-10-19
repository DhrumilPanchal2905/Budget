import { z } from "zod";
import { route, ok, parseBody } from "@/lib/api";
import { rateLimit } from "@/lib/ratelimit";
import { startCheckout } from "@/lib/billing";
import { RazorpayError } from "@/lib/razorpay";
import { ApiError } from "@/lib/errors";

export const runtime = "nodejs";

const schema = z.object({ plan: z.enum(["plus", "pro", "unlimited"]) });

/** Creates the Razorpay order. The amount is decided on the server from the plan — never by the browser. */
export const POST = route({}, async ({ req, user, ip }) => {
  await rateLimit(`billing-order:${String(user._id)}`, 10, 10 * 60);
  const { plan } = await parseBody(req, schema);
  try {
    return ok(await startCheckout(user, plan, ip));
  } catch (e) {
    if (e instanceof RazorpayError) {
      console.error("[billing] order failed:", e.message);
      throw new ApiError(e.status === 503 ? 503 : 502, e.status === 503 ? e.message : "Couldn't start the payment right now. Please try again in a minute.");
    }
    throw e;
  }
});
