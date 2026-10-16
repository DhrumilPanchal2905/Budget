"use client";

// Angel's living orb — a glowing sphere of light with a halo, drawn on <canvas>.
// It breathes when idle, swirls while thinking, and moves with your voice while listening / her voice while speaking.
import { useEffect, useRef, type MutableRefObject } from "react";

export type OrbState = "idle" | "wake" | "listening" | "thinking" | "speaking" | "off";

interface Props {
  size: number;
  state: OrbState;
  /** live loudness 0..1 (mic while listening, synthetic while speaking) */
  levelRef?: MutableRefObject<number>;
  className?: string;
  halo?: boolean;
  label?: string;
}

function themePrimary(): [number, number, number] {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue("--primary").trim();
    const parts = v.split(/\s+/).map(Number);
    if (parts.length === 3 && parts.every((n) => Number.isFinite(n))) {
      // very light/greyscale primaries (Graphite theme) → use Angel blue so the orb stays colourful
      const [r, g, b] = parts;
      if (Math.max(r, g, b) - Math.min(r, g, b) < 30) return [70, 140, 240];
      return [r, g, b];
    }
  } catch {
    /* ignore */
  }
  return [57, 135, 229];
}

export function AngelOrb({ size, state, levelRef, className, halo = true, label = "Angel" }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const ctx = el.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    el.width = size * dpr;
    el.height = size * dpr;
    ctx.scale(dpr, dpr);

    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    let primary = themePrimary();
    const themeObs = new MutationObserver(() => (primary = themePrimary()));
    themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    const VIOLET: [number, number, number] = [150, 110, 255];
    const CYAN: [number, number, number] = [40, 210, 230];
    const ROSE: [number, number, number] = [240, 90, 160];

    let raf = 0;
    let timer = 0;
    let t = Math.random() * 100;
    let energy = 0; // smoothed activity
    let spin = 0;
    let last = performance.now();

    const draw = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const st = stateRef.current;
      const live = levelRef?.current ?? 0;
      const targetEnergy =
        st === "listening" ? 0.25 + live * 0.95 : st === "speaking" ? 0.35 + live * 0.8 : st === "thinking" ? 0.45 : st === "wake" ? 0.12 : st === "off" ? 0 : 0.08;
      energy += (targetEnergy - energy) * Math.min(1, dt * 7);
      const speed = st === "thinking" ? 2.6 : st === "listening" || st === "speaking" ? 1.4 : 0.55;
      t += dt * speed;
      spin += dt * (st === "thinking" ? 3.2 : 0.4);

      const W = size;
      const cx = W / 2;
      const cy = W / 2 + (halo ? W * 0.04 : 0);
      const R = W * (halo ? 0.34 : 0.4) * (1 + energy * 0.08 + Math.sin(t * 1.3) * 0.015);
      ctx.clearRect(0, 0, W, W);

      // outer glow
      const glow = ctx.createRadialGradient(cx, cy, R * 0.6, cx, cy, R * 1.7);
      glow.addColorStop(0, `rgba(${primary.join(",")},${0.28 + energy * 0.35})`);
      glow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(cx, cy, R * 1.7, 0, Math.PI * 2);
      ctx.fill();

      // sphere body
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.clip();
      const body = ctx.createRadialGradient(cx - R * 0.3, cy - R * 0.35, R * 0.1, cx, cy, R);
      body.addColorStop(0, `rgba(${primary.map((c) => Math.round(c * 0.55)).join(",")},1)`);
      body.addColorStop(1, "rgba(6,8,20,1)");
      ctx.fillStyle = body;
      ctx.fillRect(cx - R, cy - R, R * 2, R * 2);

      // drifting light lobes
      ctx.globalCompositeOperation = "lighter";
      const lobes: [[number, number, number], number, number, number][] = [
        [primary, 0.0, 0.85, 1.0],
        [VIOLET, 2.1, 0.75, 1.25],
        [CYAN, 4.2, 0.7, 0.85],
        [ROSE, 1.1, 0.5, 1.6],
      ];
      for (const [col, phase, rad, f] of lobes) {
        const a = t * f + phase + spin * 0.35;
        const wobble = 0.34 + energy * 0.3;
        const x = cx + Math.cos(a) * R * wobble;
        const y = cy + Math.sin(a * 1.17) * R * wobble;
        const rr = R * (rad + energy * 0.22 + Math.sin(t * 2 + phase) * 0.04);
        const g = ctx.createRadialGradient(x, y, 0, x, y, rr);
        g.addColorStop(0, `rgba(${col.join(",")},${0.62 + energy * 0.3})`);
        g.addColorStop(0.45, `rgba(${col.join(",")},${0.28 + energy * 0.2})`);
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, rr, 0, Math.PI * 2);
        ctx.fill();
      }
      // voice ripples inside the sphere
      if (energy > 0.2) {
        ctx.globalCompositeOperation = "lighter";
        for (let i = 0; i < 3; i++) {
          const k = ((t * 0.9 + i / 3) % 1);
          ctx.strokeStyle = `rgba(255,255,255,${(1 - k) * 0.12 * energy})`;
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.arc(cx, cy, R * (0.3 + k * 0.7), 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      ctx.globalCompositeOperation = "source-over";
      // glass highlight
      const hl = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.45, 0, cx - R * 0.35, cy - R * 0.45, R * 0.7);
      hl.addColorStop(0, "rgba(255,255,255,0.35)");
      hl.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = hl;
      ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
      ctx.restore();

      // rim
      ctx.strokeStyle = `rgba(255,255,255,${0.12 + energy * 0.2})`;
      ctx.lineWidth = Math.max(1, W * 0.008);
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.stroke();

      // halo — Angel's signature
      if (halo) {
        const hy = cy - R * 1.22 + Math.sin(t * 1.1) * W * 0.008;
        const hw = R * 0.62;
        const hh = R * 0.14;
        const on = st === "off" ? 0.15 : 0.45 + energy * 0.55;
        ctx.save();
        ctx.shadowColor = `rgba(255,220,140,${0.9 * on})`;
        ctx.shadowBlur = W * 0.06 * (0.6 + energy);
        ctx.strokeStyle = `rgba(255,226,160,${on})`;
        ctx.lineWidth = Math.max(1.5, W * 0.022);
        ctx.beginPath();
        ctx.ellipse(cx, hy, hw, hh, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      // Calm states are drawn at a lower frame rate (tiny orbs even lower) to keep the app light.
      const calm = st === "idle" || st === "wake" || st === "off";
      const delay = reduce && calm ? 400 : calm ? (size < 32 ? 250 : 33) : 0;
      if (delay) timer = window.setTimeout(() => (raf = requestAnimationFrame(draw)), delay);
      else raf = requestAnimationFrame(draw);
    };

    const onVis = () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
      if (!document.hidden) {
        last = performance.now();
        raf = requestAnimationFrame(draw);
      }
    };
    document.addEventListener("visibilitychange", onVis);
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
      themeObs.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [size, halo, levelRef]);

  return <canvas ref={canvas} role="img" aria-label={label} className={className} style={{ width: size, height: size }} />;
}
