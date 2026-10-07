import { CATEGORIES, SETTINGS_SCHEMA, defaults, type PublicSettings, type Settings } from "./settings-schema";

let cache: { at: number; value: Settings; assets: Record<string, string> } | null = null;
const TTL = 30_000;

export function clearSettingsCache() { cache = null; }

async function load(sql: any) {
  if (cache && Date.now() - cache.at < TTL) return cache;
  const value = defaults();
  const rows = await sql`select category, value from bank_settings`;
  for (const r of rows) {
    const c = r.category as keyof Settings;
    if (!CATEGORIES.includes(c)) continue;
    const parsed = SETTINGS_SCHEMA[c].safeParse({ ...(value[c] as object), ...(r.value ?? {}) });
    if (parsed.success) (value as any)[c] = parsed.data;
  }
  const assets: Record<string, string> = {};
  for (const a of await sql`select slot, extract(epoch from updated_at)::bigint as v from bank_setting_assets`) assets[a.slot] = `/api/brand/${a.slot}?v=${a.v}`;
  cache = { at: Date.now(), value, assets };
  return cache;
}

export async function getSettings(sql?: any): Promise<Settings> {
  const s = sql ?? (await (await import("./db.server")).db());
  return (await load(s)).value;
}

export async function getPublicSettings(sql: any): Promise<PublicSettings> {
  const { value, assets } = await load(sql);
  const { general, branding, header, footer, seo, social, maintenance } = value;
  return { general: { ...general, adminEmail: "" }, branding, header, footer, seo, social, maintenance, assets };
}
