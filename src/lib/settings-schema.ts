import { z } from "zod";

// Client-safe settings definitions. Each category is stored as one JSON row in bank_settings.
const str = (max = 200) => z.string().trim().max(max).default("");
const email = z.union([z.literal(""), z.string().trim().email().max(200)]).default("");
const url = z.union([z.literal(""), z.string().trim().url().max(300).refine((v) => /^https?:\/\//i.test(v), "Must start with http(s)://")]).default("");
const hex = z.union([z.literal(""), z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour like #6b1a2b")]).default("");
const link = z.object({ label: z.string().trim().min(1).max(60), url: z.string().trim().max(300).refine((v) => /^(https?:\/\/|\/|mailto:|tel:)/i.test(v), "Links must start with https://, /, mailto: or tel:") });
const links = z.array(link).max(12).default([]);

export const SETTINGS_SCHEMA = {
  general: z.object({
    siteName: z.string().trim().min(1, "Site name is required").max(80).default("Universal Crest"),
    description: str(300).default("Universal Crest personal and private banking."),
    siteUrl: url, adminEmail: email, supportEmail: email.default("support@universalcrest.vip"),
    phone: str(40), company: str(120).default("Universal Crest"), address: str(300),
    timezone: str(60).default("UTC"), currency: z.enum(["USD"]).default("USD"),
    dateFormat: z.enum(["MMM d, yyyy", "dd/MM/yyyy", "MM/dd/yyyy", "yyyy-MM-dd"]).default("MMM d, yyyy"),
    language: z.enum(["en", "fr", "es", "de"]).default("en"),
  }),
  branding: z.object({
    primaryColor: hex, secondaryColor: hex, backgroundColor: hex, logoText: str(4).default("U"),
  }),
  header: z.object({
    title: str(80), showNav: z.boolean().default(true), showAuthButtons: z.boolean().default(true), links,
  }),
  footer: z.object({
    tagline: str(300).default("Personal, business and private banking — built on trust, delivered with care."),
    copyright: str(200), links, showContact: z.boolean().default(true),
  }),
  seo: z.object({
    metaTitle: str(80), metaDescription: str(300), keywords: str(300), ogTitle: str(80), ogDescription: str(300),
    allowIndexing: z.boolean().default(true),
    googleVerification: z.string().trim().max(100).regex(/^[A-Za-z0-9_-]*$/, "Paste only the verification code").default(""),
    analyticsId: z.string().trim().max(30).regex(/^(G-[A-Z0-9]+)?$/, "Use a Google Analytics ID like G-XXXXXXX").default(""),
  }),
  social: z.object({ facebook: url, instagram: url, twitter: url, linkedin: url, youtube: url, tiktok: url, whatsapp: url, telegram: url }),
  email: z.object({
    senderName: str(80), replyTo: email, footer: str(400), buttonColor: hex,
  }),
  notifications: z.object({
    registrationAlerts: z.boolean().default(false), loanAlerts: z.boolean().default(false),
    ticketAlerts: z.boolean().default(false), alertEmail: email,
  }),
  security: z.object({
    sessionDays: z.number().int().min(1).max(30).default(7),
    maxLoginAttempts: z.number().int().min(3).max(20).default(5),
    lockMinutes: z.number().int().min(5).max(1440).default(15),
    allowRegistration: z.boolean().default(true),
  }),
  maintenance: z.object({
    enabled: z.boolean().default(false), title: str(120).default("We'll be right back"),
    message: str(1000).default("Online banking is undergoing scheduled maintenance. Please check back shortly."),
    contact: str(200),
  }),
} as const;

export type SettingsCategory = keyof typeof SETTINGS_SCHEMA;
export const CATEGORIES = Object.keys(SETTINGS_SCHEMA) as SettingsCategory[];
export type Settings = { [K in SettingsCategory]: z.infer<(typeof SETTINGS_SCHEMA)[K]> };

export const ASSET_SLOTS = ["logo", "admin_logo", "login_logo", "footer_logo", "favicon", "og_image", "email_logo", "maintenance_logo"] as const;
export type AssetSlot = (typeof ASSET_SLOTS)[number];

export function defaults(): Settings {
  return Object.fromEntries(CATEGORIES.map((c) => [c, SETTINGS_SCHEMA[c].parse({})])) as Settings;
}

/** Public, non-sensitive view sent to every visitor. */
export type PublicSettings = Pick<Settings, "general" | "branding" | "header" | "footer" | "seo" | "social" | "maintenance"> & {
  assets: Partial<Record<AssetSlot, string>>;
};
