import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "./db.server";

const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters.")
  .max(200)
  .regex(/[A-Z]/, "Password must include an uppercase letter.")
  .regex(/[0-9]/, "Password must include a number.")
  .regex(/[^A-Za-z0-9]/, "Password must include a special character.");

async function uid() {
  const { requireUserId } = await import("./session.server");
  return requireUserId();
}

export const getProfile = createServerFn({ method: "GET" }).handler(async () => {
  const id = await uid();
  const sql = await db();
  const rows = await sql`select id, full_name, email, phone, country, state, address, date_of_birth,
      account_type, email_verified, two_factor_enabled, kyc_status, kyc_note, status, created_at
    from bank_users where id = ${id}`;
  const u = rows[0];
  return {
    id: u.id as number,
    fullName: u.full_name as string,
    email: u.email as string,
    phone: (u.phone ?? "") as string,
    country: (u.country ?? "") as string,
    state: (u.state ?? "") as string,
    address: (u.address ?? "") as string,
    dateOfBirth: (u.date_of_birth ?? "") as string,
    accountType: (u.account_type ?? "") as string,
    emailVerified: u.email_verified as boolean,
    twoFactor: u.two_factor_enabled as boolean,
    kycStatus: u.kyc_status as string,
    kycNote: (u.kyc_note ?? "") as string,
    status: u.status as string,
    createdAt: new Date(u.created_at).toISOString(),
  };
});

export const updateProfile = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({
      fullName: z.string().trim().min(2, "Enter your full name.").max(100),
      phone: z.string().trim().regex(/^\+?[0-9 ()-]{6,20}$/, "Enter a valid phone number."),
      country: z.string().trim().min(2, "Enter your country.").max(100),
      state: z.string().trim().max(100),
      address: z.string().trim().max(300),
      dateOfBirth: z.string().trim().max(20),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const id = await uid();
    const sql = await db();
    await sql`update bank_users set full_name = ${data.fullName}, phone = ${data.phone}, country = ${data.country},
      state = ${data.state}, address = ${data.address}, date_of_birth = ${data.dateOfBirth} where id = ${id}`;
    return { ok: true };
  });

async function checkPassword(id: number, password: string) {
  const sql = await db();
  const rows = await sql`select password_hash from bank_users where id = ${id}`;
  return rows[0] && (await bcrypt.compare(password, rows[0].password_hash));
}

export const changePassword = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ current: z.string().min(1).max(200), next: passwordSchema }).parse(d))
  .handler(async ({ data }) => {
    const id = await uid();
    if (!(await checkPassword(id, data.current))) return { ok: false as const, error: "Current password is incorrect." };
    const sql = await db();
    await sql`update bank_users set password_hash = ${await bcrypt.hash(data.next, 10)} where id = ${id}`;
    return { ok: true as const };
  });

export const changePin = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ password: z.string().min(1).max(200), pin: z.string().regex(/^\d{4}$/, "PIN must be 4 digits.") }).parse(d))
  .handler(async ({ data }) => {
    const id = await uid();
    if (!(await checkPassword(id, data.password))) return { ok: false as const, error: "Password is incorrect." };
    const sql = await db();
    await sql`update bank_users set pin_hash = ${await bcrypt.hash(data.pin, 10)} where id = ${id}`;
    return { ok: true as const };
  });

export const setTwoFactor = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ enabled: z.boolean(), password: z.string().min(1).max(200) }).parse(d))
  .handler(async ({ data }) => {
    const id = await uid();
    if (!(await checkPassword(id, data.password))) return { ok: false as const, error: "Password is incorrect." };
    const sql = await db();
    await sql`update bank_users set two_factor_enabled = ${data.enabled} where id = ${id}`;
    return { ok: true as const };
  });

async function adminId() {
  const { requireAdminId } = await import("./session.server");
  return requireAdminId();
}

export const adminListCustomers = createServerFn({ method: "GET" }).handler(async () => {
  await adminId();
  const sql = await db();
  const rows = await sql`select u.id, u.full_name, u.email, u.email_verified, u.kyc_status, u.status, u.created_at,
      (select count(*) from bank_kyc_documents d where d.user_id = u.id)::int as docs
    from bank_users u where not exists (select 1 from bank_user_roles r where r.user_id = u.id and r.role = 'admin')
    order by (u.kyc_status = 'pending') desc, u.created_at desc limit 200`;
  return rows.map((r: any) => ({
    id: r.id as number, fullName: r.full_name as string, email: r.email as string, emailVerified: r.email_verified as boolean,
    kycStatus: r.kyc_status as string, status: r.status as string, docs: r.docs as number, createdAt: new Date(r.created_at).toISOString(),
  }));
});

export const adminSetStatus = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ userId: z.number().int(), status: z.enum(["active", "suspended"]) }).parse(d))
  .handler(async ({ data }) => {
    await adminId();
    const sql = await db();
    await sql`update bank_users set status = ${data.status} where id = ${data.userId}`;
    if (data.status === "suspended") await sql`delete from bank_sessions where user_id = ${data.userId}`;
    return { ok: true };
  });
