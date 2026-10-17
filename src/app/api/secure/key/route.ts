import { NextResponse } from "next/server";
import { serverPublicKey } from "@/lib/secure-channel";

export const runtime = "nodejs";

/** The server's PUBLIC key for the encrypted API channel (public by design — safe to cache). No DB access. */
export function GET() {
  return NextResponse.json({ success: true, data: { key: serverPublicKey(), alg: "ECDH-P256+HKDF-SHA256+AES-256-GCM" } }, { headers: { "Cache-Control": "no-cache" } });
}
