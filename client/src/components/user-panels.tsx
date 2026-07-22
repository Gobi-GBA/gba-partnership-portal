import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useLang } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { VERSIONS, CURRENT_VERSION } from "@/lib/versions";
import { Loader2, Upload, X, RefreshCw, ShieldQuestion } from "lucide-react";
import type { SafeUser } from "@shared/schema";

// ---------------- Version log dialog ----------------

export function VersionLogDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { lang, t } = useLang();
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto" data-testid="dialog-version-log">
        <DialogHeader>
          <DialogTitle className="font-display">{t("versionLogTitle")}</DialogTitle>
          <DialogDescription>{t("versionLogSub")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-6">
          {VERSIONS.map((v) => (
            <section key={v.version} className="relative border-l-2 border-[hsl(var(--aqua))]/40 pl-4" data-testid={`version-${v.version}`}>
              <span className="absolute -left-[5px] top-1.5 h-2 w-2 rounded-full bg-[hsl(var(--aqua))]" />
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-display text-sm font-bold">v{v.version}</span>
                {v.version === CURRENT_VERSION && (
                  <Badge className="bg-[hsl(var(--gold))] text-[hsl(214,68%,12%)] hover:bg-[hsl(var(--gold))]">{t("currentVersion")}</Badge>
                )}
                <span className="text-xs tabular-nums text-muted-foreground">{v.date}</span>
                <span className="text-xs text-muted-foreground">{t("versionBy")} {v.by}</span>
              </div>
              <p className="mt-0.5 text-sm font-semibold">{lang === "cn" ? v.titleCn : v.titleEn}</p>
              <p className="mt-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t("whatsNew")}</p>
              <ul className="mt-1 space-y-1">
                {(lang === "cn" ? v.itemsCn : v.itemsEn).map((item, i) => (
                  <li key={i} className="flex gap-2 text-sm text-muted-foreground">
                    <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-[hsl(var(--gold))]" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------- Profile dialog ----------------

export function ProfileDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useLang();
  const { user, updateUser } = useAuth();
  const { toast } = useToast();
  const [name, setName] = useState(user?.name ?? "");
  const [title, setTitle] = useState(user?.title ?? "");
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl ?? "");
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!user) return null;

  const syncFromGobi = async () => {
    setSyncing(true);
    try {
      const res = await apiRequest("POST", "/api/profile/sync-gobi", { name: name.trim() });
      const data: { user: SafeUser; matched: { name: string; title: string } } = await res.json();
      updateUser(data.user);
      setTitle(data.user.title ?? "");
      setAvatarUrl(data.user.avatarUrl ?? "");
      toast({ title: t("syncGobiDone"), description: `${data.matched.name} — ${data.matched.title}` });
    } catch (err: any) {
      const msg = String(err?.message ?? "");
      if (msg.includes("not_found_on_gobi")) toast({ title: t("syncGobiNotFound"), variant: "destructive" });
      else toast({ title: t("syncGobiFailed"), variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  };

  const requestEdit = async () => {
    setRequesting(true);
    try {
      const res = await apiRequest("POST", "/api/me/request-edit");
      const data: { user: SafeUser } = await res.json();
      updateUser(data.user);
      toast({ title: t("requestEditSent") });
    } catch {
      toast({ title: t("syncGobiFailed"), variant: "destructive" });
    } finally {
      setRequesting(false);
    }
  };

  const onFile = (f: File | undefined) => {
    if (!f) return;
    if (f.size > 400_000) {
      toast({ title: t("profilePhotoTooLarge"), variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setAvatarUrl(String(reader.result));
    reader.readAsDataURL(f);
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await apiRequest("PATCH", "/api/me", {
        name: name.trim() || user.name,
        title: title.trim() || null,
        avatarUrl: avatarUrl || null,
      });
      const data: { user: SafeUser } = await res.json();
      updateUser(data.user);
      toast({ title: t("profileSaved") });
      onClose();
    } catch {
      toast({ title: "Save failed / 保存失败", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md" data-testid="dialog-profile">
        <DialogHeader>
          <DialogTitle className="font-display">{t("profileTitle")}</DialogTitle>
          <DialogDescription>{t("profileSub")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <UserAvatar name={name || user.name} avatarUrl={avatarUrl} size="lg" />
            <div className="flex flex-col gap-1.5">
              <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} data-testid="button-upload-photo">
                <Upload className="mr-1.5 h-3.5 w-3.5" />
                {t("profilePhoto")}
              </Button>
              {avatarUrl && (
                <Button type="button" variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setAvatarUrl("")} data-testid="button-remove-photo">
                  <X className="mr-1.5 h-3.5 w-3.5" />
                  {t("profileRemovePhoto")}
                </Button>
              )}
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} data-testid="input-photo-file" />
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            className="w-full border-[hsl(var(--aqua))]/50 text-[hsl(193,52%,32%)] dark:text-[hsl(193,60%,70%)]"
            onClick={syncFromGobi}
            disabled={syncing}
            data-testid="button-sync-gobi"
          >
            {syncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            {t("syncFromGobi")}
          </Button>
          <p className="text-xs text-muted-foreground">{t("syncGobiHint")}</p>
          <p className="text-xs text-muted-foreground">{t("profilePhotoHint")}</p>
          <Input
            placeholder="https://…"
            value={avatarUrl.startsWith("data:") ? "" : avatarUrl}
            onChange={(e) => setAvatarUrl(e.target.value)}
            data-testid="input-photo-url"
          />
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t("profileName")}</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} data-testid="input-profile-name" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t("profileJobTitle")}</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Investment Analyst" data-testid="input-profile-title" />
          </div>
          {user.role === "viewer" && (
            <div className="rounded-lg border border-border p-3 space-y-2">
              <p className="text-xs text-muted-foreground">{t("requestEditHint")}</p>
              {user.editRequestedAt ? (
                <p className="text-sm text-[hsl(var(--gold))] font-medium" data-testid="text-edit-requested">{t("requestEditPending")}</p>
              ) : (
                <Button type="button" variant="outline" size="sm" className="w-full" onClick={requestEdit} disabled={requesting} data-testid="button-request-edit">
                  {requesting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldQuestion className="mr-2 h-4 w-4" />}
                  {t("requestEdit")}
                </Button>
              )}
            </div>
          )}
          <Button
            onClick={save}
            disabled={saving}
            className="w-full bg-[hsl(193,52%,38%)] text-white hover:bg-[hsl(193,52%,30%)]"
            data-testid="button-save-profile"
          >
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("profileSave")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------- User avatar (initials fallback) ----------------

export function UserAvatar({ name, avatarUrl, size = "md" }: { name: string; avatarUrl?: string | null; size?: "sm" | "md" | "lg" }) {
  const [failed, setFailed] = useState(false);
  const cls = size === "lg" ? "h-16 w-16 text-lg" : size === "sm" ? "h-6 w-6 text-[9px]" : "h-8 w-8 text-[11px]";
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  if (avatarUrl && !failed) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        onError={() => setFailed(true)}
        className={`${cls} shrink-0 rounded-full object-cover border border-border`}
        data-testid="img-user-avatar"
      />
    );
  }
  return (
    <span
      className={`${cls} shrink-0 inline-flex items-center justify-center rounded-full bg-[hsl(var(--aqua))]/15 font-bold text-[hsl(var(--aqua))] border border-[hsl(var(--aqua))]/30`}
      data-testid="avatar-user-initials"
    >
      {initials}
    </span>
  );
}
