import { useState, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useLang } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { VERSIONS, CURRENT_VERSION } from "@/lib/versions";
import { Loader2, Upload, X, RefreshCw, ShieldQuestion, KeyRound, Mail, ChevronDown, Link2, CheckCircle2 } from "lucide-react";
import type { SafeUser } from "@shared/schema";
import { useUnsavedGuard } from "@/components/unsaved-guard";
import { thankYou } from "@/components/thank-you";

// v6.09 — plain multi-color Google "G" mark (no external icon dependency)
function GoogleMark({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.9-2.26 5.36-4.78 7.02l7.73 6c4.51-4.18 7.09-10.36 7.09-17.49z"/>
      <path fill="#FBBC05" d="M10.53 28.59A14.5 14.5 0 0 1 9.5 24c0-1.59.27-3.13.76-4.59l-7.98-6.19A24 24 0 0 0 0 24c0 3.87.92 7.53 2.56 10.78z"/>
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.9-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.17 2.3-6.26 0-11.57-4.22-13.47-9.9l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
    </svg>
  );
}

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
  const [email, setEmail] = useState(user?.email ?? "");
  const [title, setTitle] = useState(user?.title ?? "");
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl ?? "");
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  // v5.12 — security section
  const [pwOpen, setPwOpen] = useState(false);
  const [curPw, setCurPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confPw, setConfPw] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [linkBusy, setLinkBusy] = useState(false);
  const [mailOff, setMailOff] = useState(false);

  // v6.01 — unsaved-changes guard on the profile fields
  const dirty =
    !!user &&
    (name !== (user.name ?? "") ||
      email !== (user.email ?? "") ||
      title !== (user.title ?? "") ||
      avatarUrl !== (user.avatarUrl ?? ""));
  const discardAndClose = () => {
    if (user) {
      setName(user.name ?? "");
      setEmail(user.email ?? "");
      setTitle(user.title ?? "");
      setAvatarUrl(user.avatarUrl ?? "");
    }
    onClose();
  };
  const { requestClose, guard } = useUnsavedGuard({ dirty, onDiscard: discardAndClose, onSave: () => { void save(); } });

  // v6.09 — surface the result of a "Connect Google" round trip once, then
  // clean the URL so a page refresh doesn't repeat the toast.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get("googleLink");
    if (!result) return;
    if (result === "ok") toast({ title: t("googleLinkOk") });
    else if (result === "conflict") toast({ title: t("googleLinkConflict"), variant: "destructive" });
    else toast({ title: t("googleLinkError"), variant: "destructive" });
    params.delete("googleLink");
    const rest = params.toString();
    window.history.replaceState({}, "", window.location.pathname + (rest ? `?${rest}` : "") + window.location.hash);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connectGoogle = () => {
    window.location.assign("/api/auth/google/start?link=1");
  };

  if (!user) return null;

  const changePassword = async () => {
    setPwBusy(true);
    try {
      await apiRequest("POST", "/api/auth/password", { currentPassword: curPw, newPassword: newPw });
      toast({ title: t("pwChanged") });
      setCurPw(""); setNewPw(""); setConfPw(""); setPwOpen(false);
    } catch (err: any) {
      const msg = String(err?.message ?? "");
      if (msg.includes("wrong_current_password")) toast({ title: t("pwWrongCurrent"), variant: "destructive" });
      else if (msg.includes("same_password")) toast({ title: t("pwSame"), variant: "destructive" });
      else toast({ title: "Failed / 失败", variant: "destructive" });
    } finally {
      setPwBusy(false);
    }
  };

  const emailResetLink = async () => {
    setLinkBusy(true);
    try {
      const res = await apiRequest("POST", "/api/auth/forgot", { email: user.email });
      const data: { emailConfigured: boolean; emailSent: boolean } = await res.json();
      if (data.emailSent) toast({ title: t("pwLinkSent") });
      else setMailOff(true);
    } catch {
      toast({ title: "Failed / 失败", variant: "destructive" });
    } finally {
      setLinkBusy(false);
    }
  };

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
    // v6.01 — email is mandatory: it is the login identifier and feeds sync/auto-workflows
    const emailNorm = email.trim().toLowerCase();
    if (!emailNorm || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNorm)) {
      toast({ title: t("profileEmailInvalid"), variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await apiRequest("PATCH", "/api/me", {
        name: name.trim() || user.name,
        email: emailNorm,
        title: title.trim() || null,
        avatarUrl: avatarUrl || null,
      });
      const data: { user: SafeUser } = await res.json();
      updateUser(data.user);
      toast({ title: t("profileSaved") });
      thankYou();
      onClose();
    } catch (err: any) {
      const msg = String(err?.message ?? "");
      if (msg.includes("409")) toast({ title: t("profileEmailTaken"), variant: "destructive" });
      else toast({ title: "Save failed / 保存失败", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && requestClose()}>
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
            <label className="text-sm font-medium">{t("profileEmail")} <span className="text-destructive">*</span></label>
            <Input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@gobi.vc"
              data-testid="input-profile-email"
            />
            <p className="text-[11px] text-muted-foreground">{t("profileEmailHint")}</p>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t("profileJobTitle")}</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Investment Analyst" data-testid="input-profile-title" />
          </div>
          <div className="rounded-lg border border-border p-3 space-y-2">
            <button
              type="button"
              className="flex w-full items-center justify-between text-sm font-medium"
              onClick={() => setPwOpen((o) => !o)}
              data-testid="button-toggle-security"
            >
              <span className="flex items-center gap-1.5"><KeyRound className="h-4 w-4" /> {t("securityTitle")}</span>
              <ChevronDown className={`h-4 w-4 transition-transform ${pwOpen ? "rotate-180" : ""}`} />
            </button>
            {pwOpen && (
              <div className="space-y-2 pt-1">
                <Input type="password" autoComplete="current-password" placeholder={t("pwCurrent")} value={curPw} onChange={(e) => setCurPw(e.target.value)} data-testid="input-current-password" />
                <Input type="password" autoComplete="new-password" placeholder={t("pwNew")} value={newPw} onChange={(e) => setNewPw(e.target.value)} data-testid="input-new-password" />
                <Input type="password" autoComplete="new-password" placeholder={t("pwConfirm")} value={confPw} onChange={(e) => setConfPw(e.target.value)} data-testid="input-confirm-password" />
                {newPw.length > 0 && newPw.length < 6 && <p className="text-xs text-destructive">{t("pwTooShort")}</p>}
                {confPw.length > 0 && newPw !== confPw && <p className="text-xs text-destructive">{t("pwMismatch")}</p>}
                <Button
                  size="sm"
                  className="w-full bg-[hsl(193,52%,38%)] text-white hover:bg-[hsl(193,52%,30%)]"
                  onClick={changePassword}
                  disabled={pwBusy || !curPw || newPw.length < 6 || newPw !== confPw}
                  data-testid="button-change-password"
                >
                  {pwBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {t("pwChange")}
                </Button>
                <div className="border-t border-border pt-2 space-y-1.5">
                  <Button size="sm" variant="outline" className="w-full" onClick={emailResetLink} disabled={linkBusy} data-testid="button-email-reset-link">
                    {linkBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
                    {t("pwEmailLink")}
                  </Button>
                  {mailOff && <p className="text-xs text-muted-foreground" data-testid="text-mail-coming-soon">{t("pwMailComingSoon")}</p>}
                </div>
              </div>
            )}
          </div>
          <div className="rounded-lg border border-border p-3 space-y-2">
            <p className="flex items-center gap-1.5 text-sm font-medium"><Link2 className="h-4 w-4" /> {t("googleConnectTitle")}</p>
            {user.googleLinkedAt ? (
              <p className="flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400" data-testid="text-google-linked">
                <CheckCircle2 className="h-4 w-4" /> {t("googleConnected")}
              </p>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">{t("googleConnectHint")}</p>
                <Button type="button" variant="outline" size="sm" className="w-full" onClick={connectGoogle} data-testid="button-connect-google">
                  <GoogleMark className="mr-2 h-4 w-4" /> {t("googleConnectButton")}
                </Button>
              </>
            )}
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
        {guard}
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

// ---------------- Forced password change (v5.12 — after an admin reset) ----------------

export function ForcedPasswordDialog() {
  const { t } = useLang();
  const { updateUser } = useAuth();
  const { toast } = useToast();
  const [newPw, setNewPw] = useState("");
  const [confPw, setConfPw] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      const res = await apiRequest("POST", "/api/auth/password", { newPassword: newPw });
      const data: { user: SafeUser } = await res.json();
      updateUser(data.user); // mustChangePassword cleared — dialog unmounts
      toast({ title: t("pwChanged") });
    } catch {
      toast({ title: "Failed / 失败", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open>
      <DialogContent
        className="max-w-sm [&>button]:hidden"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        data-testid="dialog-forced-password"
      >
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <KeyRound className="h-4 w-4" /> {t("forcedPwTitle")}
          </DialogTitle>
          <DialogDescription>{t("forcedPwBody")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Input type="password" autoComplete="new-password" placeholder={t("pwNew")} value={newPw} onChange={(e) => setNewPw(e.target.value)} data-testid="input-forced-new-password" />
          <Input type="password" autoComplete="new-password" placeholder={t("pwConfirm")} value={confPw} onChange={(e) => setConfPw(e.target.value)} data-testid="input-forced-confirm-password" />
          {newPw.length > 0 && newPw.length < 6 && <p className="text-xs text-destructive">{t("pwTooShort")}</p>}
          {confPw.length > 0 && newPw !== confPw && <p className="text-xs text-destructive">{t("pwMismatch")}</p>}
          <Button
            className="w-full bg-[hsl(193,52%,38%)] text-white hover:bg-[hsl(193,52%,30%)]"
            onClick={submit}
            disabled={busy || newPw.length < 6 || newPw !== confPw}
            data-testid="button-forced-change-password"
          >
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("pwChange")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
