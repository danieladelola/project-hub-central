import { createFileRoute } from "@tanstack/react-router";

// Session-gated document access: owner or admin only, never cached.
export const Route = createFileRoute("/api/kyc/file/$id")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { requireUserId } = await import("@/lib/session.server");
        const { db, audit } = await import("@/lib/kyc.server");
        let userId: number;
        try { userId = await requireUserId(); } catch { return new Response("Not signed in", { status: 401 }); }
        const id = Number(params.id);
        if (!Number.isInteger(id) || id <= 0) return new Response("Not found", { status: 404 });
        const sql = await db();
        const doc = (await sql`select id, user_id, application_id, slot, mime, data from bank_kyc_documents where id = ${id}`)[0];
        if (!doc) return new Response("Not found", { status: 404 });
        if (doc.user_id !== userId) {
          const admin = await sql`select 1 from bank_user_roles where user_id = ${userId} and role = 'admin'`;
          if (!admin[0]) return new Response("Not found", { status: 404 });
          await audit(sql, doc.user_id, userId, "kyc.document_viewed", { applicationId: doc.application_id, slot: doc.slot });
        }
        return new Response(new Uint8Array(doc.data), {
          headers: {
            "Content-Type": doc.mime,
            "Content-Disposition": "inline",
            "Cache-Control": "private, no-store, max-age=0",
            "X-Content-Type-Options": "nosniff",
            "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
            "Referrer-Policy": "no-referrer",
          },
        });
      },
    },
  },
});
