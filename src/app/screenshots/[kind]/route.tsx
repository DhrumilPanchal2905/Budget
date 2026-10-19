import { ImageResponse } from "next/og";

export const runtime = "edge";

// Store-style screenshots for the PWA install sheet (Chrome shows them in the "richer install UI") and for app
// listings. Drawn on the fly — no image files to maintain.
const card = (title: string, value: string, sub: string, color: string) => (
  <div style={{ display: "flex", flexDirection: "column", padding: 28, borderRadius: 28, background: "#14141b", border: "2px solid #26262e", flex: 1 }}>
    <div style={{ fontSize: 26, color: "#8a8a95" }}>{title}</div>
    <div style={{ fontSize: 52, fontWeight: 700, color, marginTop: 8 }}>{value}</div>
    <div style={{ fontSize: 22, color: "#8a8a95", marginTop: 6 }}>{sub}</div>
  </div>
);

export async function GET(_req: Request, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  const wide = kind === "wide";
  const W = wide ? 1920 : 1080;
  const H = wide ? 1080 : 1920;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", padding: wide ? 80 : 64, background: "linear-gradient(160deg,#05070d 0%,#0d1b33 55%,#123a6b 100%)", color: "#fff", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ width: 80, height: 80, borderRadius: 22, background: "#3987e5", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 48, fontWeight: 700 }}>₹</div>
          <div style={{ fontSize: 46, fontWeight: 700 }}>Budget Pro</div>
        </div>
        <div style={{ marginTop: 48, fontSize: wide ? 72 : 80, fontWeight: 700, lineHeight: 1.08, maxWidth: wide ? 1300 : 950 }}>Your money, explained by your own AI.</div>
        <div style={{ marginTop: 22, fontSize: 34, color: "#b9c6dd" }}>Expenses · Budgets · EMIs · Goals · Angel AI (voice + chat)</div>
        <div style={{ display: "flex", flexDirection: wide ? "row" : "column", gap: 28, marginTop: 60 }}>
          {card("Spent this month", "₹32,480", "₹2,150 less than last month", "#ff8a8a")}
          {card("Saved", "₹27,520", "46% savings rate", "#6ee7a8")}
          {card("Goal: Emergency fund", "68%", "On track · done by March", "#7fb2ff")}
        </div>
        <div style={{ display: "flex", flexDirection: "column", marginTop: 48, padding: 32, borderRadius: 28, background: "rgba(57,135,229,0.14)", border: "2px solid rgba(57,135,229,0.4)" }}>
          <div style={{ fontSize: 28, color: "#7fb2ff" }}>You asked Angel</div>
          <div style={{ fontSize: 38, marginTop: 8 }}>“Is mahine kharcha kyu badha?”</div>
          <div style={{ fontSize: 28, color: "#b9c6dd", marginTop: 16 }}>Food delivery is up ₹1,900 vs your usual — 6 orders more. Set a ₹4,000 food budget?</div>
        </div>
      </div>
    ),
    { width: W, height: H, headers: { "Cache-Control": "public, max-age=604800" } },
  );
}
