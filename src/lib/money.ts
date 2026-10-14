// Money is stored as INTEGER minor units (paise/cents) to avoid floating point errors.
// All sums happen on integers in MongoDB; we only convert to decimals at the edges.

export const MAX_AMOUNT_MAJOR = 1_000_000_000_000; // 1 lakh crore — sane upper bound

/** Parse a user amount ("1,234.50" | 1234.5) into integer minor units. Returns null if invalid. */
export function toMinor(input: unknown): number | null {
  if (typeof input === "number") {
    if (!Number.isFinite(input)) return null;
    input = input.toString();
  }
  if (typeof input !== "string") return null;
  const s = input.replace(/[,\s₹$]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [whole, frac = ""] = s.split(".");
  const minor = Number(whole) * 100 + Number((frac + "00").slice(0, 2));
  if (!Number.isSafeInteger(minor)) return null;
  if (minor > MAX_AMOUNT_MAJOR * 100) return null;
  return minor;
}

/** Integer minor units → decimal number for JSON responses (exact for 2 decimals). */
export function fromMinor(minor: number | null | undefined): number {
  if (!minor) return 0;
  return Math.round(minor) / 100;
}

export function formatMoney(major: number, currency = "INR", compact = false): string {
  const locale = currency === "INR" ? "en-IN" : "en-US";
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      maximumFractionDigits: compact ? 1 : 2,
      minimumFractionDigits: compact ? 0 : 0,
      notation: compact ? "compact" : "standard",
    }).format(major);
  } catch {
    return `${currency} ${major.toFixed(2)}`;
  }
}

export function pct(part: number, whole: number): number {
  if (!whole) return 0;
  return Math.round((part / whole) * 1000) / 10;
}
