import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Menu, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

export function Reveal({ children, className = "", delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) {
        setVisible(true);
        io.disconnect();
      }
    }, { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return <div ref={ref} style={{ transitionDelay: `${delay}ms` }} className={`reveal ${visible ? "reveal-visible" : ""} ${className}`}>{children}</div>;
}
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/AuthShell";
import { getMe } from "@/lib/auth.functions";
import { useSiteSettings } from "@/lib/site-settings";

const SOCIAL_LABELS: Record<string, string> = { facebook: "Facebook", instagram: "Instagram", twitter: "X / Twitter", linkedin: "LinkedIn", youtube: "YouTube", tiktok: "TikTok", whatsapp: "WhatsApp", telegram: "Telegram" };
function ExtLink({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  const external = /^https?:/i.test(href);
  return <a href={href} className={className} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>{children}</a>;
}

export const NAV = [
  { to: "/", label: "Home" },
  { to: "/business", label: "Business" },
  { to: "/personal", label: "Personal" },
  { to: "/credit-cards", label: "Credit Cards" },
  { to: "/loans", label: "Loans" },
  { to: "/support", label: "Support" },
] as const;

function useSignedIn() {
  const fetchMe = useServerFn(getMe);
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    let alive = true;
    fetchMe().then((user) => {
      if (alive) setSignedIn(Boolean(user));
    }).catch(() => {
      if (alive) setSignedIn(false);
    });
    return () => {
      alive = false;
    };
  }, [fetchMe]);
  return signedIn;
}

export function SiteHeader({ overlay = false }: { overlay?: boolean }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const signedIn = useSignedIn();
  const hs = useSiteSettings().header;
  const linkCls = overlay ? "text-ink-foreground/80 hover:text-ink-foreground" : "text-muted-foreground hover:text-foreground";
  const activeCls = overlay ? "text-ink-foreground" : "text-primary";
  return (
    <header className={overlay ? "relative z-10" : "border-b bg-background"}>
      <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-4 py-4 sm:gap-4 sm:px-6 sm:py-5 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
        <div className="min-w-0"><Logo light={overlay} /></div>
        <nav aria-label="Main navigation" className="hidden items-center justify-center gap-4 whitespace-nowrap text-sm font-medium lg:flex xl:gap-6">
          {hs.showNav && NAV.map((n) => (
            <Link key={n.to} to={n.to} className={linkCls} activeProps={{ className: activeCls }} activeOptions={{ exact: true }}>
              {n.label}
            </Link>
          ))}
          {hs.links.map((l) => <ExtLink key={l.url + l.label} href={l.url} className={linkCls}>{l.label}</ExtLink>)}
        </nav>
        <div className="flex shrink-0 items-center justify-self-end gap-2">
          {!hs.showAuthButtons ? null : signedIn ? (
            <Button variant={overlay ? "gold" : "default"} asChild className="hidden sm:inline-flex"><Link to="/account">Dashboard</Link></Button>
          ) : (
            <>
              <Button variant={overlay ? "ghostLight" : "outline"} asChild className="hidden sm:inline-flex"><Link to="/login">Sign in</Link></Button>
              <Button variant={overlay ? "gold" : "default"} asChild className="hidden sm:inline-flex"><Link to="/register">Open account</Link></Button>
            </>
          )}
          <Button
            type="button"
            size="icon"
            variant={overlay ? "ghostLight" : "outline"}
            className="h-11 w-11 lg:hidden"
            aria-label={menuOpen ? "Close navigation" : "Open navigation"}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <X /> : <Menu />}
          </Button>
        </div>
      </div>
      {menuOpen && (
        <div className={`border-t lg:hidden ${overlay ? "border-ink-foreground/20 bg-ink/95" : "bg-background"}`}>
          <nav className="mx-auto grid max-w-6xl grid-cols-1 gap-1 px-4 py-4 text-sm min-[400px]:grid-cols-2 sm:px-6">
            {[...NAV, { to: "/faq", label: "FAQ" } as const, { to: "/security", label: "Security" } as const].map((n) => (
              <Link key={n.to} to={n.to} onClick={() => setMenuOpen(false)} className={`flex min-h-11 items-center rounded-md px-3 py-3 ${linkCls}`} activeProps={{ className: activeCls }} activeOptions={{ exact: true }}>
                {n.label}
              </Link>
            ))}
          </nav>
           <div className="grid grid-cols-1 gap-3 px-4 pb-5 min-[400px]:grid-cols-2 sm:hidden [&_a]:min-h-11">
            {signedIn ? (
              <Button variant={overlay ? "gold" : "default"} asChild className="min-[400px]:col-span-2"><Link to="/account" onClick={() => setMenuOpen(false)}>Dashboard</Link></Button>
            ) : (
              <>
                <Button variant={overlay ? "ghostLight" : "outline"} asChild><Link to="/login">Sign in</Link></Button>
                <Button variant={overlay ? "gold" : "default"} asChild><Link to="/register">Open account</Link></Button>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}

export function SiteFooter() {
  const s = useSiteSettings();
  const f = s.footer, g = s.general;
  const socials = Object.entries(s.social).filter(([, v]) => v);
  return (
    <footer className="bg-ink text-ink-foreground">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:grid-cols-2 sm:px-6 sm:py-16 lg:grid-cols-4">
        <div className="min-w-0 lg:col-span-2">
          <Logo light slot="footer_logo" />
          {f.tagline && <p className="mt-4 max-w-sm text-sm text-ink-foreground/70">{f.tagline}</p>}
          {f.showContact && (g.phone || g.address) && (
            <div className="mt-4 space-y-1 text-sm text-ink-foreground/70">
              {g.phone && <p><a href={`tel:${g.phone.replace(/[^+\d]/g, "")}`} className="hover:text-ink-foreground">{g.phone}</a></p>}
              {g.address && <p className="whitespace-pre-line">{g.address}</p>}
            </div>
          )}
          {socials.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm">
              {socials.map(([k, v]) => <ExtLink key={k} href={v} className="text-ink-foreground/80 hover:text-ink-foreground">{SOCIAL_LABELS[k] ?? k}</ExtLink>)}
            </div>
          )}
        </div>
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-widest text-gold">Banking</p>
          <ul className="mt-4 space-y-2 text-sm text-ink-foreground/80">
            {NAV.slice(1, 5).map((n) => <li key={n.to}><Link to={n.to} className="hover:text-ink-foreground">{n.label}</Link></li>)}
          </ul>
        </div>
        <div className="min-w-0 break-words [overflow-wrap:anywhere]">
          <p className="text-xs uppercase tracking-widest text-gold">Help</p>
          <ul className="mt-4 space-y-2 text-sm text-ink-foreground/80">
            <li><Link to="/support" className="hover:text-ink-foreground">Support centre</Link></li>
            <li><Link to="/faq" className="hover:text-ink-foreground">Frequently asked questions</Link></li>
            <li><Link to="/security" className="hover:text-ink-foreground">Security</Link></li>
            {f.showContact && g.supportEmail && <li><a href={`mailto:${g.supportEmail}`} className="hover:text-ink-foreground">{g.supportEmail}</a></li>}
            <li><Link to="/login" className="hover:text-ink-foreground">Online banking</Link></li>
            <li><Link to="/admin/login" className="hover:text-ink-foreground">Staff</Link></li>
          </ul>
        </div>
      </div>
      <div className="mx-auto flex max-w-6xl flex-wrap justify-center gap-x-5 gap-y-2 border-t border-ink-foreground/10 px-4 py-5 text-xs text-ink-foreground/60 sm:px-6">
        <Link to="/privacy" className="hover:text-ink-foreground">Privacy Policy</Link>
        <Link to="/terms" className="hover:text-ink-foreground">Terms &amp; Conditions</Link>
        <Link to="/security" className="hover:text-ink-foreground">Security</Link>
        {f.links.map((l) => <ExtLink key={l.url + l.label} href={l.url} className="hover:text-ink-foreground">{l.label}</ExtLink>)}
      </div>
      <div className="border-t border-ink-foreground/10 px-4 py-5 text-center text-xs text-ink-foreground/60 sm:px-6">
        {f.copyright || `© ${new Date().getFullYear()} ${g.company || g.siteName}. All rights reserved.`}
      </div>
    </footer>
  );
}

export function Eyebrow({ children, light = false }: { children: ReactNode; light?: boolean }) {
  return <p className={`text-xs font-semibold uppercase tracking-[0.25em] ${light ? "text-gold" : "text-primary"}`}>{children}</p>;
}

export function SectionHead({ eyebrow, title, text, center = false, light = false }: { eyebrow: string; title: string; text?: string; center?: boolean; light?: boolean }) {
  return (
    <div className={center ? "mx-auto max-w-2xl text-center" : "max-w-2xl"}>
      <Eyebrow light={light}>{eyebrow}</Eyebrow>
      <h2 className={`mt-4 text-2xl leading-tight min-[360px]:text-3xl sm:text-4xl md:text-5xl ${light ? "text-ink-foreground" : ""}`}>{title}</h2>
      {text && <p className={`mt-4 ${light ? "text-ink-foreground/70" : "text-muted-foreground"}`}>{text}</p>}
    </div>
  );
}

export function CtaBand() {
  return (
    <section className="bg-primary">
      <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-4 py-12 sm:px-6 sm:py-16 md:flex-row md:items-center">
        <div>
          <h2 className="text-2xl leading-tight text-primary-foreground min-[360px]:text-3xl sm:text-4xl">Ready to bank with Universal Crest?</h2>
          <p className="mt-2 text-primary-foreground/75">Open an account online in minutes.</p>
        </div>
        <div className="grid w-full gap-3 sm:flex sm:w-auto">
          <Button variant="gold" size="lg" asChild><Link to="/register">Open an account</Link></Button>
          <Button variant="ghostLight" size="lg" asChild><Link to="/support">Talk to us</Link></Button>
        </div>
      </div>
    </section>
  );
}

export function PageShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      {children}
      <CtaBand />
      <SiteFooter />
    </div>
  );
}

export function PageHero({ eyebrow, title, text, image }: { eyebrow: string; title: string; text: string; image: string }) {
  return (
    <section className="bg-secondary">
      <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 sm:px-6 sm:py-20 md:grid-cols-2 md:gap-12">
        <div>
          <Eyebrow>{eyebrow}</Eyebrow>
           <h1 className="mt-4 text-3xl leading-[1.08] min-[360px]:text-4xl sm:text-5xl md:text-6xl">{title}</h1>
          <p className="mt-5 max-w-md text-lg text-muted-foreground">{text}</p>
          <div className="mt-8 grid gap-3 sm:flex">
            <Button size="lg" asChild><Link to="/register">Get started</Link></Button>
            <Button size="lg" variant="outline" asChild><Link to="/support">Contact us</Link></Button>
          </div>
        </div>
        <img src={image} alt="" width={1280} height={960} className="aspect-[4/3] w-full rounded-lg object-cover shadow-xl" />
      </div>
    </section>
  );
}

export function FeatureGrid({ items }: { items: { icon: ReactNode; title: string; text: string }[] }) {
  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((f) => (
        <div key={f.title} className="rounded-lg border bg-card p-6 transition-shadow hover:shadow-lg sm:p-7">
          <div className="grid h-12 w-12 place-items-center rounded-lg bg-secondary text-primary [&_svg]:h-6 [&_svg]:w-6">{f.icon}</div>
          <h3 className="mt-5 text-2xl">{f.title}</h3>
          <p className="mt-2 text-sm text-muted-foreground">{f.text}</p>
        </div>
      ))}
    </div>
  );
}

export function ProductCards({ items }: { items: { name: string; tag: string; text: string; points: string[] }[] }) {
  return (
    <div className="grid gap-6 md:grid-cols-3">
      {items.map((p, i) => (
        <div key={p.name} className={`flex flex-col rounded-lg p-6 sm:p-8 ${i === 1 ? "bg-ink text-ink-foreground" : "border bg-card"}`}>
          <span className={`text-xs uppercase tracking-widest ${i === 1 ? "text-gold" : "text-primary"}`}>{p.tag}</span>
          <h3 className="mt-3 text-3xl">{p.name}</h3>
          <p className={`mt-3 text-sm ${i === 1 ? "text-ink-foreground/70" : "text-muted-foreground"}`}>{p.text}</p>
          <ul className="mt-6 flex-1 space-y-2 text-sm">
            {p.points.map((pt) => <li key={pt} className="flex gap-2"><span className={i === 1 ? "text-gold" : "text-primary"}>✓</span>{pt}</li>)}
          </ul>
          <Button className="mt-8" variant={i === 1 ? "gold" : "default"} asChild><Link to="/register">Apply now</Link></Button>
        </div>
      ))}
    </div>
  );
}
