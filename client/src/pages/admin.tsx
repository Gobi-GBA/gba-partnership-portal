import { useState } from "react";
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
import { Check, X, Star, Trash2, ShieldAlert, Pencil, CalendarDays, Search, UserPlus, Save } from "lucide-react";
import type { Partnership, SafeUser, Stage, ChangeRequest, Feedback, FeedbackStatus } from "@shared/schema";
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
          </TabsList>
          <TabsContent value="partnerships"><PartnershipAdmin /></TabsContent>
          <TabsContent value="changes"><ChangeRequestAdmin /></TabsContent>
          <TabsContent value="users"><UserAdmin /></TabsContent>
          <TabsContent value="feedback"><FeedbackAdmin /></TabsContent>
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

function UserAdmin() {
  const { t } = useLang();
  const { toast } = useToast();
  const { user: me } = useAuth();
  const [query, setQuery] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const { data: users, isLoading } = useQuery<SafeUser[]>({ queryKey: ["/api/admin/users"] });

  const mutation = useMutation({
    mutationFn: async ({ id, status, role }: { id: number; status?: string; role?: string }) => {
      const res = await apiRequest("PATCH", `/api/admin/users/${id}`, { status, role });
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] }),
    onError: (e: any) => toast({ title: String(e?.message ?? "Update failed"), variant: "destructive" }),
  });

  if (isLoading) return <p className="text-muted-foreground py-8">…</p>;
  const q = query.trim().toLowerCase();
  const visible = (users ?? []).filter(
    (u) => !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q),
  );
  const pending = visible.filter((u) => u.status === "pending");
  const others = visible.filter((u) => u.status !== "pending");

  const row = (u: SafeUser) => (
    <div key={u.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-card-border bg-card px-4 py-3" data-testid={`row-user-${u.id}`}>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-sm">{u.name}</p>
        <p className="text-xs text-muted-foreground truncate">{u.email}</p>
      </div>
      {/* Role select */}
      <Select
        value={u.role}
        onValueChange={(role) => mutation.mutate({ id: u.id, role })}
        disabled={me?.id === u.id}
      >
        <SelectTrigger className="w-32 h-8 text-xs" data-testid={`select-role-${u.id}`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ROLES.map((r) => (
            <SelectItem key={r} value={r}>{t(`role_${r}` as any)}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Badge variant={u.status === "approved" ? "default" : u.status === "rejected" ? "destructive" : "secondary"}>
        {t(`status_${u.status}` as any)}
      </Badge>
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
      <AddAccountDialog open={showAdd} onClose={() => setShowAdd(false)} />
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
          <PartnerLogo p={p} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-sm truncate">{name}</p>
            <p className="text-xs text-muted-foreground truncate">{p.partnershipType || t(`cat_${p.category}` as any)}</p>
          </div>
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
