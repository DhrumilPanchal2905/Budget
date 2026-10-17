import { ImageResponse } from "next/og";

export const runtime = "edge";

/** 512×512 maskable PNG icon for Android install. */
export function GET() {
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#0b0b0f", color: "#3987e5", fontSize: 300, fontWeight: 700 }}>₹</div>,
    { width: 512, height: 512, headers: { "Cache-Control": "public, max-age=604800, immutable" } },
  );
}
