import { createFileRoute } from "@tanstack/react-router";
import { KYC_POLICY, SLOTS, type Slot } from "@/lib/kyc-config";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

export const Route = createFileRoute("/api/kyc/upload")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { requireUserId } = await import("@/lib/session.server");
        const k = await import("@/lib/kyc.server");
        let userId: number;
        try { userId = await requireUserId(); } catch { return json(401, { error: "Please sign in again." }); }
        const len = Number(request.headers.get("content-length") ?? 0);
        if (len > KYC_POLICY.maxFileBytes + 64 * 1024) return json(413, { error: "File must be 5 MB or smaller." });
        let form: FormData;
        try { form = await request.formData(); } catch { return json(400, { error: "Upload could not be read." }); }
        const slot = String(form.get("slot") ?? "") as Slot;
        const file = form.get("file");
        if (!SLOTS.includes(slot)) return json(400, { error: "Unknown document slot." });
        if (slot === "selfie" && !KYC_POLICY.selfieEnabled) return json(400, { error: "Selfies are not accepted." });
        if (!(file instanceof File) || file.size === 0) return json(400, { error: "Choose a file to upload." });
        if (file.size > KYC_POLICY.maxFileBytes) return json(413, { error: "File must be 5 MB or smaller." });
        const buf = new Uint8Array(await file.arrayBuffer());
        const mime = k.sniffMime(buf);
        if (!mime) return json(415, { error: "Only JPG, PNG or PDF files are accepted." });
        if (slot === "selfie" && mime === "application/pdf") return json(415, { error: "A selfie must be a JPG or PNG photo." });
        const sql = await k.db();
        if ((await k.rateCount(sql, userId, "kyc.document_uploaded", "1 hour")) >= KYC_POLICY.maxUploadsPerHour)
          return json(429, { error: "Too many uploads. Please wait a while and try again." });
        try {
          const app = await k.editableApp(sql, userId);
          k.assertSlotEditable(app, slot);
          const name = file.name.replace(/[^\w.\- ]+/g, "_").slice(0, 120) || "document";
          const hash = await k.sha256Hex(buf);
          const row = await sql.begin(async (tx: any) => {
            await tx`delete from bank_kyc_documents where application_id = ${app.id} and slot = ${slot}`;
            const r = await tx`insert into bank_kyc_documents (user_id, application_id, slot, doc_type, file_name, mime, size, data, sha256)
              values (${userId}, ${app.id}, ${slot}, ${slot}, ${name}, ${mime}, ${buf.byteLength}, ${Buffer.from(buf)}, ${hash})
              returning id, slot, file_name, mime, size, created_at`;
            await k.audit(tx, userId, userId, "kyc.document_uploaded", { applicationId: app.id, slot, size: buf.byteLength, mime });
            return r[0];
          });
          return json(200, { id: row.id, slot: row.slot, fileName: row.file_name, mime: row.mime, size: row.size, createdAt: new Date(row.created_at).toISOString() });
        } catch (e) {
          return json(409, { error: e instanceof Error ? e.message : "Upload failed." });
        }
      },
    },
  },
});
