import { createFileRoute } from "@tanstack/react-router";

const MAX = 2 * 1024 * 1024;
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

function sniff(b: Uint8Array): string | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
  return null;
}

async function ctx() {
  const { requireUserId } = await import("@/lib/session.server");
  const { db } = await import("@/lib/db.server");
  try { return { userId: await requireUserId(), sql: await db() }; } catch { return null; }
}

// Signed-in user's own profile picture: view, replace, remove.
export const Route = createFileRoute("/api/avatar")({
  server: {
    handlers: {
      GET: async () => {
        const c = await ctx();
        if (!c) return new Response("Not signed in", { status: 401 });
        const r = (await c.sql`select avatar_data, avatar_mime from bank_users where id = ${c.userId}`)[0];
        if (!r?.avatar_data) return new Response("Not found", { status: 404 });
        return new Response(new Uint8Array(r.avatar_data), {
          headers: { "Content-Type": r.avatar_mime, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
        });
      },
      POST: async ({ request }) => {
        const c = await ctx();
        if (!c) return json(401, { error: "Please sign in again." });
        if (Number(request.headers.get("content-length") ?? 0) > MAX + 64 * 1024) return json(413, { error: "Photo must be 2 MB or smaller." });
        let form: FormData;
        try { form = await request.formData(); } catch { return json(400, { error: "Upload could not be read." }); }
        const file = form.get("file");
        if (!(file instanceof File) || file.size === 0) return json(400, { error: "Choose a photo to upload." });
        if (file.size > MAX) return json(413, { error: "Photo must be 2 MB or smaller." });
        const buf = new Uint8Array(await file.arrayBuffer());
        const mime = sniff(buf);
        if (!mime) return json(415, { error: "Only JPG, PNG or WebP photos are accepted." });
        await c.sql`update bank_users set avatar_data = ${Buffer.from(buf)}, avatar_mime = ${mime}, avatar_updated_at = now() where id = ${c.userId}`;
        return json(200, { ok: true });
      },
      DELETE: async () => {
        const c = await ctx();
        if (!c) return json(401, { error: "Please sign in again." });
        await c.sql`update bank_users set avatar_data = null, avatar_mime = null, avatar_updated_at = null where id = ${c.userId}`;
        return json(200, { ok: true });
      },
    },
  },
});
