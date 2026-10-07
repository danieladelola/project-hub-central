import { createFileRoute } from "@tanstack/react-router";
import { ASSET_SLOTS, type AssetSlot } from "@/lib/settings-schema";

const MAX = 1024 * 1024;
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

function sniff(b: Uint8Array): string | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
  if (b[0] === 0x00 && b[1] === 0x00 && b[2] === 0x01 && b[3] === 0x00) return "image/x-icon";
  return null;
}
const validSlot = (s: string): s is AssetSlot => (ASSET_SLOTS as readonly string[]).includes(s);

async function admin() {
  const { requireAdminId } = await import("@/lib/session.server");
  const { db } = await import("@/lib/db.server");
  try { return { actor: await requireAdminId(), sql: await db() }; } catch { return null; }
}

// Brand images: public read (they appear on public pages), admin-only upload/remove.
export const Route = createFileRoute("/api/brand/$slot")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        if (!validSlot(params.slot)) return new Response("Not found", { status: 404 });
        const { db } = await import("@/lib/db.server");
        const sql = await db();
        const r = (await sql`select data, mime from bank_setting_assets where slot = ${params.slot}`)[0];
        if (!r) return new Response("Not found", { status: 404 });
        return new Response(new Uint8Array(r.data), {
          headers: { "Content-Type": r.mime, "Cache-Control": "public, max-age=300", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'" },
        });
      },
      POST: async ({ request, params }) => {
        const c = await admin();
        if (!c) return json(403, { error: "Administrator sign-in required." });
        if (!validSlot(params.slot)) return json(404, { error: "Unknown image slot." });
        if (Number(request.headers.get("content-length") ?? 0) > MAX + 64 * 1024) return json(413, { error: "Image must be 1 MB or smaller." });
        let form: FormData;
        try { form = await request.formData(); } catch { return json(400, { error: "Upload could not be read." }); }
        const file = form.get("file");
        if (!(file instanceof File) || file.size === 0) return json(400, { error: "Choose an image to upload." });
        if (file.size > MAX) return json(413, { error: "Image must be 1 MB or smaller." });
        const buf = new Uint8Array(await file.arrayBuffer());
        const mime = sniff(buf);
        if (!mime) return json(415, { error: "Only PNG, JPG, WebP or ICO images are accepted." });
        await c.sql`insert into bank_setting_assets (slot, data, mime, updated_by, updated_at) values (${params.slot}, ${Buffer.from(buf)}, ${mime}, ${c.actor}, now())
          on conflict (slot) do update set data = excluded.data, mime = excluded.mime, updated_by = excluded.updated_by, updated_at = now()`;
        await c.sql`insert into bank_audit_log (user_id, actor_id, action, detail) values (null, ${c.actor}, 'settings.asset_upload', ${c.sql.json({ slot: params.slot })})`;
        (await import("@/lib/settings.server")).clearSettingsCache();
        return json(200, { ok: true });
      },
      DELETE: async ({ params }) => {
        const c = await admin();
        if (!c) return json(403, { error: "Administrator sign-in required." });
        if (!validSlot(params.slot)) return json(404, { error: "Unknown image slot." });
        await c.sql`delete from bank_setting_assets where slot = ${params.slot}`;
        await c.sql`insert into bank_audit_log (user_id, actor_id, action, detail) values (null, ${c.actor}, 'settings.asset_remove', ${c.sql.json({ slot: params.slot })})`;
        (await import("@/lib/settings.server")).clearSettingsCache();
        return json(200, { ok: true });
      },
    },
  },
});
