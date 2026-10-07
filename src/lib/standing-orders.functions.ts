import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "./db.server";

async function uid() {
  const { requireVerifiedUserId } = await import("./session.server");
  return requireVerifiedUserId();
}
const fail = (error: string) => ({ ok: false as const, error });

export const listStandingOrders = createServerFn({ method: "GET" }).handler(async () => {
  const userId = await uid();
  const sql = await db();
  const { processDueStandingOrders } = await import("./standing-orders.server");
  await processDueStandingOrders(sql, userId);
  const rows = await sql`select o.*, a.account_number as from_no, a.nickname from bank_standing_orders o
    join bank_accounts a on a.id = o.from_account_id where o.user_id = ${userId} order by (o.status in ('cancelled','completed')), o.created_at desc`;
  type Row = { id: number; fromAccount: string; to: string; amount: string; currency: string; description: string; day: number; nextRun: string; endDate: string | null; status: string; runs: number; lastResult: string };
  return rows.map((o: any): Row => ({
    id: o.id as number, fromAccount: `${o.nickname} ••••${String(o.from_no).slice(-4)}`, to: `••••${String(o.to_account_number).slice(-4)}`,
    amount: String(o.amount_minor), currency: o.currency as string, description: (o.description ?? "") as string,
    day: o.day_of_month as number, nextRun: new Date(o.next_run_date).toISOString().slice(0, 10),
    endDate: o.end_date ? new Date(o.end_date).toISOString().slice(0, 10) : null, status: o.status as string,
    runs: o.runs_count as number, lastResult: (o.last_result ?? "") as string,
  }));
});

export const createStandingOrder = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({
    fromAccountId: z.number().int().positive(),
    toAccountNumber: z.string().regex(/^\d{10}$/, "Recipient account numbers are 10 digits."),
    amount: z.string().regex(/^\d{1,13}(\.\d{1,2})?$/, "Enter an amount like 25 or 25.50."),
    description: z.string().trim().max(140).default(""),
    dayOfMonth: z.number().int().min(1).max(28),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
    pin: z.string().regex(/^\d{4}$/, "Enter your 4-digit PIN."),
  }).parse(d))
  .handler(async ({ data }) => {
    const userId = await uid();
    const sql = await db();
    const u = (await sql`select pin_hash from bank_users where id = ${userId}`)[0];
    if (!u?.pin_hash || !(await bcrypt.compare(data.pin, u.pin_hash))) return fail("Incorrect PIN.");
    const [w = "0", f = ""] = data.amount.split(".");
    const minor = BigInt(w) * 100n + BigInt((f + "00").slice(0, 2));
    if (minor <= 0n) return fail("Enter an amount greater than zero.");
    if (minor > 100000000n) return fail("Standing orders are limited to 1,000,000.00 per payment.");
    const src = (await sql`select id, currency, status from bank_accounts where id = ${data.fromAccountId} and user_id = ${userId}`)[0];
    if (!src || src.status !== "active") return fail("Choose one of your active accounts.");
    const dst = (await sql`select id, currency, status from bank_accounts where account_number = ${data.toAccountNumber}`)[0];
    if (!dst) return fail("No account found with that number.");
    if (dst.id === src.id) return fail("You can't pay the same account.");
    if (dst.currency !== src.currency) return fail(`Both accounts must hold the same currency (${src.currency}).`);
    const { nextRunDate } = await import("./standing-orders.server");
    const next = nextRunDate(data.dayOfMonth, new Date(), true);
    if (data.endDate && data.endDate < next) return fail("End date must be after the first payment date.");
    const count = (await sql`select count(*)::int n from bank_standing_orders where user_id = ${userId} and status in ('active','paused')`)[0].n;
    if (count >= 20) return fail("You can have up to 20 standing orders.");
    const row = (await sql`insert into bank_standing_orders (user_id, from_account_id, to_account_number, amount_minor, currency, description, day_of_month, next_run_date, end_date)
      values (${userId}, ${src.id}, ${data.toAccountNumber}, ${minor.toString()}, ${src.currency}, ${data.description || null}, ${data.dayOfMonth}, ${next}, ${data.endDate}) returning id`)[0];
    const { audit } = await import("./banking.server");
    await audit(sql, userId, userId, "standing_order.create", { orderId: row.id, amount: minor.toString(), day: data.dayOfMonth });
    const { processDueStandingOrders } = await import("./standing-orders.server");
    await processDueStandingOrders(sql, userId);
    return { ok: true as const, id: row.id as number, nextRun: next };
  });

export const updateStandingOrder = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ id: z.number().int().positive(), action: z.enum(["pause", "resume", "cancel"]) }).parse(d))
  .handler(async ({ data }) => {
    const userId = await uid();
    const sql = await db();
    const o = (await sql`select * from bank_standing_orders where id = ${data.id} and user_id = ${userId}`)[0];
    if (!o) return fail("Standing order not found.");
    if (o.status === "cancelled" || o.status === "completed") return fail("This standing order has ended.");
    if (data.action === "pause") await sql`update bank_standing_orders set status = 'paused' where id = ${o.id}`;
    if (data.action === "cancel") await sql`update bank_standing_orders set status = 'cancelled' where id = ${o.id}`;
    if (data.action === "resume") {
      const { nextRunDate } = await import("./standing-orders.server");
      const next = nextRunDate(o.day_of_month, new Date(), true);
      await sql`update bank_standing_orders set status = 'active', failures = 0, next_run_date = ${next} where id = ${o.id}`;
    }
    const { audit } = await import("./banking.server");
    await audit(sql, userId, userId, `standing_order.${data.action}`, { orderId: o.id });
    return { ok: true as const };
  });
