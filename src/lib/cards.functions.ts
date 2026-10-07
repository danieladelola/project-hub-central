import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import bcrypt from "bcryptjs";

const id = z.number().int().positive();
async function ctx() {
  const { requireVerifiedUserId } = await import("./session.server");
  const userId = await requireVerifiedUserId();
  const { db } = await import("./db.server");
  return { userId, sql: await db() };
}
const fail = (error: string) => ({ ok: false as const, error });

type CardRow = { id: number; brand: "visa" | "mastercard"; last4: string; holder: string; expiry: string; status: "active" | "frozen"; balance: string; currency: string; createdAt: string };
const toRow = (r: any): CardRow => ({
  id: r.id, brand: r.brand, last4: String(r.card_number).slice(-4), holder: r.holder_name,
  expiry: `${String(r.exp_month).padStart(2, "0")}/${String(r.exp_year).slice(-2)}`, status: r.status,
  balance: String(r.balance_minor), currency: r.currency, createdAt: new Date(r.created_at).toISOString(),
});

export const listCards = createServerFn({ method: "GET" }).handler(async () => {
  const { userId, sql } = await ctx();
  const rows = await sql`select * from bank_cards where user_id = ${userId} and status <> 'deleted' order by created_at desc`;
  return rows.map(toRow) as CardRow[];
});

/** USD accounts the fee can be paid from, with available balance. */
export const cardFeeAccounts = createServerFn({ method: "GET" }).handler(async () => {
  const { userId, sql } = await ctx();
  const { balancesFor } = await import("./banking.server");
  const accs = await sql`select id, nickname, account_number from bank_accounts where user_id = ${userId} and currency = 'USD' and status = 'active' order by id`;
  const bal = await balancesFor(sql, accs.map((a: any) => a.id));
  return accs.map((a: any) => ({ id: a.id as number, nickname: a.nickname as string, last4: String(a.account_number).slice(-4), available: bal.get(a.id)?.available ?? "0" })) as Array<{ id: number; nickname: string; last4: string; available: string }>;
});

export const createCard = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({
    brand: z.enum(["visa", "mastercard"]),
    accountId: id,
    pin: z.string().regex(/^\d{4}$/, "Enter your 4-digit PIN."),
    requestKey: z.string().min(8).max(100),
  }).parse(d))
  .handler(async ({ data }) => {
    const { userId, sql } = await ctx();
    const u = (await sql`select full_name, pin_hash, status from bank_users where id = ${userId}`)[0];
    if (u.status !== "active") return fail("Your profile is suspended. Please contact support.");
    if (!u.pin_hash || !(await bcrypt.compare(data.pin, u.pin_hash))) return fail("Incorrect PIN.");
    const { balancesFor, newReference, audit, notify } = await import("./banking.server");
    const { CARD_FEE_MINOR, generateCard } = await import("./cards.server");
    return sql.begin(async (tx: any) => {
      const prior = (await tx`select * from bank_cards where user_id = ${userId} and request_key = ${data.requestKey}`)[0];
      if (prior) return { ok: true as const, card: toRow(prior) };
      const acc = (await tx`select id, currency, status from bank_accounts where id = ${data.accountId} and user_id = ${userId} for update`)[0];
      if (!acc) return fail("Account not found.");
      if (acc.status !== "active") return fail("This account can't be charged right now.");
      if (acc.currency !== "USD") return fail("The card fee must be paid from a USD account.");
      const bal = (await balancesFor(tx, [acc.id])).get(acc.id)!;
      if (BigInt(bal.available) < CARD_FEE_MINOR) return fail("Insufficient balance. You need at least $5.00 available.");
      const reference = newReference("CRD");
      const txn = (await tx`insert into bank_ledger_txns (idempotency_key, reference, description, status, created_by, posted_at, kind, from_account_id, amount_minor, currency)
        values (${"card:" + userId + ":" + data.requestKey}, ${reference}, ${"Virtual " + (data.brand === "visa" ? "Visa" : "Mastercard") + " card fee"}, 'posted', ${userId}, now(), 'card_fee', ${acc.id}, ${CARD_FEE_MINOR.toString()}, 'USD') returning id`)[0];
      await tx`insert into bank_ledger_entries (txn_id, account_id, currency, amount_minor) values (${txn.id}, ${acc.id}, 'USD', ${(-CARD_FEE_MINOR).toString()})`;
      await tx`insert into bank_ledger_entries (txn_id, system_account, currency, amount_minor) values (${txn.id}, 'SYSTEM:FEES:USD', 'USD', ${CARD_FEE_MINOR.toString()})`;
      let card: any = null;
      for (let i = 0; i < 5 && !card; i++) {
        const g = generateCard(data.brand);
        card = (await tx`insert into bank_cards (user_id, brand, card_number, cvv, exp_month, exp_year, holder_name, fee_txn_id, request_key)
          values (${userId}, ${data.brand}, ${g.number}, ${g.cvv}, ${g.expMonth}, ${g.expYear}, ${String(u.full_name).toUpperCase()}, ${txn.id}, ${data.requestKey})
          on conflict (card_number) do nothing returning *`)[0];
      }
      if (!card) throw new Error("Could not create card. Please try again.");
      await audit(tx, userId, userId, "card.created", { cardId: card.id, brand: data.brand, txnId: Number(txn.id) });
      await notify(tx, userId, "card", "Virtual card created", `Your virtual ${data.brand === "visa" ? "Visa" : "Mastercard"} ending ${String(card.card_number).slice(-4)} is ready. A $5.00 fee was charged.`);
      return { ok: true as const, card: toRow(card) };
    });
  });

export const revealCard = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ id }).parse(d))
  .handler(async ({ data }) => {
    const { userId, sql } = await ctx();
    const r = (await sql`select card_number, cvv from bank_cards where id = ${data.id} and user_id = ${userId} and status <> 'deleted'`)[0];
    if (!r) throw new Error("Card not found");
    return { number: r.card_number as string, cvv: r.cvv as string };
  });

export const setCardStatus = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ id, action: z.enum(["freeze", "unfreeze", "delete"]) }).parse(d))
  .handler(async ({ data }) => {
    const { userId, sql } = await ctx();
    const status = data.action === "freeze" ? "frozen" : data.action === "unfreeze" ? "active" : "deleted";
    const r = await sql`update bank_cards set status = ${status} where id = ${data.id} and user_id = ${userId} and status <> 'deleted' returning id`;
    if (!r[0]) throw new Error("Card not found");
    const { audit } = await import("./banking.server");
    await audit(sql, userId, userId, `card.${data.action}`, { cardId: data.id });
    return { ok: true };
  });
