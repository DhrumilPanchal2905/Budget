import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Budget Pro — AI budget planner & expense tracker in English, Hindi and Gujarati";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: 80, background: "linear-gradient(135deg,#05070d 0%,#0d1b33 60%,#123a6b 100%)", color: "#fff", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{ width: 64, height: 64, borderRadius: 18, background: "#3987e5", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 38, fontWeight: 700 }}>₹</div>
          <div style={{ fontSize: 40, fontWeight: 700 }}>Budget Pro</div>
        </div>
        <div style={{ marginTop: 40, fontSize: 64, fontWeight: 700, lineHeight: 1.1, maxWidth: 950 }}>The budget planner that thinks with you.</div>
        <div style={{ marginTop: 24, fontSize: 30, color: "#b9c6dd" }}>Expenses · Budgets · EMIs · Goals · Angel AI — English · Hindi · Gujarati</div>
        <div style={{ marginTop: 36, fontSize: 24, color: "#7fb2ff" }}>budget.dhrumilpanchal.in</div>
      </div>
    ),
    size,
  );
}
