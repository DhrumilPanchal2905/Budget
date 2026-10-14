// Shared theme catalogue (server + client safe).
export const THEMES = [
  { id: "midnight", name: "Midnight", swatch: ["#000000", "#3987e5"] },
  { id: "graphite", name: "Graphite", swatch: ["#111111", "#ecece8"] },
  { id: "ocean", name: "Ocean", swatch: ["#050c18", "#22bedc"] },
  { id: "emerald", name: "Emerald", swatch: ["#040e0a", "#20be78"] },
  { id: "royal", name: "Royal", swatch: ["#0a0716", "#9085e9"] },
  { id: "sunset", name: "Sunset", swatch: ["#120a08", "#f0783c"] },
  { id: "light", name: "Light", swatch: ["#f6f6f4", "#2a78d6"] },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

export const THEME_STORAGE_KEY = "bp-theme"; // UI preference only (never credentials)

/** Inline script (runs before paint) — prevents a flash of the wrong theme. */
export const themeScript = `(function(){try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');var ok=${JSON.stringify(THEMES.map((t) => t.id))};document.documentElement.setAttribute('data-theme',ok.indexOf(t)>-1?t:'midnight');}catch(e){document.documentElement.setAttribute('data-theme','midnight');}})();`;
