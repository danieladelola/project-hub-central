import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Copy, Eye, EyeOff, Plus, Snowflake, Sun, Trash2, Wifi } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AccountPage, errText } from "@/components/AccountPage";
import { cardFeeAccounts, createCard, listCards, revealCard, setCardStatus } from "@/lib/cards.functions";
import { formatMinor } from "@/lib/money";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/cards")({
  ssr: false,
  head: () => ({ meta: [{ title: "Virtual Cards — Universal Crest" }, { name: "description", content: "Create and manage virtual Visa and Mastercard cards." }, { property: "og:title", content: "Virtual Cards — Universal Crest" }, { property: "og:description", content: "Create and manage virtual Visa and Mastercard cards." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" }] }),
  component: CardsPage,
});

type Card = Awaited<ReturnType<typeof listCards>>[number];
type Brand = "visa" | "mastercard";

function BrandLogo({ brand, className }: { brand: Brand; className?: string }) {
  if (brand === "visa") return <span className={cn("font-serif text-2xl font-bold italic tracking-tight", className)}>VISA</span>;
  return (
    <span className={cn("flex items-center", className)} aria-label="Mastercard">
      <span className="h-7 w-7 rounded-full bg-destructive/90" />
      <span className="-ml-3 h-7 w-7 rounded-full bg-chart-4/90 mix-blend-screen" />
    </span>
  );
}

function group(n: string) { return n.replace(/(.{4})/g, "$1 ").trim(); }

function VirtualCard({ card, details, big }: { card: Card; details?: { number: string; cvv: string } | null | undefined; big?: boolean }) {
  return (
    <div className={cn("relative aspect-[1.586] w-full overflow-hidden rounded-2xl bg-gradient-to-br from-teal-deep via-teal-mid to-teal-deep p-5 text-teal-ink shadow-2xl ring-1 ring-teal-glow/20 transition duration-300 sm:p-6", big ? "max-w-md" : "", card.status === "frozen" && "grayscale-[60%] opacity-80")}>
      <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-teal-glow/20 blur-2xl" />
      <div className="pointer-events-none absolute -bottom-24 -left-10 h-56 w-56 rounded-full bg-teal-glow/10 blur-3xl" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-transparent via-teal-ink/5 to-transparent" />
      <div className="relative flex h-full flex-col justify-between">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-teal-ink/70">Universal Crest</p>
            <p className="text-[10px] uppercase tracking-widest text-teal-ink/50">Virtual {card.status === "frozen" ? "· Frozen" : ""}</p>
          </div>
          <Wifi className="h-6 w-6 rotate-90 text-teal-ink/80" aria-label="Contactless" />
        </div>
        <div className="flex items-center gap-3">
          <div className="h-8 w-11 rounded-md bg-gradient-to-br from-chart-4/80 to-chart-4/40 ring-1 ring-teal-ink/20" />
        </div>
        <p className={cn("font-mono tracking-[0.18em]", big ? "text-lg sm:text-2xl" : "text-base sm:text-lg")}>
          {details ? group(details.number) : `•••• •••• •••• ${card.last4}`}
        </p>
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-widest text-teal-ink/60">Cardholder</p>
            <p className="truncate text-sm font-medium">{card.holder}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-teal-ink/60">Expires</p>
            <p className="font-mono text-sm">{card.expiry}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-teal-ink/60">CVV</p>
            <p className="font-mono text-sm">{details ? details.cvv : "•••"}</p>
          </div>
          <BrandLogo brand={card.brand} />
        </div>
      </div>
    </div>
  );
}

function CardsPage() {
  const load = useServerFn(listCards);
  const reveal = useServerFn(revealCard);
  const setStatus = useServerFn(setCardStatus);
  const [cards, setCards] = useState<Card[] | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [details, setDetails] = useState<Record<number, { number: string; cvv: string }>>({});
  const [open, setOpen] = useState(false);
  const refresh = useCallback(() => load().then((c) => { setCards(c); setSelected((s) => (s && c.some((x) => x.id === s) ? s : c[0]?.id ?? null)); }).catch(() => setCards([])), [load]);
  useEffect(() => { refresh(); }, [refresh]);

  const current = cards?.find((c) => c.id === selected) ?? null;

  async function toggleDetails(c: Card) {
    if (details[c.id]) { setDetails(({ [c.id]: _, ...rest }) => rest); return; }
    try { const d = await reveal({ data: { id: c.id } }); setDetails((m) => ({ ...m, [c.id]: d })); } catch (e) { toast.error(errText(e)); }
  }
  async function copyNumber(c: Card) {
    try { const d = details[c.id] ?? (await reveal({ data: { id: c.id } })); await navigator.clipboard.writeText(d.number); toast.success("Card number copied"); } catch (e) { toast.error(errText(e)); }
  }
  async function act(c: Card, action: "freeze" | "unfreeze" | "delete") {
    if (action === "delete" && !confirm(`Delete card ending ${c.last4}? This can't be undone.`)) return;
    try { await setStatus({ data: { id: c.id, action } }); toast.success(action === "delete" ? "Card deleted" : action === "freeze" ? "Card frozen" : "Card unfrozen"); refresh(); } catch (e) { toast.error(errText(e)); }
  }

  return (
    <AccountPage requireKyc title="Virtual Cards" subtitle="Secure virtual Visa and Mastercard cards for online payments." wide
      actions={cards && cards.length > 0 && <Button className="min-h-11 bg-teal-mid text-teal-ink hover:bg-teal-deep" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Create Virtual Card</Button>}>
      {!cards ? <p className="text-muted-foreground">Loading…</p> : cards.length === 0 ? (
        <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-teal-deep to-teal-mid p-8 text-teal-ink sm:p-12">
          <div className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-teal-glow/20 blur-3xl" />
          <div className="relative grid items-center gap-10 md:grid-cols-2">
            <div className="space-y-4">
              <h2 className="font-serif text-3xl sm:text-4xl">Create your first virtual card</h2>
              <p className="text-teal-ink/80">Get a secure virtual Visa or Mastercard for online payments.</p>
              <p className="text-2xl font-semibold">$5 <span className="text-base font-normal text-teal-ink/70">per card</span></p>
              <Button size="lg" className="min-h-12 bg-teal-ink text-teal-deep hover:bg-teal-ink/90" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Create Virtual Card</Button>
            </div>
            <div className="rotate-[-6deg] transition duration-500 hover:rotate-0">
              <VirtualCard card={{ id: 0, brand: "visa", last4: "0000", holder: "YOUR NAME", expiry: "MM/YY", status: "active", balance: "0", currency: "USD", createdAt: "" }} big />
            </div>
          </div>
        </section>
      ) : (
        <>
          {current && (
            <section className="grid items-center gap-8 rounded-2xl border bg-card p-6 shadow-sm sm:p-8 xl:grid-cols-[minmax(0,1fr)_16rem]">
              <div className="mx-auto w-full max-w-md animate-in fade-in zoom-in-95 duration-500"><VirtualCard card={current} details={details[current.id]} big /></div>
              <div className="w-full space-y-4 xl:w-64">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Available balance</p>
                  <p className="text-3xl font-semibold">{formatMinor(current.balance, current.currency)}</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" onClick={() => toggleDetails(current)}>{details[current.id] ? <><EyeOff className="h-4 w-4" /> Hide</> : <><Eye className="h-4 w-4" /> Show Details</>}</Button>
                  <Button variant="outline" onClick={() => copyNumber(current)}><Copy className="h-4 w-4" /> Copy</Button>
                  {current.status === "active"
                    ? <Button variant="outline" onClick={() => act(current, "freeze")}><Snowflake className="h-4 w-4" /> Freeze</Button>
                    : <Button variant="outline" onClick={() => act(current, "unfreeze")}><Sun className="h-4 w-4" /> Unfreeze</Button>}
                  <Button variant="outline" className="text-destructive" onClick={() => act(current, "delete")}><Trash2 className="h-4 w-4" /> Delete</Button>
                </div>
                <p className="text-xs text-muted-foreground">Card details are for demonstration and can't be used for real payments.</p>
              </div>
            </section>
          )}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {cards.map((c) => (
              <button key={c.id} onClick={() => setSelected(c.id)} className={cn("rounded-xl border bg-card p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md", selected === c.id && "ring-2 ring-teal-mid")}>
                <div className="flex items-center justify-between">
                  <span className="rounded-md bg-teal-deep px-2 py-1 text-teal-ink"><BrandLogo brand={c.brand} className="text-sm" /></span>
                  <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", c.status === "active" ? "bg-teal-glow/20 text-teal-deep" : "bg-muted text-muted-foreground")}>{c.status === "active" ? "Active" : "Frozen"}</span>
                </div>
                <p className="mt-4 font-mono tracking-widest">•••• {c.last4}</p>
                <div className="mt-2 flex justify-between text-sm text-muted-foreground"><span>{formatMinor(c.balance, c.currency)}</span><span>Exp {c.expiry}</span></div>
                <p className="mt-3 text-xs font-medium text-teal-mid">View Details →</p>
              </button>
            ))}
          </div>
        </>
      )}
      <CreateDialog open={open} onOpenChange={setOpen} onCreated={(c) => { setSelected(c.id); refresh(); }} />
    </AccountPage>
  );
}

function CreateDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: (c: Card) => void }) {
  const accountsFn = useServerFn(cardFeeAccounts);
  const create = useServerFn(createCard);
  const [brand, setBrand] = useState<Brand>("visa");
  const [accounts, setAccounts] = useState<Awaited<ReturnType<typeof cardFeeAccounts>> | null>(null);
  const [accountId, setAccountId] = useState<number | null>(null);
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setError(""); setAccounts(null);
    accountsFn().then((a) => { setAccounts(a); setAccountId(a[0]?.id ?? null); }).catch(() => setAccounts([]));
  }, [open, accountsFn]);

  const acc = accounts?.find((a) => a.id === accountId);
  const enough = acc ? BigInt(acc.available) >= 500n : false;

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!accountId) return;
    const pin = String(new FormData(e.currentTarget).get("pin") ?? "");
    setBusy(true); setError("");
    try {
      const r = await create({ data: { brand, accountId, pin, requestKey: key } });
      if (!r.ok) setError(r.error);
      else { toast.success("Your virtual card is ready"); setKey(crypto.randomUUID()); onOpenChange(false); onCreated(r.card); }
    } catch (x) { setError(errText(x)); } finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create Virtual Card</DialogTitle>
          <DialogDescription>Choose your card network and pay the one-time fee.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-5">
          <div className="grid grid-cols-2 gap-3">
            {(["visa", "mastercard"] as const).map((b) => (
              <button type="button" key={b} onClick={() => setBrand(b)} className={cn("flex h-20 flex-col items-center justify-center gap-1 rounded-xl border bg-gradient-to-br from-teal-deep to-teal-mid text-teal-ink transition", brand === b ? "ring-2 ring-teal-glow ring-offset-2" : "opacity-60 hover:opacity-90")}>
                <BrandLogo brand={b} className="text-xl" />
                <span className="text-xs">{b === "visa" ? "Visa" : "Mastercard"}</span>
              </button>
            ))}
          </div>
          <div className="rounded-lg bg-muted p-4 text-sm">
            <div className="flex justify-between font-medium"><span>Virtual card creation fee</span><span>$5.00</span></div>
          </div>
          {!accounts ? <p className="text-sm text-muted-foreground">Loading your accounts…</p> : accounts.length === 0 ? (
            <p className="text-sm text-destructive">You need an active USD account to pay the card fee.</p>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="fee-acc">Pay from</Label>
              <select id="fee-acc" className="h-11 w-full rounded-md border bg-background px-3 text-sm" value={accountId ?? ""} onChange={(e) => setAccountId(Number(e.target.value))}>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.nickname} •••• {a.last4}</option>)}
              </select>
              {acc && <p className={cn("text-sm", enough ? "text-muted-foreground" : "text-destructive")}>Available balance: {formatMinor(acc.available, "USD")}{!enough && " — not enough for the fee"}</p>}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="card-pin">Transaction PIN</Label>
            <Input id="card-pin" name="pin" type="password" inputMode="numeric" maxLength={4} pattern="\d{4}" required className="h-11 max-w-40" />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={busy || !enough} className="h-12 w-full bg-teal-mid text-teal-ink hover:bg-teal-deep">{busy ? "Processing…" : "Pay $5 & Create Card"}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
