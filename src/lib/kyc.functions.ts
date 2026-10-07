import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  ID_DOC_TYPES, KYC_POLICY, NO_POSTCODE_COUNTRIES, SECTIONS, type Correction, type KycData, type KycStatus,
} from "./kyc-config";

async function srv() {
  const s = await import("./session.server");
  const k = await import("./kyc.server");
  return { ...s, ...k };
}

const str = (max: number) => z.string().trim().max(max);
const date = z.string().trim().regex(/^(\d{4}-\d{2}-\d{2})?$/, "Use a valid date.");
const country = z.string().trim().regex(/^([A-Z]{2})?$/, "Choose a country.");

const personalSchema = z.object({
  firstName: str(60), middleName: str(60), lastName: str(60), dob: date, nationality: country, residence: country,
  phone: z.string().trim().regex(/^(\+?[0-9 ()-]{6,20})?$/, "Enter a valid phone number."),
  occupation: str(80), employmentStatus: str(40), sourceOfFunds: str(40), accountUse: str(60), monthlyRange: str(40),
});
const addressSchema = z.object({ line1: str(120), line2: str(120), city: str(80), region: str(80), postalCode: str(20), country });
const identitySchema = z.object({
  docType: z.enum(["", ...ID_DOC_TYPES.map((d) => d.value)] as [string, ...string[]]),
  issuingCountry: country,
  docNumber: z.string().trim().regex(/^[A-Za-z0-9 -]{0,30}$/, "Document numbers contain only letters, digits, spaces and dashes."),
  issueDate: date, expiryDate: date,
});

function docsSummary(rows: any[]) {
  return rows.map((d) => ({ id: d.id as number, slot: d.slot as string, fileName: d.file_name as string, mime: d.mime as string, size: d.size as number, createdAt: new Date(d.created_at).toISOString() }));
}

/** Full required-field check used at submission (server-side source of truth). */
function missing(data: KycData, slots: Set<string>, regionRequired: boolean): string[] {
  const m: string[] = [];
  const p = data.personal ?? {}, a = data.address ?? {}, i = data.identity ?? {};
  for (const [k, l] of [["firstName", "first name"], ["lastName", "last name"], ["dob", "date of birth"], ["nationality", "nationality"], ["residence", "country of residence"], ["phone", "phone number"], ["occupation", "occupation"], ["employmentStatus", "employment status"], ["sourceOfFunds", "source of funds"], ["accountUse", "intended account use"], ["monthlyRange", "expected monthly transactions"]] as const)
    if (!p[k]) m.push(`Personal details: ${l}`);
  if (p.dob) {
    const age = (Date.now() - new Date(p.dob).getTime()) / 3.15576e10;
    if (age < 18 || age > 120) m.push("Personal details: you must be at least 18 years old");
  }
  for (const [k, l] of [["line1", "address line 1"], ["city", "city"], ["country", "country"]] as const) if (!a[k]) m.push(`Address: ${l}`);
  if (regionRequired && !a.region) m.push("Address: state, province or region");
  if (a.country && !NO_POSTCODE_COUNTRIES.includes(a.country) && !a.postalCode) m.push("Address: postal code");
  const doc = ID_DOC_TYPES.find((d) => d.value === i.docType);
  if (!doc) m.push("Identity document: document type");
  if (!i.issuingCountry) m.push("Identity document: issuing country");
  if (!i.docNumber) m.push("Identity document: document number");
  if (!i.expiryDate) m.push("Identity document: expiry date");
  else if (new Date(i.expiryDate) <= new Date()) m.push("Identity document: the document has expired");
  if (doc?.needsIssueDate && !i.issueDate) m.push("Identity document: issue date");
  if (!slots.has("id_front")) m.push("Identity document: front image");
  if (doc?.needsBack && !slots.has("id_back")) m.push("Identity document: back image");
  if (KYC_POLICY.requireProofOfAddress && !slots.has("proof_of_address")) m.push("Supporting documents: proof of address");
  return m;
}

export const getMyKyc = createServerFn({ method: "GET" }).handler(async () => {
  const { requireUserId, db, currentApp } = await srv();
  const userId = await requireUserId();
  const sql = await db();
  const u = (await sql`select full_name, email, email_verified, phone, country, address, date_of_birth, kyc_status from bank_users where id = ${userId}`)[0];
  const app = await currentApp(sql, userId);
  const docs = app ? await sql`select id, slot, file_name, mime, size, created_at from bank_kyc_documents where application_id = ${app.id} order by created_at` : [];
  const history = app ? await sql`select status, note, created_at from bank_kyc_history where application_id = ${app.id} order by created_at desc` : [];
  const past = await sql`select reference, status, submitted_at, decided_at from bank_kyc_applications where user_id = ${userId} ${app ? sql`and id <> ${app.id}` : sql``} order by created_at desc limit 10`;
  const [first = "", ...rest] = String(u.full_name ?? "").split(" ");
  let status: KycStatus = app ? (app.status as KycStatus) : u.kyc_status === "verified" ? "verified" : "not_started";
  return {
    status,
    reference: (app?.reference ?? null) as string | null,
    submittedAt: app?.submitted_at ? new Date(app.submitted_at).toISOString() : null,
    feedback: (app?.user_feedback ?? null) as string | null,
    corrections: (app?.corrections ?? []) as Correction[],
    declaration: !!app?.declaration,
    data: (app?.data ?? {}) as KycData,
    prefill: { firstName: first, lastName: rest.join(" "), dob: u.date_of_birth ?? "", phone: u.phone ?? "", residence: /^[A-Z]{2}$/.test(u.country ?? "") ? u.country : "", line1: u.address ?? "" },
    email: u.email as string,
    emailVerified: !!u.email_verified,
    phoneVerified: false,
    docs: docsSummary(docs),
    history: history.map((h: any) => ({ status: h.status as string, note: (h.note ?? null) as string | null, at: new Date(h.created_at).toISOString() })),
    past: past.map((p: any) => ({ reference: p.reference as string, status: p.status as string, submittedAt: p.submitted_at ? new Date(p.submitted_at).toISOString() : null })),
  };
});

export const saveKycSection = createServerFn({ method: "POST" })
  .inputValidator((d) => z.discriminatedUnion("section", [
    z.object({ section: z.literal("personal"), values: personalSchema }),
    z.object({ section: z.literal("address"), values: addressSchema }),
    z.object({ section: z.literal("identity"), values: identitySchema }),
  ]).parse(d))
  .handler(async ({ data }) => {
    const { requireUserId, db, editableApp, assertSectionEditable } = await srv();
    const userId = await requireUserId();
    const sql = await db();
    try {
      const app = await editableApp(sql, userId);
      assertSectionEditable(app, data.section);
      if (data.section === "identity" && data.values.docType) {
        const doc = ID_DOC_TYPES.find((d) => d.value === data.values.docType);
        if (!doc?.needsBack) await sql`delete from bank_kyc_documents where application_id = ${app.id} and slot = 'id_back'`;
      }
      await sql`update bank_kyc_applications set data = jsonb_set(data, ${sql.array([data.section])}, ${sql.json(data.values)}, true), updated_at = now() where id = ${app.id}`;
      return { ok: true as const };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : "Could not save." };
    }
  });

export const deleteKycDocument = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ id: z.number().int().positive() }).parse(d))
  .handler(async ({ data }) => {
    const { requireUserId, db, editableApp, assertSlotEditable, audit } = await srv();
    const userId = await requireUserId();
    const sql = await db();
    try {
      const app = await editableApp(sql, userId);
      const doc = (await sql`select id, slot from bank_kyc_documents where id = ${data.id} and user_id = ${userId} and application_id = ${app.id}`)[0];
      if (!doc) return { ok: false as const, error: "Document not found." };
      assertSlotEditable(app, doc.slot);
      await sql`delete from bank_kyc_documents where id = ${doc.id}`;
      await audit(sql, userId, userId, "kyc.document_removed", { applicationId: app.id, slot: doc.slot });
      return { ok: true as const };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : "Could not remove." };
    }
  });

export const submitKycApplication = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ declaration: z.literal(true, { message: "Please confirm the declaration." }), regionRequired: z.boolean() }).parse(d))
  .handler(async ({ data }) => {
    const { requireUserId, db, setStatus, rateCount, audit, notify } = await srv();
    const userId = await requireUserId();
    const sql = await db();
    if ((await rateCount(sql, userId, "kyc.submitted", "1 day")) >= KYC_POLICY.maxSubmissionsPerDay)
      return { ok: false as const, error: "Too many submissions today. Please try again tomorrow." };
    return sql.begin(async (tx: any) => {
      const app = (await tx`select * from bank_kyc_applications where user_id = ${userId} order by created_at desc limit 1 for update`)[0];
      if (!app || !["in_progress", "action_required"].includes(app.status))
        return { ok: false as const, error: "This application has already been submitted." };
      const slots = new Set<string>((await tx`select slot from bank_kyc_documents where application_id = ${app.id}`).map((r: any) => r.slot));
      const m = missing(app.data as KycData, slots, data.regionRequired);
      if (m.length) return { ok: false as const, error: "Some information is still missing.", missing: m };
      const resub = app.status === "action_required";
      await tx`update bank_kyc_applications set declaration = true, submitted_at = now(), corrections = '[]'::jsonb where id = ${app.id}`;
      await setStatus(tx, app, "submitted", userId, resub ? "Corrections resubmitted" : "Application submitted");
      await audit(tx, userId, userId, "kyc.submitted", { applicationId: app.id, resubmission: resub });
      await notify(tx, userId, "kyc", "Verification submitted", `We received your identity verification (${app.reference}). We'll let you know when it's been reviewed.`);
      return { ok: true as const, reference: app.reference as string };
    }).then(async (r: any) => {
      if (r?.ok) await (await import("./mail.server")).sendAdminAlert("KYC submitted for review", `A customer submitted identity verification ${r.reference}. Open the admin console, KYC tab, to review and approve it.`);
      return r;
    });
  });

// ---------------- Admin review ----------------

export const adminKycQueue = createServerFn({ method: "GET" }).handler(async () => {
  const { requireAdminId, db } = await srv();
  await requireAdminId();
  const sql = await db();
  const rows = await sql`select a.id, a.reference, a.status, a.submitted_at, a.updated_at, u.id as user_id, u.full_name, u.email
    from bank_kyc_applications a join bank_users u on u.id = a.user_id
    order by (a.status in ('submitted','under_review')) desc, a.submitted_at desc nulls last, a.updated_at desc limit 200`;
  return rows.map((r: any) => ({ id: r.id as number, reference: r.reference as string, status: r.status as KycStatus, userId: r.user_id as number, name: r.full_name as string, email: r.email as string, submittedAt: r.submitted_at ? new Date(r.submitted_at).toISOString() : null }));
});

export const adminKycDetail = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ id: z.number().int().positive() }).parse(d))
  .handler(async ({ data }) => {
    const { requireAdminId, db, audit } = await srv();
    const adminId = await requireAdminId();
    const sql = await db();
    const a = (await sql`select a.*, u.full_name, u.email, u.email_verified from bank_kyc_applications a join bank_users u on u.id = a.user_id where a.id = ${data.id}`)[0];
    if (!a) throw new Error("Application not found");
    const docs = await sql`select id, slot, file_name, mime, size, created_at from bank_kyc_documents where application_id = ${a.id} order by created_at`;
    const history = await sql`select h.status, h.note, h.created_at, u.full_name as actor from bank_kyc_history h left join bank_users u on u.id = h.actor_id where h.application_id = ${a.id} order by h.created_at desc`;
    await audit(sql, a.user_id, adminId, "kyc.review_opened", { applicationId: a.id });
    return {
      id: a.id as number, reference: a.reference as string, status: a.status as KycStatus, name: a.full_name as string, email: a.email as string, emailVerified: !!a.email_verified,
      data: a.data as KycData, feedback: (a.user_feedback ?? "") as string, internalNote: (a.internal_note ?? "") as string, corrections: a.corrections as Correction[],
      submittedAt: a.submitted_at ? new Date(a.submitted_at).toISOString() : null, docsPurged: !!a.docs_purged_at,
      docs: docsSummary(docs),
      history: history.map((h: any) => ({ status: h.status as string, note: (h.note ?? null) as string | null, actor: (h.actor ?? null) as string | null, at: new Date(h.created_at).toISOString() })),
    };
  });

export const adminKycDecide = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({
    id: z.number().int().positive(),
    decision: z.enum(["under_review", "verified", "rejected", "action_required"]),
    feedback: z.string().trim().max(1000).default(""),
    internalNote: z.string().trim().max(2000).default(""),
    corrections: z.array(z.object({ section: z.enum(SECTIONS), message: z.string().trim().min(3).max(500) })).max(4).default([]),
  }).parse(d))
  .handler(async ({ data }) => {
    const { requireAdminId, db, setStatus, audit, notify } = await srv();
    const adminId = await requireAdminId();
    const sql = await db();
    if (data.decision === "action_required" && data.corrections.length === 0) return { ok: false as const, error: "Add at least one correction request." };
    if (data.decision === "rejected" && !data.feedback) return { ok: false as const, error: "Give the customer a reason for the rejection." };
    return sql.begin(async (tx: any) => {
      const a = (await tx`select * from bank_kyc_applications where id = ${data.id} for update`)[0];
      if (!a) return { ok: false as const, error: "Application not found." };
      const allowed: Record<string, string[]> = { submitted: ["under_review", "verified", "rejected", "action_required"], under_review: ["verified", "rejected", "action_required"], in_progress: ["verified", "rejected"], action_required: ["verified", "rejected"], rejected: ["verified"] };
      if (!allowed[a.status]?.includes(data.decision)) return { ok: false as const, error: `Can't change an application that is ${a.status.replace("_", " ")}.` };
      if (a.user_id === adminId) return { ok: false as const, error: "You can't review your own application." };
      await tx`update bank_kyc_applications set user_feedback = ${data.feedback || null}, internal_note = ${data.internalNote || null},
        corrections = ${tx.json(data.decision === "action_required" ? data.corrections : [])}, reviewer_id = ${adminId},
        decided_at = ${data.decision === "under_review" ? null : new Date()} where id = ${a.id}`;
      await setStatus(tx, a, data.decision, adminId, data.decision === "under_review" ? "Review started" : data.feedback || (data.corrections.length ? `Corrections requested: ${data.corrections.map((c) => c.section).join(", ")}` : null));
      await audit(tx, a.user_id, adminId, `kyc.${data.decision}`, { applicationId: a.id, corrections: data.corrections.map((c) => c.section) });
      const msg: Record<string, [string, string]> = {
        under_review: ["Verification under review", "Our team has started reviewing your identity verification."],
        verified: ["Identity verified", "Your identity verification has been approved."],
        rejected: ["Verification not approved", data.feedback || "Your identity verification was not approved."],
        action_required: ["Action required on your verification", "We need some corrections to your identity verification. Open the Verify identity page for details."],
      };
      await notify(tx, a.user_id, "kyc", ...msg[data.decision]!);
      return { ok: true as const };
    });
  });

/** Deletes stored document files for decided applications older than KYC_RETENTION_DAYS (default 365). */
export const adminPurgeKycDocuments = createServerFn({ method: "POST" }).handler(async () => {
  const { requireAdminId, db, audit } = await srv();
  const adminId = await requireAdminId();
  const sql = await db();
  const days = Math.max(30, Number(process.env["KYC_RETENTION_DAYS"] ?? 365) || 365);
  const apps = await sql`select id, user_id from bank_kyc_applications where status in ('verified','rejected') and decided_at < now() - ${`${days} days`}::interval and docs_purged_at is null`;
  let files = 0;
  for (const a of apps) {
    const r = await sql`delete from bank_kyc_documents where application_id = ${a.id}`;
    files += r.count;
    await sql`update bank_kyc_applications set docs_purged_at = now() where id = ${a.id}`;
    await audit(sql, a.user_id, adminId, "kyc.documents_purged", { applicationId: a.id, files: r.count });
  }
  return { applications: apps.length, files, days };
});

/** Light check used by pages that require approved identity verification. */
export const getKycAccess = createServerFn({ method: "GET" }).handler(async () => {
  const s = await import("./session.server");
  const { db } = await import("./db.server");
  const userId = await s.requireUserId();
  const sql = await db();
  const app = (await sql`select status from bank_kyc_applications where user_id = ${userId} order by created_at desc limit 1`)[0];
  const verified = await s.isKycVerified(sql, userId);
  return { verified, status: (app?.status ?? "not_started") as string };
});
