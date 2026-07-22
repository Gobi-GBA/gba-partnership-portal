import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useLang } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { Layout, PartnerLogo, PicAvatars } from "@/components/shared";
import { EditPartnershipDialog } from "@/components/edit-partnership";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Check, X, Star, Trash2, ShieldAlert, Pencil, CalendarDays, Search, UserPlus, Save, Landmark, RefreshCw, Loader2, Info, Plus, Tags, Settings2, ArrowUp, ArrowDown } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { UserAvatar } from "@/components/user-panels";
import type { Partnership, SafeUser, Stage, ChangeRequest, Feedback, FeedbackStatus, SectorTag } from "@shared/schema";
import { ROLES, FEEDBACK_STATUSES } from "@shared/schema";
import { STAGES, CATEGORIES, REGIONS, STAGE_NUM, picsOf } from "@/lib/constants";
import { FeedbackStatusBadge } from "@/pages/updates";

export default function Admin() {
  const { t } = useLang();
  const { user } = useAuth();

  if (!user || user.role !== "admin") {
    return (
      <Layout>
        <div className="mx-auto max-w-md px-4 py-24 text-center">
          <ShieldAlert className="h-10 w-10 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground" data-testid="text-admin-required">
            {t("navAdmin")} — {t("loginRequired")}
          </p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="mx-auto max-w-5xl px-4 py-10">
        <h1 className="text-xl md:text-2xl font-extrabold tracking-tight mb-6">{t("adminTitle")}</h1>
        <Tabs defaultValue="partnerships">
          <TabsList className="mb-6">
            <TabsTrigger value="partnerships" data-testid="tab-admin-partnerships">{t("adminPartnerships")}</TabsTrigger>
            <TabsTrigger value="changes" data-testid="tab-admin-changes">{t("changeRequests")}</TabsTrigger>
            <TabsTrigger value="users" data-testid="tab-admin-users">{t("adminUsers")}</TabsTrigger>
            <TabsTrigger value="feedback" data-testid="tab-admin-feedback">{t("adminFeedback")}</TabsTrigger>
            <TabsTrigger value="tags" data-testid="tab-admin-tags">{t("tabTags")}</TabsTrigger>
            <TabsTrigger value="settings" data-testid="tab-admin-settings">{t("tabSettings")}</TabsTrigger>
          </TabsList>
          <TabsContent value="partnerships"><PartnershipAdmin /></TabsContent>
          <TabsContent value="changes"><ChangeRequestAdmin /></TabsContent>
          <TabsContent value="users"><UserAdmin /></TabsContent>
          <TabsContent value="feedback"><FeedbackAdmin /></TabsContent>
          <TabsContent value="tags"><TagAdmin /></TabsContent>
          <TabsContent value="settings"><SettingsAdmin /></TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}

// ---------------- Feedback / system requests ----------------
function FeedbackCard({ fb }: { fb: Feedback }) {
  const { t, lang } = useLang();
  const { toast } = useToast();
  const [note, setNote] = useState(fb.adminNote ?? "");

  const mutation = useMutation({
    mutationFn: async (data: { status?: FeedbackStatus; adminNote?: string | null }) => {
      const res = await apiRequest("PATCH", `/api/feedback/${fb.id}`, data);
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/feedback"] }),
    onError: (e: any) => toast({ title: String(e?.message ?? "Update failed"), variant: "destructive" }),
  });

  return (
    <div className="rounded-lg border border-card-border bg-card p-4 space-y-3" data-testid={`card-admin-feedback-${fb.id}`}>
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm">{fb.userName}</p>
          <p className="text-xs text-muted-foreground tabular-nums">
            {new Date(fb.createdAt).toLocaleDateString(lang === "cn" ? "zh-CN" : "en-GB", { year: "numeric", month: "short", day: "numeric" })}
          </p>
        </div>
        <FeedbackStatusBadge status={fb.status as FeedbackStatus} />
        <Select value={fb.status} onValueChange={(v) => mutation.mutate({ status: v as FeedbackStatus })}>
          <SelectTrigger className="w-36 h-8 text-xs" data-testid={`select-fb-status-${fb.id}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FEEDBACK_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{t(`fbStatus_${s}` as any)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <p className="text-sm whitespace-pre-wrap" data-testid={`text-admin-feedback-${fb.id}`}>{fb.message}</p>
      <div className="flex items-start gap-2">
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t("fbNotePlaceholder")}
          rows={2}
          maxLength={2000}
          className="text-sm"
          data-testid={`input-fb-note-${fb.id}`}
        />
        <Button
          size="icon"
          variant="outline"
          title={t("save")}
          disabled={mutation.isPending || note === (fb.adminNote ?? "")}
          onClick={() => mutation.mutate({ adminNote: note.trim() ? note.trim() : null })}
          data-testid={`button-save-fb-note-${fb.id}`}
        >
          <Save className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function FeedbackAdmin() {
  const { t } = useLang();
  const { data: list, isLoading } = useQuery<Feedback[]>({ queryKey: ["/api/feedback"] });

  if (isLoading) return <p className="text-muted-foreground py-8">…</p>;
  const items = list ?? [];
  const open = items.filter((f) => f.status === "open" || f.status === "in_progress");
  const closed = items.filter((f) => f.status === "solved" || f.status === "declined");

  return (
    <div className="space-y-6">
      {open.length > 0 ? (
        <div>
          <h3 className="text-sm font-bold mb-3">{t("fbStatus_open")} ({open.length})</h3>
          <div className="space-y-3">{open.map((f) => <FeedbackCard key={f.id} fb={f} />)}</div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground" data-testid="text-no-feedback">{t("noRequests")}</p>
      )}
      {closed.length > 0 && <div className="space-y-3">{closed.map((f) => <FeedbackCard key={f.id} fb={f} />)}</div>}
    </div>
  );
}

// ---------------- Users ----------------
function AddAccountDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useLang();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("viewer");

  const create = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/users", { name: name.trim(), email: email.trim(), password, role });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: t("accountCreated") });
      setName(""); setEmail(""); setPassword(""); setRole("viewer");
      onClose();
    },
    onError: (e: any) => {
      const msg = String(e?.message ?? "");
      toast({ title: msg.includes("email_taken") ? t("emailTaken") : msg || "Failed", variant: "destructive" });
    },
  });

  const valid = name.trim().length > 0 && /.+@.+\..+/.test(email.trim()) && password.length >= 8;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("addAccount")}</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground -mt-2">{t("addAccountSub")}</p>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="acct-name">{t("name")}</Label>
            <Input id="acct-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} data-testid="input-account-name" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="acct-email">{t("email")}</Label>
            <Input id="acct-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} data-testid="input-account-email" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="acct-password">{t("password")}</Label>
            <Input id="acct-password" type="text" value={password} onChange={(e) => setPassword(e.target.value)} maxLength={100} data-testid="input-account-password" />
          </div>
          <div className="space-y-1.5">
            <Label>{t("roleLabel")}</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger data-testid="select-account-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r} value={r}>{t(`role_${r}` as any)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={onClose} data-testid="button-cancel-account">{t("cancel")}</Button>
            <Button
              disabled={!valid || create.isPending}
              onClick={() => create.mutate()}
              className="bg-[hsl(193,52%,38%)] hover:bg-[hsl(193,52%,30%)] text-white"
              data-testid="button-create-account"
            >
              <UserPlus className="h-4 w-4 mr-2" />
              {t("addAccount")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EditAccountDialog({ u, onClose }: { u: SafeUser | null; onClose: () => void }) {
  const { t } = useLang();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");

  useEffect(() => {
    if (u) {
      setName(u.name);
      setTitle(u.title ?? "");
      setAvatarUrl(u.avatarUrl ?? "");
    }
  }, [u]);

  const save = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/admin/users/${u!.id}`, {
        name: name.trim(),
        title: title.trim() || null,
        avatarUrl: avatarUrl.trim() || null,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: t("accountUpdated") });
      onClose();
    },
    onError: (e: any) => toast({ title: String(e?.message ?? "Failed"), variant: "destructive" }),
  });

  const sync = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/users/${u!.id}/sync-gobi`, { name: name.trim() });
      return res.json();
    },
    onSuccess: (data: any) => {
      if (data?.user) {
        setName(data.user.name);
        setTitle(data.user.title ?? "");
        setAvatarUrl(data.user.avatarUrl ?? "");
      }
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: t("syncGobiDone"), description: data?.matched ? `${data.matched.name} — ${data.matched.title}` : undefined });
    },
    onError: (e: any) => {
      const msg = String(e?.message ?? "");
      toast({ title: msg.includes("not_found_on_gobi") ? t("syncGobiNotFound") : t("syncGobiFailed"), variant: "destructive" });
    },
  });

  return (
    <Dialog open={!!u} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("editAccount")}</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground -mt-2">{t("editAccountSub")}</p>
        {u && (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <UserAvatar name={name || u.name} avatarUrl={avatarUrl || null} size="lg" />
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">{u.email}</p>
                <p className="text-xs text-muted-foreground">{t(`role_${u.role}` as any)}</p>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              className="w-full border-[hsl(var(--aqua))]/50 text-[hsl(193,52%,32%)] dark:text-[hsl(193,60%,70%)]"
              onClick={() => sync.mutate()}
              disabled={sync.isPending}
              data-testid="button-admin-sync-gobi"
            >
              {sync.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              {t("syncFromGobi")}
            </Button>
            <div className="space-y-1.5">
              <Label htmlFor="edit-acct-name">{t("profileName")}</Label>
              <Input id="edit-acct-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} data-testid="input-edit-account-name" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-acct-title">{t("profileJobTitle")}</Label>
              <Input id="edit-acct-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} data-testid="input-edit-account-title" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-acct-avatar">{t("profilePhoto")}</Label>
              <Input id="edit-acct-avatar" placeholder="https://…" value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} data-testid="input-edit-account-avatar" />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={onClose} data-testid="button-cancel-edit-account">{t("cancel")}</Button>
              <Button
                disabled={!name.trim() || save.isPending}
                onClick={() => save.mutate()}
                className="bg-[hsl(193,52%,38%)] hover:bg-[hsl(193,52%,30%)] text-white"
                data-testid="button-save-account"
              >
                <Save className="h-4 w-4 mr-2" />
                {t("save")}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function UserAdmin() {
  const { t } = useLang();
  const { toast } = useToast();
  const { user: me } = useAuth();
  const [query, setQuery] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<SafeUser | null>(null);
  const { data: users, isLoading } = useQuery<SafeUser[]>({ queryKey: ["/api/admin/users"] });

  // Local draft of rights per user id. Checkboxes update the draft instantly
  // (color changes right away); the admin then commits all changes in one PATCH.
  type RightsDraft = { view: boolean; edit: boolean; ir: boolean; dev: boolean; admin: boolean };
  const [drafts, setDrafts] = useState<Record<number, RightsDraft>>({});
  const [savingId, setSavingId] = useState<number | null>(null);

  const serverRights = (u: SafeUser): RightsDraft => ({
    view: u.status === "approved",
    edit: u.role === "staff" || u.role === "admin",
    ir: u.isIr === 1,
    dev: u.isDev === 1,
    admin: u.role === "admin",
  });

  const draftFor = (u: SafeUser): RightsDraft => drafts[u.id] ?? serverRights(u);

  const setRight = (u: SafeUser, key: keyof RightsDraft, val: boolean) => {
    setDrafts((prev) => {
      const base = prev[u.id] ?? serverRights(u);
      const next: RightsDraft = { ...base, [key]: val };
      // Admin implies Edit; turning Admin on forces Edit on, turning Edit off forces Admin off.
      if (key === "admin" && val) next.edit = true;
      if (key === "edit" && !val) next.admin = false;
      return { ...prev, [u.id]: next };
    });
  };

  const isDirty = (u: SafeUser): boolean => {
    const d = drafts[u.id];
    if (!d) return false;
    const s = serverRights(u);
    return d.view !== s.view || d.edit !== s.edit || d.ir !== s.ir || d.dev !== s.dev || d.admin !== s.admin;
  };

  const resetRow = (id: number) => setDrafts((prev) => { const n = { ...prev }; delete n[id]; return n; });

  // Single-field mutation used by approve/reject buttons.
  const mutation = useMutation({
    mutationFn: async ({ id, status, role, isIr, isDev }: { id: number; status?: string; role?: string; isIr?: number; isDev?: number }) => {
      const res = await apiRequest("PATCH", `/api/admin/users/${id}`, { status, role, isIr, isDev });
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] }),
    onError: (e: any) => toast({ title: String(e?.message ?? "Update failed"), variant: "destructive" }),
  });

  const saveRow = async (u: SafeUser) => {
    const d = draftFor(u);
    const payload = {
      status: d.view ? "approved" : "pending",
      role: d.admin ? "admin" : d.edit ? "staff" : "viewer",
      isIr: d.ir ? 1 : 0,
      isDev: d.dev ? 1 : 0,
    };
    setSavingId(u.id);
    try {
      const res = await apiRequest("PATCH", `/api/admin/users/${u.id}`, payload);
      await res.json();
      resetRow(u.id);
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: t("rightsSaved") });
    } catch (e: any) {
      toast({ title: String(e?.message ?? "Update failed"), variant: "destructive" });
    } finally {
      setSavingId(null);
    }
  };

  if (isLoading) return <p className="text-muted-foreground py-8">…</p>;
  const q = query.trim().toLowerCase();
  const visible = (users ?? []).filter(
    (u) => !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q),
  );
  const pending = visible.filter((u) => u.status === "pending");
  const others = visible.filter((u) => u.status !== "pending");

  // Rights matrix semantics:
  // View  = account approved (can sign in and browse)
  // Edit  = role staff or admin (can register and edit partnerships)
  // IR    = isIr flag (can see and edit LP status)
  // Dev   = isDev flag (can see the R&D planner)
  // Admin = role admin (implies Edit; manages accounts and approvals)
  const rightCell = (
    u: SafeUser,
    key: "view" | "edit" | "ir" | "dev" | "admin",
    checked: boolean,
    disabled: boolean,
    hint: string,
    onChange: (c: boolean) => void,
    changed: boolean,
  ) => (
    <label key={key} title={hint} className="flex w-12 flex-col items-center gap-1.5 cursor-pointer">
      <span className={`text-[9px] font-extrabold uppercase tracking-wider ${changed ? "text-[hsl(43,55%,45%)]" : "text-muted-foreground"}`}>{t(`right_${key}` as any)}</span>
      <Checkbox
        checked={checked}
        disabled={disabled}
        onCheckedChange={(c) => onChange(c === true)}
        className={`data-[state=checked]:bg-[hsl(193,52%,38%)] data-[state=checked]:border-[hsl(193,52%,38%)] ${changed ? "ring-2 ring-[hsl(43,55%,55%)] ring-offset-1 ring-offset-background" : ""}`}
        data-testid={`check-${key}-${u.id}`}
      />
    </label>
  );

  const row = (u: SafeUser) => (
    <div key={u.id} className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-lg border border-card-border bg-card px-4 py-3" data-testid={`row-user-${u.id}`}>
      <div className="flex min-w-0 flex-1 items-center gap-3" style={{ minWidth: "12rem" }}>
        <UserAvatar name={u.name} avatarUrl={u.avatarUrl} size="sm" />
        <div className="min-w-0">
          <p className="font-semibold text-sm truncate">{u.name}</p>
          {u.title && <p className="text-[11px] text-muted-foreground truncate">{u.title}</p>}
          <p className="text-xs text-muted-foreground truncate">{u.email}</p>
          {u.editRequestedAt && u.role === "viewer" && (
            <Badge className="mt-1 bg-[hsl(43,55%,50%)]/15 text-[hsl(43,60%,35%)] dark:text-[hsl(43,60%,65%)] border border-[hsl(43,55%,50%)]/40 text-[10px]" data-testid={`badge-edit-requested-${u.id}`}>
              {t("requestEditBadge")}
            </Badge>
          )}
        </div>
      </div>
      {/* Rights matrix — checkboxes edit a local draft; changes are saved in one go */}
      {(() => {
        const d = draftFor(u);
        const s = serverRights(u);
        const dirty = isDirty(u);
        const saving = savingId === u.id;
        return (
          <div className="flex items-end gap-2">
            <div className={`flex items-end gap-1 rounded-md border px-2 py-1.5 transition-colors ${dirty ? "border-[hsl(43,55%,55%)] bg-[hsl(43,55%,55%)]/5" : "border-border/60 bg-background/40"}`} data-testid={`rights-matrix-${u.id}`}>
              {rightCell(u, "view", d.view, me?.id === u.id, t("right_view_hint"), (c) => setRight(u, "view", c), d.view !== s.view)}
              {rightCell(u, "edit", d.edit, me?.id === u.id || d.admin, t("right_edit_hint"), (c) => setRight(u, "edit", c), d.edit !== s.edit)}
              {rightCell(u, "ir", d.ir, false, t("right_ir_hint"), (c) => setRight(u, "ir", c), d.ir !== s.ir)}
              {rightCell(u, "dev", d.dev, false, t("right_dev_hint"), (c) => setRight(u, "dev", c), d.dev !== s.dev)}
              {rightCell(u, "admin", d.admin, me?.id === u.id, t("right_admin_hint"), (c) => setRight(u, "admin", c), d.admin !== s.admin)}
            </div>
            {dirty && (
              <div className="flex items-center gap-1">
                <Button size="sm" onClick={() => saveRow(u)} disabled={saving} title={t("unsavedRights")} className="h-8 bg-[hsl(43,55%,50%)] text-[hsl(214,68%,15%)] font-semibold shadow-sm transition-all hover:bg-[hsl(43,55%,58%)] hover:shadow-md" data-testid={`button-save-rights-${u.id}`}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="h-4 w-4 mr-1" />{t("saveRights")}</>}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => resetRow(u.id)} disabled={saving} title={t("resetRights")} className="h-8 px-2 text-muted-foreground" data-testid={`button-reset-rights-${u.id}`}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        );
      })()}
      <Badge variant={u.status === "approved" ? "default" : u.status === "rejected" ? "destructive" : "secondary"}>
        {t(`status_${u.status}` as any)}
      </Badge>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => setEditing(u)}
        title={t("editAccount")}
        data-testid={`button-edit-user-${u.id}`}
      >
        <Pencil className="h-4 w-4" />
      </Button>
      {u.status === "pending" && (
        <>
          <Button size="sm" onClick={() => mutation.mutate({ id: u.id, status: "approved" })} className="bg-emerald-600 text-white shadow-sm transition-all hover:bg-emerald-500 hover:shadow-md" data-testid={`button-approve-user-${u.id}`}>
            <Check className="h-4 w-4 mr-1" />{t("approve")}
          </Button>
          <Button size="sm" variant="outline" onClick={() => mutation.mutate({ id: u.id, status: "rejected" })} className="border-red-300 text-red-600 transition-colors hover:bg-red-600 hover:text-white hover:border-red-600 dark:border-red-900 dark:text-red-400" data-testid={`button-reject-user-${u.id}`}>
            <X className="h-4 w-4 mr-1" />{t("reject")}
          </Button>
        </>
      )}
      {u.status === "rejected" && (
        <Button size="sm" variant="outline" onClick={() => mutation.mutate({ id: u.id, status: "approved" })}>
          <Check className="h-4 w-4 mr-1" />{t("approve")}
        </Button>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("adminSearchUsers")}
            className="pl-9"
            data-testid="input-search-users"
          />
        </div>
        <Button
          onClick={() => setShowAdd(true)}
          className="bg-[hsl(193,52%,38%)] hover:bg-[hsl(193,52%,30%)] text-white"
          data-testid="button-add-account"
        >
          <UserPlus className="h-4 w-4 mr-2" />
          {t("addAccount")}
        </Button>
      </div>
      {pending.length > 0 && (
        <div>
          <h3 className="text-sm font-bold mb-3">{t("status_pending")} ({pending.length})</h3>
          <div className="space-y-2">{pending.map(row)}</div>
        </div>
      )}
      <div className="space-y-2">{others.map(row)}</div>
      {visible.length === 0 && <p className="text-muted-foreground">{t("noPending")}</p>}
      {/* Rights legend */}
      <div className="rounded-lg border border-border/60 bg-card/60 px-4 py-3" data-testid="rights-legend">
        <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
          <Info className="h-3.5 w-3.5" />
          {t("rightsLegendTitle")}
        </p>
        <ul className="grid gap-1.5 text-xs text-muted-foreground sm:grid-cols-2">
          <li><span className="font-bold text-foreground">{t("right_view")}</span> — {t("right_view_hint")}</li>
          <li><span className="font-bold text-foreground">{t("right_edit")}</span> — {t("right_edit_hint")}</li>
          <li><span className="font-bold text-foreground">{t("right_ir")}</span> — {t("right_ir_hint")}</li>
          <li><span className="font-bold text-foreground">{t("right_dev")}</span> — {t("right_dev_hint")}</li>
          <li><span className="font-bold text-foreground">{t("right_admin")}</span> — {t("right_admin_hint")}</li>
        </ul>
      </div>
      <AddAccountDialog open={showAdd} onClose={() => setShowAdd(false)} />
      <EditAccountDialog u={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

// ---------------- Change requests ----------------
const FIELD_LABEL_KEYS: Record<string, string> = {
  nameEn: "nameEn", nameCn: "nameCn", category: "filterCategory", region: "region",
  website: "website", logoUrl: "logoUrl", descriptionEn: "descriptionEn", descriptionCn: "descriptionCn",
  contactName: "contactName", contactEmail: "contactEmail", picName: "picLabel", picNames: "picsLabel", parentId: "parentLabel",
  context: "contextLabel", partnershipType: "partnershipType", startDate: "startDate",
  stage: "filterStage", collabLevel: "collabLevel", notes: "notes", photos: "photosLabel",
};

function ChangeRequestAdmin() {
  const { t, lang } = useLang();
  const { toast } = useToast();
  const { data: requests, isLoading } = useQuery<ChangeRequest[]>({ queryKey: ["/api/change-requests"] });
  const { data: partners } = useQuery<Partnership[]>({ queryKey: ["/api/admin/partnerships"] });
  const { data: users } = useQuery<SafeUser[]>({ queryKey: ["/api/admin/users"] });

  const mutation = useMutation({
    mutationFn: async ({ id, action }: { id: number; action: "approve" | "reject" }) => {
      const res = await apiRequest("PATCH", `/api/change-requests/${id}`, { action });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/change-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/partnerships"] });
      queryClient.invalidateQueries({ queryKey: ["/api/partnerships"] });
    },
    onError: () => toast({ title: "Update failed", variant: "destructive" }),
  });

  if (isLoading) return <p className="text-muted-foreground py-8">…</p>;

  const list = requests ?? [];
  const pending = list.filter((r) => r.status === "pending");
  const resolved = list.filter((r) => r.status !== "pending");

  const partnerOf = (id: number) => partners?.find((p) => p.id === id);
  const userOf = (id: number) => users?.find((u) => u.id === id);
  const fmt = (k: string, v: unknown) => {
    if (v == null || v === "" || (Array.isArray(v) && v.length === 0)) return "—";
    if (Array.isArray(v)) return v.join(", ");
    if (k === "stage" && (STAGES as readonly string[]).includes(String(v))) {
      return `${STAGE_NUM[v as Stage]} · ${t(`stage_${v}` as any)}`;
    }
    if (k === "region" && (REGIONS as readonly string[]).includes(String(v))) return t(`region_${v}` as any);
    if (k === "category" && (CATEGORIES as readonly string[]).includes(String(v))) return t(`cat_${v}` as any);
    return String(v);
  };

  const card = (r: ChangeRequest) => {
    const p = partnerOf(r.partnershipId);
    const proposer = userOf(r.proposedBy);
    let changes: Record<string, unknown> = {};
    try { changes = JSON.parse(r.changes); } catch { /* noop */ }
    const entries = Object.entries(changes);
    return (
      <div key={r.id} className="rounded-lg border border-card-border bg-card p-4 space-y-3" data-testid={`card-change-${r.id}`}>
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-sm truncate">
              {p ? (lang === "cn" && p.nameCn ? p.nameCn : p.nameEn) : `#${r.partnershipId}`}
            </p>
            <p className="text-xs text-muted-foreground">
              {proposer?.name ?? "—"} · {new Date(r.createdAt).toLocaleDateString(lang === "cn" ? "zh-CN" : "en-GB")}
            </p>
          </div>
          <Badge variant={r.status === "approved" ? "default" : r.status === "rejected" ? "destructive" : "secondary"}>
            {t(`status_${r.status}` as any)}
          </Badge>
          {r.status === "pending" && (
            <>
              <Button size="sm" onClick={() => mutation.mutate({ id: r.id, action: "approve" })} disabled={mutation.isPending} className="bg-emerald-600 text-white shadow-sm transition-all hover:bg-emerald-500 hover:shadow-md" data-testid={`button-approve-change-${r.id}`}>
                <Check className="h-4 w-4 mr-1" />{t("approve")}
              </Button>
              <Button size="sm" variant="outline" onClick={() => mutation.mutate({ id: r.id, action: "reject" })} disabled={mutation.isPending} className="border-red-300 text-red-600 transition-colors hover:bg-red-600 hover:text-white hover:border-red-600 dark:border-red-900 dark:text-red-400" data-testid={`button-reject-change-${r.id}`}>
                <X className="h-4 w-4 mr-1" />{t("reject")}
              </Button>
            </>
          )}
        </div>

        {entries.length > 0 && (
          <div className="rounded-md border border-border overflow-hidden">
            <div className="grid grid-cols-3 bg-muted px-3 py-1.5 text-[11px] font-semibold text-muted-foreground">
              <span>{t("proposedChanges")}</span>
              <span>{t("currentValue")}</span>
              <span>{t("proposedValue")}</span>
            </div>
            {entries.map(([k, v]) => (
              <div key={k} className="grid grid-cols-3 px-3 py-1.5 text-xs border-t border-border">
                <span className="font-medium">{FIELD_LABEL_KEYS[k] ? t(FIELD_LABEL_KEYS[k] as any) : k}</span>
                <span className="text-muted-foreground break-words pr-2">{fmt(k, p ? (p as any)[k] : undefined)}</span>
                <span className="break-words font-medium text-[hsl(var(--aqua))]">{fmt(k, v)}</span>
              </div>
            ))}
          </div>
        )}
        {r.note && <p className="text-xs text-muted-foreground whitespace-pre-wrap">{t("changeNote")}: {r.note}</p>}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {pending.length > 0 ? (
        <div>
          <h3 className="text-sm font-bold mb-3">{t("status_pending")} ({pending.length})</h3>
          <div className="space-y-3">{pending.map(card)}</div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{t("noPending")}</p>
      )}
      {resolved.length > 0 && <div className="space-y-3">{resolved.map(card)}</div>}
    </div>
  );
}

// ---------------- Partnerships ----------------
function PartnershipAdmin() {
  const { t, lang } = useLang();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [deleteTarget, setDeleteTarget] = useState<Partnership | null>(null);
  const [editTarget, setEditTarget] = useState<Partnership | null>(null);
  const [query, setQuery] = useState("");
  const { data: all, isLoading } = useQuery<Partnership[]>({ queryKey: ["/api/admin/partnerships"] });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/admin/partnerships"] });
    queryClient.invalidateQueries({ queryKey: ["/api/partnerships"] });
    queryClient.invalidateQueries({ queryKey: ["/api/mine"] });
  };

  const patch = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<Partnership> }) => {
      const res = await apiRequest("PATCH", `/api/partnerships/${id}`, data);
      return res.json();
    },
    onSuccess: invalidate,
    onError: () => toast({ title: "Update failed", variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/partnerships/${id}`),
    onSuccess: () => {
      invalidate();
      setDeleteTarget(null);
    },
    onError: () => toast({ title: "Delete failed", variant: "destructive" }),
  });

  if (isLoading) return <p className="text-muted-foreground py-8">…</p>;
  const q = query.trim().toLowerCase();
  const visible = (all ?? []).filter(
    (p) =>
      !q ||
      [p.nameEn, p.nameCn, p.partnershipType, p.contactName, picsOf(p).join(" ")]
        .filter(Boolean)
        .some((s) => String(s).toLowerCase().includes(q)),
  );
  const pending = visible.filter((p) => p.status === "pending");
  const others = visible.filter((p) => p.status !== "pending");

  const row = (p: Partnership) => {
    const name = lang === "cn" && p.nameCn ? p.nameCn : p.nameEn;
    return (
      <div key={p.id} className="rounded-lg border border-card-border bg-card px-4 py-3" data-testid={`row-partnership-${p.id}`}>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(`/partner/${p.id}`)}
            className="flex min-w-0 flex-1 items-center gap-3 rounded-md text-left transition-opacity hover:opacity-80"
            title={t("viewPartnerRecord")}
            data-testid={`link-partner-record-${p.id}`}
          >
            <PartnerLogo p={p} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-sm truncate underline-offset-2 decoration-dotted group-hover:underline">{name}</p>
              <p className="text-xs text-muted-foreground truncate">{p.partnershipType || t(`cat_${p.category}` as any)}</p>
            </div>
          </button>
          <Badge variant={p.status === "approved" ? "default" : p.status === "rejected" ? "destructive" : "secondary"} data-testid={`status-partnership-${p.id}`}>
            {t(`status_${p.status}` as any)}
          </Badge>

          {/* Stage select */}
          <Select value={p.stage} onValueChange={(v) => patch.mutate({ id: p.id, data: { stage: v } })}>
            <SelectTrigger className="w-44 h-8 text-xs" data-testid={`select-stage-${p.id}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STAGES.map((s) => (
                <SelectItem key={s} value={s}>{STAGE_NUM[s]} · {t(`stage_${s}` as any)}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* PIC */}
          <div className="flex items-center" title={picsOf(p).join(", ")} data-testid={`pics-${p.id}`}>
            <PicAvatars names={picsOf(p)} />
          </div>

          {/* Start date */}
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground tabular-nums w-24" data-testid={`date-${p.id}`}>
            <CalendarDays className="h-3.5 w-3.5 shrink-0" />
            {p.startDate || "—"}
          </span>

          {/* HOF toggle */}
          <Button
            size="icon"
            variant="ghost"
            title={t("hallOfFameToggle")}
            onClick={() => patch.mutate({ id: p.id, data: { hallOfFame: p.hallOfFame === 1 ? 0 : 1 } })}
            className="transition-colors hover:bg-[hsl(var(--gold))]/15"
            data-testid={`button-hof-${p.id}`}
          >
            <Star className={p.hallOfFame === 1 ? "h-4 w-4 fill-[hsl(var(--gold))] text-[hsl(var(--gold))]" : "h-4 w-4 text-muted-foreground transition-colors group-hover:text-[hsl(var(--gold))]"} />
          </Button>

          {/* Edit */}
          <Button size="icon" variant="ghost" onClick={() => setEditTarget(p)} className="text-[hsl(193,52%,38%)] transition-colors hover:bg-[hsl(var(--aqua))]/15 hover:text-[hsl(193,52%,30%)] dark:text-[hsl(var(--aqua))]" title={t("editRecord")} data-testid={`button-edit-${p.id}`}>
            <Pencil className="h-4 w-4" />
          </Button>

          {p.status !== "approved" && (
            <Button size="sm" onClick={() => patch.mutate({ id: p.id, data: { status: "approved" } })} className="bg-emerald-600 text-white shadow-sm transition-all hover:bg-emerald-500 hover:shadow-md" data-testid={`button-approve-${p.id}`}>
              <Check className="h-4 w-4 mr-1" />{t("approve")}
            </Button>
          )}
          {p.status === "pending" && (
            <Button size="sm" variant="outline" onClick={() => patch.mutate({ id: p.id, data: { status: "rejected" } })} className="border-red-300 text-red-600 transition-colors hover:bg-red-600 hover:text-white hover:border-red-600 dark:border-red-900 dark:text-red-400" data-testid={`button-reject-${p.id}`}>
              <X className="h-4 w-4 mr-1" />{t("reject")}
            </Button>
          )}
          <Button size="icon" variant="ghost" onClick={() => setDeleteTarget(p)} className="text-destructive/80 transition-colors hover:bg-destructive/15 hover:text-destructive" title={t("delete")} data-testid={`button-delete-${p.id}`}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("adminSearchRecords")}
          className="pl-9"
          data-testid="input-search-records"
        />
      </div>
      {pending.length > 0 ? (
        <div>
          <h3 className="text-sm font-bold mb-3">{t("status_pending")} ({pending.length})</h3>
          <div className="space-y-2">{pending.map(row)}</div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{t("noPending")}</p>
      )}
      <div className="space-y-2">{others.map(row)}</div>

      <EditPartnershipDialog
        p={editTarget}
        allPartners={all ?? []}
        onClose={() => setEditTarget(null)}
        onSaved={invalidate}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("confirmDelete")}</AlertDialogTitle>
            <AlertDialogDescription>{deleteTarget?.nameEn}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && remove.mutate(deleteTarget.id)}
              className="bg-destructive text-destructive-foreground"
              data-testid="button-confirm-delete"
            >
              {t("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ---------------- Sector tags (v5.5) ----------------
function TagAdmin() {
  const { t, lang } = useLang();
  const { toast } = useToast();
  const [draftEn, setDraftEn] = useState("");
  const [draftCn, setDraftCn] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editEn, setEditEn] = useState("");
  const [editCn, setEditCn] = useState("");
  const [editColor, setEditColor] = useState<string | null>(null);

  const TAG_COLORS = ["#2F7E96", "#B08A2E", "#2E7D52", "#6D4FA3", "#B04A62", "#3A5FA8", "#B05E2E", "#5A6B7B"];

  const { data: tags, isLoading } = useQuery<SectorTag[]>({ queryKey: ["/api/sector-tags"] });
  const { data: advisorList } = useQuery<{ tags?: SectorTag[] }[]>({ queryKey: ["/api/advisors"] });
  const { data: pTagRows } = useQuery<{ partnershipId: number; tagId: number }[]>({ queryKey: ["/api/partnership-tags"] });

  const usage = (tagId: number) => {
    const adv = (advisorList ?? []).filter((a) => (a.tags ?? []).some((x) => x.id === tagId)).length;
    const orgs = (pTagRows ?? []).filter((r) => r.tagId === tagId).length;
    return { adv, orgs };
  };

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/sector-tags"] });
    queryClient.invalidateQueries({ queryKey: ["/api/advisors"] });
    queryClient.invalidateQueries({ queryKey: ["/api/partnership-tags"] });
  };

  const create = useMutation({
    mutationFn: async () => {
      const maxOrder = Math.max(0, ...(tags ?? []).map((x) => x.sortOrder ?? 0));
      const res = await apiRequest("POST", "/api/sector-tags", { nameEn: draftEn.trim(), nameCn: draftCn.trim() || null, sortOrder: maxOrder + 1 });
      return res.json();
    },
    onSuccess: () => { invalidate(); setDraftEn(""); setDraftCn(""); },
    onError: (e: any) => toast({ description: String(e?.message ?? e), variant: "destructive" }),
  });

  const update = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/sector-tags/${editingId}`, { nameEn: editEn.trim(), nameCn: editCn.trim() || null, color: editColor });
      return res.json();
    },
    onSuccess: () => { invalidate(); setEditingId(null); },
    onError: (e: any) => toast({ description: String(e?.message ?? e), variant: "destructive" }),
  });

  const del = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/sector-tags/${id}`),
    onSuccess: invalidate,
    onError: (e: any) => toast({ description: String(e?.message ?? e), variant: "destructive" }),
  });

  const reorder = useMutation({
    mutationFn: async ({ index, dir }: { index: number; dir: -1 | 1 }) => {
      const list = [...(tags ?? [])];
      const j = index + dir;
      if (j < 0 || j >= list.length) return;
      [list[index], list[j]] = [list[j], list[index]];
      const changed = list
        .map((tg, i) => ({ tg, i }))
        .filter(({ tg, i }) => (tg.sortOrder ?? 0) !== i);
      await Promise.all(changed.map(({ tg, i }) => apiRequest("PATCH", `/api/sector-tags/${tg.id}`, { sortOrder: i })));
    },
    onSuccess: invalidate,
    onError: (e: any) => toast({ description: String(e?.message ?? e), variant: "destructive" }),
  });

  return (
    <div className="space-y-4" data-testid="admin-tags">
      <div className="flex items-start gap-2">
        <Tags className="h-4 w-4 mt-0.5 text-[hsl(var(--gold))]" />
        <p className="text-sm text-muted-foreground">{t("sectorTagsHint")}</p>
      </div>

      <div className="rounded-lg border border-card-border bg-card p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2">
          <Input placeholder={t("tagNameEn")} value={draftEn} onChange={(e) => setDraftEn(e.target.value)} data-testid="input-tag-name-en" />
          <Input placeholder={t("tagNameCn")} value={draftCn} onChange={(e) => setDraftCn(e.target.value)} data-testid="input-tag-name-cn" />
          <Button
            onClick={() => create.mutate()}
            disabled={!draftEn.trim() || create.isPending}
            className="bg-[hsl(193,52%,38%)] text-white hover:bg-[hsl(193,52%,30%)]"
            data-testid="button-add-tag"
          >
            <Plus className="h-4 w-4 mr-1.5" /> {t("tagAdd")}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">…</p>
      ) : !tags || tags.length === 0 ? (
        <p className="text-sm text-muted-foreground italic" data-testid="text-tags-empty">{t("tagNone")}</p>
      ) : (
        <div className="divide-y divide-border rounded-lg border border-card-border bg-card">
          {tags.map((tg, index) => {
            const u = usage(tg.id);
            return (
              <div key={tg.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5" data-testid={`row-tag-${tg.id}`}>
                {editingId === tg.id ? (
                  <div className="flex flex-1 flex-wrap items-center gap-2">
                    <Input className="h-8 w-44" value={editEn} onChange={(e) => setEditEn(e.target.value)} data-testid={`input-edit-tag-en-${tg.id}`} />
                    <Input className="h-8 w-44" value={editCn} onChange={(e) => setEditCn(e.target.value)} data-testid={`input-edit-tag-cn-${tg.id}`} />
                    <span className="inline-flex items-center gap-1.5" data-testid={`palette-tag-${tg.id}`}>
                      <button
                        type="button"
                        title={t("tagColorDefault")}
                        onClick={() => setEditColor(null)}
                        className={"h-5 w-5 rounded-full border bg-[hsl(193,52%,38%)]/15 " + (editColor === null ? "ring-2 ring-offset-1 ring-[hsl(193,52%,38%)]" : "border-border")}
                        data-testid={`color-default-${tg.id}`}
                      />
                      {TAG_COLORS.map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setEditColor(c)}
                          className={"h-5 w-5 rounded-full border " + (editColor === c ? "ring-2 ring-offset-1 ring-[hsl(193,52%,38%)]" : "border-border")}
                          style={{ backgroundColor: c }}
                          data-testid={`color-${c.slice(1)}-${tg.id}`}
                        />
                      ))}
                    </span>
                    <Button size="sm" className="h-8 bg-[hsl(193,52%,38%)] text-white hover:bg-[hsl(193,52%,30%)]" disabled={!editEn.trim() || update.isPending}
                      onClick={() => update.mutate()} data-testid={`button-save-tag-${tg.id}`}>
                      <Check className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8" onClick={() => setEditingId(null)} data-testid={`button-cancel-tag-${tg.id}`}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ) : (
                  <>
                    <span className="flex flex-col gap-0.5">
                      <button type="button" className="p-0.5 disabled:opacity-25" disabled={index === 0 || reorder.isPending}
                        onClick={() => reorder.mutate({ index, dir: -1 })} data-testid={`button-tag-up-${tg.id}`}>
                        <ArrowUp className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                      </button>
                      <button type="button" className="p-0.5 disabled:opacity-25" disabled={index === tags.length - 1 || reorder.isPending}
                        onClick={() => reorder.mutate({ index, dir: 1 })} data-testid={`button-tag-down-${tg.id}`}>
                        <ArrowDown className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                      </button>
                    </span>
                    <Badge
                      variant="outline"
                      className={!tg.color ? "border-[hsl(193,52%,38%)]/30 bg-[hsl(193,52%,38%)]/8 text-[hsl(193,52%,30%)] dark:text-[hsl(193,60%,60%)]" : undefined}
                      style={tg.color ? { borderColor: `${tg.color}55`, backgroundColor: `${tg.color}14`, color: tg.color } : undefined}
                    >
                      {lang === "cn" && tg.nameCn ? tg.nameCn : tg.nameEn}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{tg.nameEn}{tg.nameCn ? ` / ${tg.nameCn}` : ""}</span>
                    <span className="ml-auto flex items-center gap-3">
                      <span className="text-xs text-muted-foreground tabular-nums" data-testid={`text-tag-usage-${tg.id}`}>
                        {u.adv} {t("tagAdvisorsSuffix")} · {u.orgs} {t("tagPartnersSuffix")}
                      </span>
                      <span className="flex gap-1">
                        <button type="button" className="p-1.5" data-testid={`button-edit-tag-${tg.id}`}
                          onClick={() => { setEditingId(tg.id); setEditEn(tg.nameEn); setEditCn(tg.nameCn ?? ""); setEditColor(tg.color ?? null); }}>
                          <Pencil className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                        </button>
                        <button type="button" className="p-1.5" data-testid={`button-delete-tag-${tg.id}`}
                          onClick={() => { if (confirm(t("tagConfirmDelete"))) del.mutate(tg.id); }}>
                          <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                        </button>
                      </span>
                    </span>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------- Settings (v5.5) ----------------
function SettingsAdmin() {
  const { t } = useLang();
  const { toast } = useToast();
  const [cooEmail, setCooEmail] = useState("");
  const [seeded, setSeeded] = useState(false);

  const { data: settings } = useQuery<{ cooEmail: string }>({ queryKey: ["/api/settings"] });
  if (settings && !seeded) {
    setSeeded(true);
    setCooEmail(settings.cooEmail ?? "");
  }

  const save = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", "/api/admin/settings", { cooEmail: cooEmail.trim() });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({ description: t("settingsSaved") });
    },
    onError: (e: any) => toast({ description: String(e?.message ?? e), variant: "destructive" }),
  });

  return (
    <div className="max-w-lg space-y-4" data-testid="admin-settings">
      <div className="flex items-start gap-2">
        <Settings2 className="h-4 w-4 mt-0.5 text-[hsl(var(--gold))]" />
        <p className="text-sm text-muted-foreground">{t("settingsCooEmailHint")}</p>
      </div>
      <div className="rounded-lg border border-card-border bg-card p-4 space-y-3">
        <div className="space-y-1.5">
          <Label>{t("settingsCooEmail")}</Label>
          <Input
            type="email"
            placeholder="coo-office@gobi.vc"
            value={cooEmail}
            onChange={(e) => setCooEmail(e.target.value)}
            data-testid="input-coo-email"
          />
        </div>
        <div className="flex justify-end">
          <Button
            onClick={() => save.mutate()}
            disabled={save.isPending}
            className="bg-[hsl(193,52%,38%)] text-white hover:bg-[hsl(193,52%,30%)]"
            data-testid="button-save-settings"
          >
            <Save className="h-4 w-4 mr-1.5" /> {save.isPending ? "…" : t("save")}
          </Button>
        </div>
      </div>
    </div>
  );
}
