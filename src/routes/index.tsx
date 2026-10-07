import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, ArrowRightLeft, BadgePercent, Bell, CreditCard, Globe2, Headphones, LineChart, ShieldCheck, Smartphone, UserPlus, Zap, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SiteHeader, SiteFooter, SectionHead, Eyebrow, CtaBand, Reveal } from "@/components/site/Site";
import hero from "@/assets/hero.jpg";
import about from "@/assets/about-new.jpg";
import card from "@/assets/card.jpg";
import business from "@/assets/business.jpg";
import loans from "@/assets/loans.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Universal Crest — Private & Personal Banking" },
      { name: "description", content: "Accounts, cards, loans and global transfers with Universal Crest. Open an account or sign in to online banking." },
      { property: "og:title", content: "Universal Crest — Private & Personal Banking" },
      { property: "og:description", content: "Accounts, cards, loans and global transfers with Universal Crest." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const tools = [
  { icon: <LineChart />, title: "Currency charts", text: "Follow market movements and make informed decisions with live currency charts.", cta: "View charts" },
  { icon: <Bell />, title: "Rate alerts", text: "Get notified the moment your preferred exchange rate is reached.", cta: "Create alert" },
  { icon: <UserPlus />, title: "Create account", text: "Open a digital account in minutes and start sending money worldwide.", cta: "Get started" },
  { icon: <Send />, title: "Money transfer", text: "Send money to family and friends around the world, quickly and securely.", cta: "Send money" },
];

const stories = [
  { img: card, tag: "Cards", title: "Virtual or physical — it's your choice", text: "Use a virtual card instantly online, or get a premium metal card delivered." },
  { img: about, tag: "Personal", title: "Send money anywhere, anytime", text: "Transfer to any destination from wherever you are, straight from your phone." },
  { img: business, tag: "Business", title: "Receive payments within 24 hours", text: "Get paid faster with early settlement for your business payments." },
];

const benefits = [
  { icon: <Globe2 />, title: "Global coverage" },
  { icon: <ArrowRightLeft />, title: "Easy transfers" },
  { icon: <Headphones />, title: "24/7 support" },
  { icon: <BadgePercent />, title: "Low fees" },
  { icon: <Zap />, title: "Instant processing" },
  { icon: <ShieldCheck />, title: "Bank-level security" },
];

const rates = [
  { name: "US Dollar", code: "USD", flag: "us", rate: "1.0000", change: "+0.00%" },
  { name: "Euro", code: "EUR", flag: "eu", rate: "0.9214", change: "+0.18%" },
  { name: "British Pound", code: "GBP", flag: "gb", rate: "0.7891", change: "-0.12%" },
  { name: "Japanese Yen", code: "JPY", flag: "jp", rate: "149.32", change: "+0.24%" },
  { name: "Canadian Dollar", code: "CAD", flag: "ca", rate: "1.3642", change: "-0.06%" },
];

const testimonials = [
  { q: "Opening my account took minutes, and transfers to my family abroad arrive the same day.", n: "Adaeze O.", r: "Personal customer" },
  { q: "The business account gives me clear reporting and fast settlements. It's made payroll simple.", n: "Michael R.", r: "Business owner" },
  { q: "Support actually answers, any time of day. That alone made me switch.", n: "Sofia L.", r: "Credit card holder" },
];

function Index() {
  return (
    <div className="min-h-screen">
      {/* Hero — cinematic, animated */}
      <section className="relative flex min-h-[42rem] flex-col overflow-hidden bg-ink sm:min-h-[92vh]">
        <div className="absolute inset-0">
          <img src={hero} alt="Universal Crest banking lobby" width={1600} height={1104} className="h-full w-full scale-105 object-cover opacity-50 animate-ken-burns motion-reduce:transform-none" />
          <div className="absolute inset-0 bg-gradient-to-r from-ink via-ink/70 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-t from-ink via-transparent to-ink/60" />
        </div>
        <SiteHeader overlay />
        <div className="relative flex flex-1 items-center">
          <div className="mx-auto w-full max-w-6xl px-4 pb-16 pt-14 sm:px-6 sm:pt-20">
            <div className="flex items-center gap-4 animate-hero-rise" style={{ animationDelay: "0.15s" }}>
              <span className="h-px w-12 bg-gold" />
              <p className="text-[10px] font-bold uppercase tracking-[0.5em] text-gold">Personal · Private · Business</p>
            </div>
            <h1 className="mt-8 text-5xl leading-[0.92] tracking-tight text-ink-foreground animate-hero-rise sm:text-7xl lg:text-8xl" style={{ animationDelay: "0.35s" }}>
              Wealth,<br />
              <span className="bg-gradient-to-r from-gold to-ink-foreground bg-clip-text text-transparent">guarded</span><br />
              with care.
            </h1>
            <p className="mt-8 max-w-lg text-lg leading-relaxed text-ink-foreground/60 animate-hero-rise" style={{ animationDelay: "0.55s" }}>
              Modern banking built on trust. Manage your assets with tailored private solutions and absolute discretion.
            </p>
            <div className="mt-12 grid max-w-sm gap-3 animate-hero-rise sm:flex" style={{ animationDelay: "0.75s" }}>
              <Button variant="gold" size="lg" asChild className="group">
                <Link to="/register">Open an account <ArrowRight className="transition-transform duration-300 group-hover:translate-x-1" /></Link>
              </Button>
              <Button variant="ghostLight" size="lg" asChild><Link to="/login">Online banking</Link></Button>
            </div>
          </div>
        </div>
        <div className="relative border-t border-ink-foreground/10 animate-hero-rise" style={{ animationDelay: "0.95s" }}>
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-6 sm:px-6">
            <p className="text-[10px] uppercase tracking-[0.3em] text-ink-foreground/40">USD accounts · Bank-grade security · 24/7 support</p>
            <div className="flex items-center gap-3 opacity-50">
              <span className="h-1 w-1 rounded-full bg-gold" />
              <span className="h-1 w-1 rounded-full bg-ink-foreground" />
              <span className="h-1 w-1 rounded-full bg-ink-foreground" />
            </div>
          </div>
        </div>
      </section>

      {/* About */}
      <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 sm:py-24 md:grid-cols-2 md:gap-14">
        <Reveal className="relative">
          <img src={about} alt="Customer using the Universal Crest app" loading="lazy" width={1024} height={1280} className="aspect-[4/5] w-full rounded-xl object-cover" />
          <div className="absolute bottom-3 right-3 rounded-lg bg-primary px-5 py-4 text-primary-foreground shadow-xl sm:-bottom-6 sm:-right-4 sm:px-6 sm:py-5 md:-right-8">
            <p className="font-display text-3xl">24/7</p>
            <p className="text-xs uppercase tracking-widest text-primary-foreground/75">Online banking</p>
          </div>
        </Reveal>
        <Reveal delay={150}>
          <SectionHead eyebrow="About us" title="We're reimagining digital banking" text="Universal Crest is committed to making banking simpler, more transparent and more human — for individuals and businesses alike." />
          <div className="mt-10 space-y-6">
            {[
              { icon: <Smartphone />, t: "Powerful mobile & online banking", d: "Manage accounts, cards and transfers from any device, quickly and easily." },
              { icon: <Zap />, t: "Transparency & speed", d: "Clear fees, real-time notifications and fast processing on every transaction." },
            ].map((x) => (
              <div key={x.t} className="flex gap-4">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-secondary text-primary">{x.icon}</div>
                <div><h3 className="text-xl">{x.t}</h3><p className="mt-1 text-sm text-muted-foreground">{x.d}</p></div>
              </div>
            ))}
          </div>
          <Button className="mt-10" size="lg" asChild><Link to="/personal">Learn more</Link></Button>
        </Reveal>
      </section>

      {/* Tools */}
      <section className="bg-secondary py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <Reveal>
          <SectionHead center eyebrow="Popular tools" title="Set up and exchange money in a minute" />
          <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {tools.map((t) => (
              <div key={t.title} className="group rounded-xl bg-card p-7 transition-all hover:-translate-y-1 hover:bg-primary hover:text-primary-foreground hover:shadow-xl">
                <div className="grid h-12 w-12 place-items-center rounded-lg bg-secondary text-primary">{t.icon}</div>
                <h3 className="mt-6 text-2xl">{t.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground group-hover:text-primary-foreground/75">{t.text}</p>
                <Link to="/login" className="mt-6 inline-block text-sm font-semibold uppercase tracking-wider">{t.cta} →</Link>
              </div>
            ))}
          </div>
          </Reveal>
        </div>
      </section>

      {/* Global market stories */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
        <Reveal>
        <SectionHead eyebrow="Covering the global market" title="Payments that drive growth" text="Higher payment success rates, lower costs, stronger fraud protection and access to global markets." />
        <div className="mt-14 grid gap-8 md:grid-cols-3">
          {stories.map((s) => (
            <article key={s.title}>
              <div className="relative overflow-hidden rounded-xl">
                <img src={s.img} alt="" loading="lazy" width={1280} height={960} className="aspect-[4/3] w-full object-cover transition-transform duration-500 hover:scale-105" />
                <span className="absolute left-4 top-4 rounded-full bg-primary px-3 py-1 text-xs text-primary-foreground">{s.tag}</span>
              </div>
              <h3 className="mt-5 text-2xl">{s.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{s.text}</p>
            </article>
          ))}
        </div>
        </Reveal>
      </section>

      {/* Why choose us */}
      <section className="bg-ink py-16 sm:py-24">
        <Reveal>
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 sm:px-6 md:grid-cols-2 md:gap-14">
          <div>
            <SectionHead light eyebrow="Why choose us" title="Innovative, digital and always secure" text="We use data and technology to simplify banking — so you spend less time managing money and more time growing it." />
            <ul className="mt-10 space-y-4">
              {["Historical currency rates", "Travel expense calculator", "Currency email updates", "Fraud monitoring around the clock"].map((x) => (
                <li key={x} className="flex items-center gap-3 text-ink-foreground"><span className="grid h-6 w-6 place-items-center rounded-full bg-gold text-xs text-ink">✓</span>{x}</li>
              ))}
            </ul>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <img src={card} alt="" loading="lazy" width={1280} height={960} className="aspect-square w-full rounded-xl object-cover" />
            <img src={loans} alt="" loading="lazy" width={1280} height={960} className="mt-10 aspect-square w-full rounded-xl object-cover" />
          </div>
        </div>
        </Reveal>
      </section>

      {/* Benefits */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
        <Reveal>
        <SectionHead center eyebrow="Your benefits" title="Your one-stop digital banking platform" />
        <div className="mt-10 grid grid-cols-2 gap-3 sm:mt-14 sm:gap-6 md:grid-cols-3 lg:grid-cols-6">
          {benefits.map((b) => (
            <div key={b.title} className="rounded-lg border p-4 text-center transition-colors hover:border-primary sm:p-6">
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-secondary text-primary">{b.icon}</div>
              <p className="mt-4 font-display text-lg">{b.title}</p>
            </div>
          ))}
        </div>
        </Reveal>
      </section>

      {/* Exchange rates */}
      <section aria-labelledby="exchange-heading" className="bg-market py-16 font-sans text-market-foreground sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <Reveal>
          <div className="max-w-3xl">
            <p className="text-[11px] font-extrabold uppercase text-market-primary">Exchange rates</p>
            <h2 id="exchange-heading" className="mt-4 font-market text-3xl font-extrabold leading-tight sm:text-4xl md:text-5xl">Exchange money worldwide<br className="hidden sm:block" /> with low fees</h2>
            <p className="mt-4 max-w-2xl text-sm text-market-muted sm:text-base">Indicative rates against the US Dollar. Final rates are confirmed at the time of transfer.</p>
          </div>
          <div className="mt-10 overflow-x-auto rounded-lg border border-market-border bg-market-surface">
            <table aria-label="Indicative exchange rates against the US Dollar" className="w-full min-w-[38rem] border-collapse text-left text-sm">
              <thead className="border-b border-market-border text-[10px] font-bold uppercase text-market-muted">
                <tr><th scope="col" className="px-5 py-5 sm:px-8">Currency</th><th scope="col" className="px-5 py-5 text-right sm:px-8">Rate</th><th scope="col" className="px-5 py-5 text-right sm:px-8">Change (24h)</th><th scope="col" className="px-5 py-5 text-right sm:px-8">Action</th></tr>
              </thead>
              <tbody>
                {rates.map((r) => (
                  <tr key={r.code} className="border-b border-market-border transition-colors last:border-0 hover:bg-market/50 motion-reduce:transition-none">
                    <td className="px-5 py-6 sm:px-8"><div className="flex items-center gap-4"><img src={`https://flagcdn.com/w80/${r.flag}.png`} srcSet={`https://flagcdn.com/w160/${r.flag}.png 2x`} width={40} height={40} alt={`${r.name} flag`} loading="lazy" className="h-10 w-10 shrink-0 rounded-full border border-market-border object-cover" /><div><p className="font-bold">{r.name}</p><p className="mt-0.5 text-xs text-market-muted">{r.code}</p></div></div></td>
                    <td className="px-5 py-6 text-right font-bold tabular-nums sm:px-8">{r.rate}</td>
                    <td className="px-5 py-6 text-right sm:px-8"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium tabular-nums ${r.change === "+0.00%" ? "bg-muted text-muted-foreground" : r.change.startsWith("-") ? "bg-destructive/10 text-destructive" : "bg-success/10 text-success"}`}>{r.change}</span></td>
                    <td className="px-5 py-6 text-right sm:px-8"><Button size="sm" className="h-9 rounded-full bg-market-primary px-6 text-xs font-bold text-primary-foreground hover:bg-market-primary/90" asChild><Link to="/login" aria-label={`Send ${r.code}`}>Send</Link></Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </Reveal>
        </div>
      </section>

      {/* Testimonials */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
        <Reveal>
        <SectionHead center eyebrow="Testimonials" title="What our customers say" />
        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {testimonials.map((t) => (
            <figure key={t.n} className="rounded-xl border bg-card p-8">
              <span className="font-display text-5xl leading-none text-primary">“</span>
              <blockquote className="mt-2 text-foreground">{t.q}</blockquote>
              <figcaption className="mt-6 text-sm"><span className="font-semibold">{t.n}</span><span className="text-muted-foreground"> · {t.r}</span></figcaption>
            </figure>
          ))}
        </div>
        </Reveal>
      </section>

      <CtaBand />
      <SiteFooter />
    </div>
  );
}
