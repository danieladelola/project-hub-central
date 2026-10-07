import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Landmark, Lock, ShieldCheck, Headphones, BadgeCheck } from "lucide-react";
import hero from "@/assets/hero.jpg";
import { useSiteSettings } from "@/lib/site-settings";

export function Logo({ light = false, slot = "logo" }: { light?: boolean; slot?: "logo" | "login_logo" | "footer_logo" | "admin_logo" }) {
  const s = useSiteSettings();
  const img = s.assets[slot] ?? s.assets.logo;
  const name = (slot === "logo" && s.header.title) || s.general.siteName;
  return (
    <Link to="/" className={`group flex min-w-0 items-center gap-2.5 ${light ? "text-ink-foreground" : "text-foreground"}`}>
      {img ? <img src={img} alt="" className="h-8 w-auto max-w-[120px] shrink-0 object-contain" />
        : <span className="grid h-9 w-9 shrink-0 place-items-center rounded-sm bg-gold text-ink shadow-md transition-transform duration-500 group-hover:rotate-6"><Landmark className="h-5 w-5" strokeWidth={2.2} /></span>}
      <span className="truncate font-display text-lg tracking-tight sm:text-xl">{name}</span>
    </Link>
  );
}

function SiteName() { return <>{useSiteSettings().general.siteName}</>; }

const TRUST = [
  { icon: ShieldCheck, text: "Bank-grade 256-bit encryption" },
  { icon: BadgeCheck, text: "Two-step sign-in on every login" },
  { icon: Headphones, text: "Dedicated support, 7 days a week" },
];

export function AuthShell({ title, subtitle, children, badge, icon }: { title: string; subtitle: ReactNode; children: ReactNode; badge?: string; icon?: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden bg-ink lg:block">
        <img src={hero} alt="Private banking lobby" width={1600} height={1104} className="absolute inset-0 h-full w-full object-cover opacity-70" />
        <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/40 to-transparent" />
        <div className="relative flex h-full flex-col justify-between p-12">
          <Logo light slot="login_logo" />
          <div>
            <p className="max-w-md font-display text-4xl leading-tight text-ink-foreground">
              Banking with the quiet confidence of a <span className="text-gold">crest</span>.
            </p>
            <ul className="mt-8 space-y-3">
              {TRUST.map((t) => (
                <li key={t.text} className="flex items-center gap-3 text-sm text-ink-foreground/85">
                  <t.icon className="h-4 w-4 text-gold" /> {t.text}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
      <div className="flex flex-col px-4 py-8 sm:px-6">
        <div className="flex flex-1 items-center justify-center py-6">
          <div className="w-full max-w-sm md:max-w-md">
            <div className="mb-8 lg:hidden"><Logo /></div>
            {icon && <div className="mb-6">{icon}</div>}
            {badge && <span className="mb-4 inline-block rounded-full border border-primary px-3 py-1 text-xs uppercase tracking-widest text-primary">{badge}</span>}
            <h1 className="text-2xl leading-tight min-[360px]:text-3xl sm:text-4xl">{title}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
            <div className="mt-8">{children}</div>
          </div>
        </div>
        <footer className="mx-auto flex w-full max-w-sm flex-wrap items-center justify-center gap-x-4 gap-y-1 border-t pt-4 text-xs text-muted-foreground md:max-w-md">
          <span className="flex items-center gap-1"><Lock className="h-3 w-3" /> Secure connection</span>
          <Link to="/privacy" className="hover:text-foreground">Privacy</Link>
          <Link to="/terms" className="hover:text-foreground">Terms</Link>
          <Link to="/support" className="hover:text-foreground">Help</Link>
          <span>© {new Date().getFullYear()} <SiteName /></span>
        </footer>
      </div>
    </div>
  );
}

export function StatusIcon({ tone, children }: { tone: "success" | "primary" | "destructive"; children: ReactNode }) {
  const cls = tone === "success" ? "bg-success/10 text-success" : tone === "destructive" ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary";
  return <span className={`grid h-14 w-14 place-items-center rounded-full ${cls} [&_svg]:h-7 [&_svg]:w-7`}>{children}</span>;
}
