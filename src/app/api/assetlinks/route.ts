// Digital Asset Links — lets an Android app (Trusted Web Activity built with Bubblewrap / PWABuilder) open this site
// full-screen without the browser bar, so Budget Pro can be published on Google Play.
// Set ANDROID_PACKAGE_NAME (e.g. in.dhrumilpanchal.budget) and ANDROID_SHA256_FINGERPRINTS (comma-separated) in env.
export const dynamic = "force-dynamic";

export function GET() {
  const pkg = process.env.ANDROID_PACKAGE_NAME?.trim();
  const prints = (process.env.ANDROID_SHA256_FINGERPRINTS || "").split(",").map((x) => x.trim()).filter(Boolean);
  const body = pkg && prints.length ? [{ relation: ["delegate_permission/common.handle_all_urls"], target: { namespace: "android_app", package_name: pkg, sha256_cert_fingerprints: prints } }] : [];
  return Response.json(body, { headers: { "Cache-Control": "public, max-age=3600" } });
}
