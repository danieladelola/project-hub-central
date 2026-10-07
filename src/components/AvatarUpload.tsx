import { useEffect, useRef, useState } from "react";
import { Camera, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function AvatarUpload({ name }: { name: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  async function refresh() {
    const r = await fetch("/api/avatar", { cache: "no-store" });
    if (!r.ok) return setSrc(null);
    const b = await r.blob();
    setSrc((old) => { if (old) URL.revokeObjectURL(old); return URL.createObjectURL(b); });
  }
  useEffect(() => { refresh().catch(() => {}); }, []);

  async function upload(f: File) {
    setErr(null);
    if (f.size > 2 * 1024 * 1024) return setErr("Photo must be 2 MB or smaller.");
    setBusy(true);
    try {
      const fd = new FormData(); fd.append("file", f);
      const r = await fetch("/api/avatar", { method: "POST", body: fd });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Upload failed.");
      await refresh();
      window.dispatchEvent(new Event("profile-avatar-changed"));
    } catch (e) { setErr(e instanceof Error ? e.message : "Upload failed."); }
    finally { setBusy(false); if (input.current) input.current.value = ""; }
  }

  async function remove() {
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/avatar", { method: "DELETE" });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Remove failed.");
      setSrc((old) => { if (old) URL.revokeObjectURL(old); return null; });
      window.dispatchEvent(new Event("profile-avatar-changed"));
    } catch (e) { setErr(e instanceof Error ? e.message : "Remove failed."); }
    finally { setBusy(false); }
  }

  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s.charAt(0).toUpperCase()).join("") || "?";

  return (
    <div className="flex flex-wrap items-center gap-5">
      <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border-2 border-primary/30 bg-muted text-2xl font-semibold text-muted-foreground">
        {src ? <img src={src} alt="Profile picture" className="h-full w-full object-cover" /> : initials}
      </div>
      <div className="space-y-2">
        <div className="flex gap-2">
          <Button type="button" disabled={busy} onClick={() => input.current?.click()}>
            <Camera className="mr-2 h-4 w-4" />{busy ? "Uploading…" : src ? "Change photo" : "Upload photo"}
          </Button>
          {src && <Button type="button" variant="outline" disabled={busy} onClick={remove}><Trash2 className="mr-2 h-4 w-4" />Remove</Button>}
        </div>
        <p className="text-xs text-muted-foreground">JPG, PNG or WebP, up to 2 MB.</p>
        {err && <p className="text-sm text-destructive">{err}</p>}
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }} />
      </div>
    </div>
  );
}
