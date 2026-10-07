import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { db } from "./db.server";

async function uid() {
  const { requireUserId } = await import("./session.server");
  return requireUserId();
}
const id = z.number().int().positive();
const toMinor = (n: number) => BigInt(Math.round(n * 100));

// ---------------- IRS tax refunds ----------------
export const listMyTaxRefunds = createServerFn({ method: "GET" }).handler(async () => {
  const userId = await uid();
  const sql = await db();
  const rows = await sql`select r.id, r.tax_year, r.filing_status, r.ssn_last4, r.amount_minor::text as amount, r.status, r.admin_note, r.created_at, r.approved_minor::text as approved, a.nickname
    from bank_tax_refunds r left join bank_accounts a on a.id = r.deposit_account_id
    where r.user_id = ${userId} order by r.created_at desc`;
  type Row = { id: number; year: number; filing: string; last4: string; amount: string; status: string; note: string | null; account: string; createdAt: string; approved: string | null };
  return rows.map((r: any): Row => ({
    id: Number(r.id), year: Number(r.tax_year), filing: r.filing_status, last4: r.ssn_last4, amount: r.amount, status: r.status,
    note: r.admin_note ?? null, account: r.nickname ?? "—", createdAt: new Date(r.created_at).toISOString(), approved: r.approved ?? null,
  }));
});

export const listMyUsdAccounts = createServerFn({ method: "GET" }).handler(async () => {
  const userId = await uid();
  const sql = await db();
  const rows = await sql`select id, nickname, account_number from bank_accounts where user_id = ${userId} and currency = 'USD' and status = 'active' order by id`;
  return rows.map((r: any) => ({ id: Number(r.id), label: `${r.nickname} •••• ${String(r.account_number).slice(-4)}` })) as Array<{ id: number; label: string }>;
});

export const requestTaxRefund = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({
    // IRS: refund claims must be filed within 3 years of the return due date.
    year: z.number().int().min(new Date().getFullYear() - 3, "The IRS only allows refund claims for the last 3 tax years.").max(new Date().getFullYear() - 1),
    form: z.enum(["1040", "1040-SR", "1040-NR", "1040-X"]),
    agi: z.number().min(0).max(100_000_000),
    withheld: z.number().min(0).max(10_000_000),
    filing: z.enum(["single", "married_joint", "married_separate", "head_of_household", "widow"]),
    ssnLast4: z.string().regex(/^\d{4}$/, "Enter the last 4 digits of your SSN or ITIN."),
    amount: z.number().min(1, "Enter your expected refund.").max(1_000_000),
    accountId: id,
  }).refine((v) => v.amount <= v.withheld + 10_000, { message: "Expected refund looks too high compared to the federal tax withheld.", path: ["amount"] }).parse(d))
  .handler(async ({ data }) => {
    const userId = await uid();
    const sql = await db();
    const { notify, audit } = await import("./banking.server");
    const acct = (await sql`select id from bank_accounts where id = ${data.accountId} and user_id = ${userId} and currency = 'USD' and status = 'active'`)[0];
    if (!acct) return { ok: false as const, error: "Choose one of your active USD accounts for the deposit." };
    const dup = (await sql`select 1 from bank_tax_refunds where user_id = ${userId} and tax_year = ${data.year} and status in ('pending','approved')`)[0];
    if (dup) return { ok: false as const, error: `You already have a ${data.year} refund request.` };
    await sql.begin(async (tx: any) => {
      setTimeout(() => { void import("./mail.server").then((m) => m.sendAdminAlert("New tax refund request", "A customer submitted a tax refund request. Review it in the admin console, Tax refunds tab.")); }, 1500);
      const r = await tx`insert into bank_tax_refunds (user_id, tax_year, filing_status, ssn_last4, amount_minor, deposit_account_id, irs_form, agi_minor, withheld_minor)
        values (${userId}, ${data.year}, ${data.filing}, ${data.ssnLast4}, ${toMinor(data.amount).toString()}, ${acct.id}, ${data.form}, ${toMinor(data.agi).toString()}, ${toMinor(data.withheld).toString()}) returning id`;
      await notify(tx, userId, "tax_refund", "Tax refund request received", `Your ${data.year} IRS tax refund request is under review.`);
      await audit(tx, userId, userId, "tax_refund.requested", { id: r[0].id, year: data.year });
    });
    return { ok: true as const };
  });

export const cancelTaxRefund = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ id }).parse(d))
  .handler(async ({ data }) => {
    const userId = await uid();
    const sql = await db();
    const r = await sql`update bank_tax_refunds set status = 'cancelled', updated_at = now() where id = ${data.id} and user_id = ${userId} and status = 'pending' returning id`;
    return r[0] ? { ok: true as const } : { ok: false as const, error: "This request can no longer be cancelled." };
  });

// ---------------- Support tickets ----------------
export const listMyTickets = createServerFn({ method: "GET" }).handler(async () => {
  const userId = await uid();
  const sql = await db();
  const rows = await sql`select t.id, t.subject, t.category, t.status, t.updated_at,
      (select count(*) from bank_ticket_messages m where m.ticket_id = t.id)::int as messages
    from bank_support_tickets t where t.user_id = ${userId} order by t.updated_at desc`;
  return rows.map((r: any) => ({ id: Number(r.id), subject: r.subject as string, category: r.category as string, status: r.status as string, messages: r.messages as number, updatedAt: new Date(r.updated_at).toISOString() }));
});

export const getMyTicket = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ id }).parse(d))
  .handler(async ({ data }) => {
    const userId = await uid();
    const sql = await db();
    const t = (await sql`select id, subject, category, status, created_at from bank_support_tickets where id = ${data.id} and user_id = ${userId}`)[0];
    if (!t) throw new Error("Ticket not found");
    const msgs = await sql`select id, from_staff, body, created_at from bank_ticket_messages where ticket_id = ${t.id} order by created_at`;
    return {
      id: Number(t.id), subject: t.subject as string, category: t.category as string, status: t.status as string, createdAt: new Date(t.created_at).toISOString(),
      messages: msgs.map((m: any) => ({ id: Number(m.id), staff: !!m.from_staff, body: m.body as string, at: new Date(m.created_at).toISOString() })),
    };
  });

export const createTicket = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({
    subject: z.string().trim().min(4, "Add a short subject.").max(140),
    category: z.enum(["account", "cards", "transfers", "loans", "tax_refund", "security", "other"]),
    body: z.string().trim().min(10, "Describe the issue in a few words.").max(4000),
  }).parse(d))
  .handler(async ({ data }) => {
    const userId = await uid();
    const sql = await db();
    const open = (await sql`select count(*)::int as n from bank_support_tickets where user_id = ${userId} and status <> 'closed'`)[0].n;
    if (open >= 10) return { ok: false as const, error: "You have 10 open tickets. Close one before opening another." };
    const { notify } = await import("./banking.server");
    const newId = await sql.begin(async (tx: any) => {
      const t = await tx`insert into bank_support_tickets (user_id, subject, category) values (${userId}, ${data.subject}, ${data.category}) returning id`;
      await tx`insert into bank_ticket_messages (ticket_id, author_id, body) values (${t[0].id}, ${userId}, ${data.body})`;
      await notify(tx, userId, "support", "Support ticket opened", `Ticket #${t[0].id} "${data.subject}" was received. We'll reply soon.`);
      return Number(t[0].id);
    });
    if ((await (await import("./settings.server")).getSettings(sql)).notifications.ticketAlerts) {
      await (await import("./mail.server")).sendAdminAlert("New support ticket", `Ticket #${newId} (${data.category}): ${data.subject}`);
    }
    return { ok: true as const, id: newId };
  });

export const replyTicket = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ id, body: z.string().trim().min(2, "Write a message.").max(4000) }).parse(d))
  .handler(async ({ data }) => {
    const userId = await uid();
    const sql = await db();
    return sql.begin(async (tx: any) => {
      const t = (await tx`select id, status from bank_support_tickets where id = ${data.id} and user_id = ${userId} for update`)[0];
      if (!t) return { ok: false as const, error: "Ticket not found." };
      if (t.status === "closed") return { ok: false as const, error: "This ticket is closed. Open a new one if you still need help." };
      await tx`insert into bank_ticket_messages (ticket_id, author_id, body) values (${t.id}, ${userId}, ${data.body})`;
      await tx`update bank_support_tickets set status = 'open', updated_at = now() where id = ${t.id}`;
      return { ok: true as const };
    });
  });

export const closeTicket = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ id }).parse(d))
  .handler(async ({ data }) => {
    const userId = await uid();
    const sql = await db();
    await sql`update bank_support_tickets set status = 'closed', updated_at = now() where id = ${data.id} and user_id = ${userId}`;
    return { ok: true as const };
  });
