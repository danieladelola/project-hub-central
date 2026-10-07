import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Copy, Printer, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AccountPage, Panel } from "@/components/AccountPage";
import { getReceiveDetails } from "@/lib/banking.functions";

export const Route = createFileRoute("/receive")({
  ssr: false,
  head: () => ({ meta: [{ title: "Receive Money — Universal Crest" }, { name: "description", content: "Share your Universal Crest account details to get paid." }, { property: "og:title", content: "Receive Money — Universal Crest" }, { property: "og:description", content: "Share your Universal Crest account details to get paid." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" }] }),
  component: ReceivePage,
});

async function copy(text: string, label: string) {
  try { await navigator.clipboard.writeText(text); toast.success(`${label} copied`); } catch { toast.error("Couldn't copy. Please copy it manually."); }
}

function ReceivePage() {
  const load = useServerFn(getReceiveDetails);
  const [d, setD] = useState<Awaited<ReturnType<typeof getReceiveDetails>> | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => { load().then(setD).catch(() => setErr(true)); }, [load]);

  return (
    <AccountPage requireKyc title="Receive Money" subtitle="Share these details with anyone who wants to pay you."
      actions={d && d.accounts.length > 0 && <Button variant="outline" className="print:hidden" onClick={() => window.print()}><Printer className="size-4" /> Print</Button>}>
      {err ? <p className="text-destructive">We couldn't load your details. Please refresh the page.</p> : !d ? <p className="text-muted-foreground">Loading…</p> : d.accounts.length === 0 ? (
        <Panel title="No account yet"><p className="text-sm text-muted-foreground">Open an account to get account details you can share.</p><Button asChild className="mt-4 h-11"><Link to="/accounts">Open an account</Link></Button></Panel>
      ) : (
        <>
          <Panel title="How to get paid" description="Other Universal Crest customers can send to your account number instantly and free through Send Money. Payments must be in the same currency as the account.">
            <p className="text-sm text-muted-foreground">Tip: tap “Share details” to copy everything in one go.</p>
          </Panel>
          <div className="grid gap-4 md:grid-cols-2">
            {d.accounts.map((a) => {
              const all = `Account name: ${d.holder}\nAccount number: ${a.accountNumber}\nBank: Universal Crest\nCurrency: ${a.currency}`;
              const fields: Array<[string, string]> = [["Account name", d.holder], ["Account number", a.accountNumber], ["Bank", "Universal Crest"], ["Currency", a.currency]];
              return (
                <section key={a.id} className="overflow-hidden rounded-lg border border-t-4 border-t-primary bg-card shadow-sm">
                   <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b p-4">
                     <div className="min-w-0"><p className="truncate font-medium">{a.nickname}</p><p className="text-xs capitalize text-muted-foreground">{a.type} account</p></div>
                    <Badge variant={a.status === "active" ? "default" : "secondary"} className="capitalize">{a.status}</Badge>
                  </div>
                  <dl className="divide-y">
                    {fields.map(([k, v]) => (
                       <div key={k} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3">
                         <div className="min-w-0"><dt className="text-xs text-muted-foreground">{k}</dt><dd className={k === "Account number" ? "break-all font-mono text-lg tracking-wider" : "break-words font-medium"}>{v}</dd></div>
                        {k !== "Bank" && k !== "Currency" && <Button size="icon" variant="ghost" aria-label={`Copy ${k.toLowerCase()}`} className="print:hidden" onClick={() => copy(v, k)}><Copy className="size-4" /></Button>}
                      </div>
                    ))}
                  </dl>
                  {a.status !== "active" && <p className="px-4 pb-3 text-xs text-destructive">This account can't receive payments while it's {a.status}.</p>}
                  <div className="border-t p-3 print:hidden"><Button variant="outline" className="w-full" onClick={() => copy(all, "Account details")}><Share2 className="size-4" /> Share details</Button></div>
                </section>
              );
            })}
          </div>
        </>
      )}
    </AccountPage>
  );
}
