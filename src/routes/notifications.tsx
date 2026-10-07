import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { AccountPage, errText } from "@/components/AccountPage";
import { listNotifications, markAllNotificationsRead, markNotificationRead } from "@/lib/banking.functions";
import { fmtDate } from "@/lib/money";

export const Route = createFileRoute("/notifications")({
  ssr: false,
  head: () => ({ meta: [{ title: "Notifications — Universal Crest" }, { name: "description", content: "Alerts and updates about your Universal Crest accounts." }, { property: "og:title", content: "Notifications — Universal Crest" }, { property: "og:description", content: "Alerts and updates about your accounts." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" }] }),
  component: NotificationsPage,
});

function NotificationsPage() {
  const load = useServerFn(listNotifications);
  const one = useServerFn(markNotificationRead);
  const all = useServerFn(markAllNotificationsRead);
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listNotifications>> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const refresh = useCallback(() => { setErr(null); return load().then(setRows).catch((e) => { setErr(errText(e)); setRows([]); }); }, [load]);
  useEffect(() => { refresh(); }, [refresh]);
  const unread = rows?.filter((n) => !n.read).length ?? 0;
  return (
    <AccountPage title="Notifications" subtitle={rows ? `${unread} unread` : undefined} actions={<Button variant="outline" disabled={unread === 0} onClick={async () => { await all(); refresh(); window.dispatchEvent(new Event("notifications-changed")); }}>Mark all as read</Button>}>
      {err && <p className="text-sm text-destructive">{err}</p>}
      {!rows ? <div className="h-32 animate-pulse rounded-lg bg-muted" /> : rows.length === 0 ? (!err && <p className="text-muted-foreground">No notifications yet.</p>) : (
        <ul className="divide-y rounded-lg border bg-card">
          {rows.map((n) => (
            <li key={n.id} className="flex gap-3 p-4 text-sm">
              <div className="flex-1"><p className={n.read ? "" : "font-semibold"}>{n.title}</p><p className="text-muted-foreground">{n.body}</p><p className="text-xs text-muted-foreground">{fmtDate(n.createdAt)}</p></div>
              {!n.read && <Button size="sm" variant="ghost" onClick={async () => { await one({ data: { id: n.id } }); refresh(); window.dispatchEvent(new Event("notifications-changed")); }}>Mark read</Button>}
            </li>
          ))}
        </ul>
      )}
    </AccountPage>
  );
}
