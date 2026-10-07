import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AccountPage, Panel, Msg, errText } from "@/components/AccountPage";
import { cancelLoanRequest, getMyLoan, listMyLoanRequests, payMyLoan } from "@/lib/loans.functions";
import { LoanServicing, RepaymentBadge } from "@/components/LoanServicing";
import { Fragment } from "react";
import { formatMinor, fmtDate } from "@/lib/money";

export const Route = createFileRoute("/loan-history")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Loan History — Universal Crest" },
      { name: "description", content: "Track the status of your Universal Crest loan requests." },
      { property: "og:title", content: "Loan History — Universal Crest" },
      { property: "og:description", content: "Track the status of your loan requests." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: LoanHistoryPage,
});

function LoanHistoryPage() {
  const list = useServerFn(listMyLoanRequests);
  const cancel = useServerFn(cancelLoanRequest);
  const loadLoan = useServerFn(getMyLoan);
  const payLoan = useServerFn(payMyLoan);
  const [open, setOpen] = useState<number | null>(null);
  const [items, setItems] = useState<Awaited<ReturnType<typeof listMyLoanRequests>> | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const reload = useCallback(() => list().then(setItems).catch((e) => { setItems([]); setMsg({ ok: false, text: errText(e) }); }), [list]);
  useEffect(() => { reload(); }, [reload]);

  return (
    <AccountPage title="Loan History" subtitle="Every loan request you've made and where it stands." wide actions={<Button asChild><Link to="/loan-request">New loan request</Link></Button>}>
      <Msg msg={msg} />
      <Panel title="Your loan requests">
        {!items ? <div className="h-24 animate-pulse rounded-md bg-muted" /> : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">You haven't requested a loan yet. <Link to="/loan-request" className="text-primary underline">Apply now</Link>.</p>
        ) : (
          <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm">
            <thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="py-2">Date</th><th>Type</th><th>Amount</th><th>Term</th><th>Purpose</th><th>Status</th><th /></tr></thead>
            <tbody>{items.map((l: (typeof items)[number]) => (<Fragment key={l.id}>
              <tr className="border-b align-top last:border-0">
                <td className="whitespace-nowrap py-3">{fmtDate(l.createdAt)}</td><td className="capitalize">{l.type}</td><td>{formatMinor(l.amount, l.currency)}</td><td>{l.termMonths} mo</td>
                <td className="max-w-[16rem] truncate" title={l.purpose}>{l.purpose}</td>
                <td><Badge variant="outline" className="capitalize">{l.status === "pending" ? "Under review" : l.status === "rejected" ? "Declined" : l.status}</Badge>{l.status === "approved" && l.payment && <p className="mt-1 text-xs text-muted-foreground">{l.apr}% APR · {formatMinor(l.payment, l.currency)}/mo · </p>}{l.state.repayment && <div className="mt-1 flex items-center gap-2"><RepaymentBadge state={l.state} />{l.state.repayment !== "paid_off" && <span className="text-xs text-muted-foreground">Balance {formatMinor(l.state.outstanding, l.currency)}{l.state.nextDueDate ? ` · next due ${fmtDate(l.state.nextDueDate)}` : ""}</span>}</div>}{l.note && <p className="mt-1 text-xs text-muted-foreground">{l.note}</p>}</td>
                <td className="text-right">{l.status === "pending" && <Button size="sm" variant="outline" onClick={async () => { if (!window.confirm("Cancel this loan request?")) return; try { await cancel({ data: { id: l.id } }); setMsg({ ok: true, text: "Loan request cancelled." }); } catch (e) { setMsg({ ok: false, text: errText(e) }); } reload(); }}>Cancel</Button>}{l.state.repayment && <Button size="sm" variant={open === l.id ? "secondary" : "outline"} onClick={() => setOpen(open === l.id ? null : l.id)}>{open === l.id ? "Hide" : l.state.repayment === "paid_off" ? "Details" : "Pay / details"}</Button>}</td>
              </tr>
              {open === l.id && <tr className="border-b"><td colSpan={7} className="py-4"><LoanServicing loanId={l.id} currency={l.currency} term={l.termMonths} load={loadLoan} pay={payLoan} onChanged={reload} /></td></tr>}
              </Fragment>))}</tbody>
          </table></div>
        )}
      </Panel>
    </AccountPage>
  );
}
