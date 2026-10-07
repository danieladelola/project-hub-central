import { db } from "./db.server";
import { audit, notify } from "./banking.server";
import { EDITABLE, KYC_POLICY, SLOT_SECTION, legacyStatus, type Correction, type KycStatus, type Section, type Slot } from "./kyc-config";

export function newReference() {
  const b = new Uint8Array(4);
  crypto.getRandomValues(b);
  return `KYC-${Date.now().toString(36).toUpperCase()}-${Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

/** Latest application for the user, or null. */
export async function currentApp(sql: any, userId: number) {
  const rows = await sql`select * from bank_kyc_applications where user_id = ${userId} order by created_at desc limit 1`;
  return rows[0] ?? null;
}

/** Returns an editable application, creating one if needed. Throws if not editable. */
export async function editableApp(sql: any, userId: number) {
  let app = await currentApp(sql, userId);
  if (!app || app.status === "rejected") {
    const legacy = (await sql`select kyc_status from bank_users where id = ${userId}`)[0]?.kyc_status;
    if (!app && legacy === "verified") throw new Error("Your identity is already verified.");
    app = (await sql`insert into bank_kyc_applications (user_id, reference) values (${userId}, ${newReference()}) returning *`)[0];
    await sql`insert into bank_kyc_history (application_id, status, actor_id, note) values (${app.id}, 'in_progress', ${userId}, 'Application started')`;
  }
  if (!EDITABLE.includes(app.status as KycStatus)) throw new Error("This application can't be changed right now.");
  return app;
}

/** During "action required", only flagged sections may be changed. */
export function assertSectionEditable(app: any, section: Section) {
  if (app.status !== "action_required") return;
  const corr = (app.corrections ?? []) as Correction[];
  if (!corr.some((c) => c.section === section)) throw new Error("Only the sections our team asked you to correct can be changed.");
}
export function assertSlotEditable(app: any, slot: Slot) {
  assertSectionEditable(app, SLOT_SECTION[slot]);
}

export async function setStatus(sql: any, app: { id: number; user_id: number }, status: KycStatus, actorId: number | null, note: string | null) {
  await sql`update bank_kyc_applications set status = ${status}, updated_at = now() where id = ${app.id}`;
  await sql`insert into bank_kyc_history (application_id, status, actor_id, note) values (${app.id}, ${status}, ${actorId}, ${note})`;
  await sql`update bank_users set kyc_status = ${legacyStatus(status)}, kyc_note = ${status === "rejected" || status === "action_required" ? note : null} where id = ${app.user_id}`;
}

export async function rateCount(sql: any, userId: number, action: string, interval: string) {
  const r = await sql`select count(*)::int as n from bank_audit_log where user_id = ${userId} and action = ${action} and created_at > now() - ${interval}::interval`;
  return r[0].n as number;
}

/** Detect the real file type from magic bytes. */
export function sniffMime(buf: Uint8Array): (typeof KYC_POLICY.acceptedMime)[number] | null {
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
  if (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) return "application/pdf";
  return null;
}

export async function sha256Hex(buf: Uint8Array) {
  const h = await crypto.subtle.digest("SHA-256", buf as Uint8Array<ArrayBuffer>);
  return Array.from(new Uint8Array(h), (x) => x.toString(16).padStart(2, "0")).join("");
}

export { db, audit, notify };
