import { createContext, useContext, type ReactNode } from "react";
import { defaults, type PublicSettings } from "./settings-schema";

export function fallbackPublicSettings(): PublicSettings {
  const d = defaults();
  return { general: d.general, branding: d.branding, header: d.header, footer: d.footer, seo: d.seo, social: d.social, maintenance: d.maintenance, assets: {} };
}

const Ctx = createContext<PublicSettings>(fallbackPublicSettings());
export function SiteSettingsProvider({ value, children }: { value: PublicSettings; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export const useSiteSettings = () => useContext(Ctx);

/** Runtime brand colour overrides chosen by admins (hex values validated server-side). */
export function brandCss(s: PublicSettings) {
  const b = s.branding;
  const rules = [
    b.primaryColor && `--primary:${b.primaryColor};--ring:${b.primaryColor};--sidebar-primary:${b.primaryColor};`,
    b.secondaryColor && `--ink:${b.secondaryColor};--sidebar:${b.secondaryColor};`,
    b.backgroundColor && `--background:${b.backgroundColor};`,
  ].filter(Boolean).join("");
  return rules ? `:root{${rules}}` : "";
}
