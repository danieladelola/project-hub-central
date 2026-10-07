// Client-safe money helpers. Amounts are integer minor units carried as strings; no float arithmetic.
const SYMBOLS: Record<string, string> = { USD: "$", EUR: "€", GBP: "£", CAD: "CA$", AUD: "A$", CHF: "CHF ", NGN: "₦", JPY: "¥", CNY: "CN¥", HKD: "HK$", SGD: "S$" };
export const CURRENCY_LIST = ["USD"] as const;
/** Only US Dollar accounts are offered. */
export const OPEN_CURRENCIES = [{ code: "USD", name: "US Dollar" }] as const;

export function formatMinor(minor: string | bigint, currency: string, opts: { signed?: boolean } = {}) {
  const v = typeof minor === "bigint" ? minor : BigInt(minor || "0");
  const neg = v < 0n;
  const abs = neg ? -v : v;
  const whole = (abs / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const frac = (abs % 100n).toString().padStart(2, "0");
  const sign = neg ? "-" : opts.signed && v > 0n ? "+" : "";
  return `${sign}${SYMBOLS[currency] ?? currency + " "}${whole}.${frac}`;
}

/** Plain decimal string without symbol, for CSV. */
export function minorToDecimal(minor: string) {
  if (!minor) return "";
  const v = BigInt(minor);
  const neg = v < 0n;
  const abs = neg ? -v : v;
  return `${neg ? "-" : ""}${abs / 100n}.${(abs % 100n).toString().padStart(2, "0")}`;
}

/** For charts only (display scaling). */
export function minorToChartNumber(minor: string) {
  return Number(BigInt(minor || "0")) / 100;
}

export function maskNumber(n: string) {
  return `•••• ${n.slice(-4)}`;
}

export const statusTone: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  active: "default", restricted: "secondary", frozen: "destructive", closed: "outline",
};

export function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}
