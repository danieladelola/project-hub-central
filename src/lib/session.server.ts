import { getCookie } from "@tanstack/react-start/server";
import { db } from "./db.server";

export const SESSION_COOKIE = "uc_session";

export function randomToken(bytes = 32) {
  const b = new Uint8Array(bytes);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

export async function requireUserId(): Promise<number> {
  const token = getCookie(SESSION_COOKIE);
  if (!token) throw new Error("Not signed in");
  const sql = await db();
  const rows = await sql`select user_id from bank_sessions where token = ${token} and expires_at > now()`;
  if (!rows[0]) throw new Error("Not signed in");
  const userId = rows[0].user_id as number;
  const { getSettings } = await import("./settings.server");
  if ((await getSettings(sql)).maintenance.enabled) {
    const admin = await sql`select 1 from bank_user_roles where user_id = ${userId} and role = 'admin'`;
    if (!admin[0]) throw new Error("Online banking is temporarily unavailable for maintenance.");
  }
  return userId;
}

export async function requireAdminId(): Promise<number> {
  const id = await requireUserId();
  const sql = await db();
  const rows = await sql`select 1 from bank_user_roles where user_id = ${id} and role = 'admin'`;
  if (!rows[0]) throw new Error("Forbidden");
  return id;
}

export const KYC_REQUIRED_MESSAGE = "Identity verification required. Complete your KYC and wait for approval to use this feature.";

export async function isKycVerified(sql: any, userId: number): Promise<boolean> {
  const app = (await sql`select status from bank_kyc_applications where user_id = ${userId} order by created_at desc limit 1`)[0];
  if (app) return app.status === "verified";
  const u = (await sql`select kyc_status from bank_users where id = ${userId}`)[0];
  return u?.kyc_status === "verified";
}

/** Signed-in user whose KYC has been approved by an admin. */
export async function requireVerifiedUserId(): Promise<number> {
  const userId = await requireUserId();
  if (!(await isKycVerified(await db(), userId))) throw new Error(KYC_REQUIRED_MESSAGE);
  return userId;
}
