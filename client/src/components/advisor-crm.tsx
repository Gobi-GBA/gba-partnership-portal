import { useEffect, useRef, useState } from "react";
import { thankYou } from "@/components/thank-you";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLang } from "@/lib/i18n";
import { copyText } from "@/lib/download";
import { useAuth } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import type { AdvisorWithRoles, SectorTag, AdvisorActivity } from "@shared/schema";
import { ACTIVITY_TYPES } from "@shared/schema";
import {
  Plus, Trash2, Pencil, Copy, Mail, Sparkles, CalendarDays, Loader2, Send, X, FileText, Upload,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ---------- Momentum ----------
export type Momentum = "active" | "warm" | "dormant" | "none";

export function momentumOf(lastActivityAt: string | null | undefined): Momentum {
  if (!lastActivityAt) return "none";
  const days = (Date.now() - new Date(lastActivityAt).getTime()) / 86400000;
  if (days <= 30) return "active";
  if (days <= 120) return "warm";
  return "dormant";
}

const MOMENTUM_DOT: Record<Momentum, string> = {
  active: "bg-[hsl(193,52%,38%)]",
  warm: "bg-[hsl(var(--gold))]",
  dormant: "bg-muted-foreground/40",
  none: "bg-muted-foreground/20",
};

export function MomentumDot({ lastActivityAt, withLabel = false }: { lastActivityAt: string | null | undefined; withLabel?: boolean }) {
  const { t } = useLang();
  const m = momentumOf(lastActivityAt);
  return (
    <span className="inline-flex items-center gap-1.5" title={t(`momentum_${m}` as any)} data-testid="momentum-dot">
      <span className={cn("h-2 w-2 rounded-full", MOMENTUM_DOT[m])} />
      {withLabel && <span className="text-[11px] text-muted-foreground">{t(`momentum_${m}` as any)}</span>}
    </span>
  );
}

// ---------- Sector tags ----------
export function useSectorTags(enabled = true) {
  return useQuery<SectorTag[]>({ queryKey: ["/api/sector-tags"], enabled });
}

export function tagName(tag: SectorTag, lang: string) {
  return lang === "cn" && tag.nameCn ? tag.nameCn : tag.nameEn;
}

export function TagBadges({ tags, className }: { tags: SectorTag[] | undefined; className?: string }) {
  const { lang } = useLang();
  if (!tags || tags.length === 0) return null;
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {tags.map((tg) => (
        <Badge
          key={tg.id}
          variant="outline"
          className={cn(
            "text-[11px] font-medium",
            !tg.color && "border-[hsl(193,52%,38%)]/30 bg-[hsl(193,52%,38%)]/8 text-[hsl(193,52%,30%)] dark:text-[hsl(193,60%,60%)]",
          )}
          style={tg.color ? { borderColor: `${tg.color}55`, backgroundColor: `${tg.color}14`, color: tg.color } : undefined}
          data-testid={`badge-tag-${tg.id}`}
        >
          {tagName(tg, lang)}
        </Badge>
      ))}
    </div>
  );
}

export function TagPicker({ selected, onChange }: { selected: number[]; onChange: (ids: number[]) => void }) {
  const { t, lang } = useLang();
  const { data: tags } = useSectorTags();
  if (!tags || tags.length === 0) {
    return <p className="text-xs text-muted-foreground italic">{t("tagNone")}</p>;
  }
  const toggle = (id: number) =>
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  return (
    <div className="flex flex-wrap gap-1.5" data-testid="tag-picker">
      {tags.map((tg) => {
        const on = selected.includes(tg.id);
        return (
          <button
            key={tg.id}
            type="button"
            onClick={() => toggle(tg.id)}
            className={cn(
              "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
              on
                ? "border-[hsl(193,52%,38%)] bg-[hsl(193,52%,38%)] text-white"
                : "border-border bg-secondary/40 text-muted-foreground hover:border-[hsl(193,52%,38%)]/50 hover:text-foreground",
            )}
            data-testid={`tag-option-${tg.id}`}
          >
            {tagName(tg, lang)}
          </button>
        );
      })}
    </div>
  );
}

// ---------- Date helpers ----------
export function formatDMY(iso: string): string {
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${d}/${m}/${y}` : iso;
}

export function formatBirthday(a: Pick<AdvisorWithRoles, "birthDay" | "birthMonth" | "birthYear">): string | null {
  if (!a.birthDay || !a.birthMonth) return null;
  const dd = String(a.birthDay).padStart(2, "0");
  const mm = String(a.birthMonth).padStart(2, "0");
  return a.birthYear ? `${dd}/${mm}/${a.birthYear}` : `${dd}/${mm}`;
}

// ---------- Activities timeline ----------
const EMPTY_ACT = { date: "", type: "note", note: "" };

export function ActivityTimeline({ advisorId }: { advisorId: number }) {
  const { t } = useLang();
  const { user } = useAuth();
  const { toast } = useToast();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState(EMPTY_ACT);

  const { data: acts, isLoading } = useQuery<AdvisorActivity[]>({
    queryKey: ["/api/advisors", advisorId, "activities"],
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/advisors", advisorId, "activities"] });
    queryClient.invalidateQueries({ queryKey: ["/api/advisors"] });
  };

  const save = useMutation({
    mutationFn: async () => {
      const payload = { date: draft.date, type: draft.type, note: draft.note.trim() || null };
      const res = editingId
        ? await apiRequest("PATCH", `/api/advisor-activities/${editingId}`, payload)
        : await apiRequest("POST", `/api/advisors/${advisorId}/activities`, payload);
      return res.json();
    },
    onSuccess: () => {
      invalidate();
      toast({ description: t("activitySaved") });
      thankYou();
      setAdding(false);
      setEditingId(null);
      setDraft(EMPTY_ACT);
    },
    onError: (e: any) => toast({ description: String(e?.message ?? e), variant: "destructive" }),
  });

  const del = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/advisor-activities/${id}`),
    onSuccess: () => {
      invalidate();
      toast({ description: t("activityDeleted") });
    },
  });

  const today = new Date().toISOString().slice(0, 10);
  const openAdd = () => {
    setEditingId(null);
    setDraft({ ...EMPTY_ACT, date: today });
    setAdding(true);
  };
  const openEdit = (act: AdvisorActivity) => {
    setEditingId(act.id);
    setDraft({ date: act.date, type: act.type, note: act.note ?? "" });
    setAdding(true);
  };
  const canEdit = (act: AdvisorActivity) => user?.role === "admin" || act.createdBy === user?.id;

  return (
    <div className="rounded-lg border border-border p-3 space-y-2.5" data-testid="activity-timeline">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
          <CalendarDays className="h-3.5 w-3.5" /> {t("activitiesLabel")}
        </p>
        {!adding && (
          <Button type="button" size="sm" variant="outline" onClick={openAdd} data-testid="button-add-activity">
            <Plus className="h-3.5 w-3.5 mr-1" /> {t("activityAdd")}
          </Button>
        )}
      </div>

      {adding && (
        <div className="space-y-2 rounded-md bg-secondary/40 p-2.5" data-testid="form-activity">
          <div className="grid grid-cols-2 gap-2">
            <Input type="date" value={draft.date} max={today} onChange={(e) => setDraft((d) => ({ ...d, date: e.target.value }))} data-testid="input-activity-date" />
            <Select value={draft.type} onValueChange={(v) => setDraft((d) => ({ ...d, type: v }))}>
              <SelectTrigger data-testid="select-activity-type"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ACTIVITY_TYPES.map((ty) => (
                  <SelectItem key={ty} value={ty}>{t(`activity_${ty}` as any)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Textarea rows={2} placeholder={t("activityNote")} value={draft.note} onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))} data-testid="input-activity-note" />
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={() => { setAdding(false); setEditingId(null); }} data-testid="button-cancel-activity">
              {t("cancel")}
            </Button>
            <Button type="button" size="sm" disabled={!draft.date || save.isPending} onClick={() => save.mutate()}
              className="bg-[hsl(193,52%,38%)] text-white hover:bg-[hsl(193,52%,30%)]" data-testid="button-save-activity">
              {save.isPending ? "…" : t("save")}
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <p className="text-xs text-muted-foreground">…</p>
      ) : !acts || acts.length === 0 ? (
        <p className="text-xs text-muted-foreground italic" data-testid="text-activities-empty">{t("activityEmpty")}</p>
      ) : (
        <div className="space-y-1.5">
          {acts.map((act) => (
            <div key={act.id} className="flex items-start gap-2 text-sm" data-testid={`row-activity-${act.id}`}>
              <Badge variant="outline" className="mt-0.5 shrink-0 text-[10px] font-medium">
                {t(`activity_${act.type}` as any)}
              </Badge>
              <div className="min-w-0 flex-1">
                <span className="text-xs font-medium text-muted-foreground">{formatDMY(act.date)}</span>
                {act.createdByName && <span className="text-xs text-muted-foreground/70"> · {act.createdByName}</span>}
                {act.note && <p className="text-sm leading-snug whitespace-pre-line">{act.note}</p>}
              </div>
              {canEdit(act) && (
                <span className="flex shrink-0 gap-0.5">
                  <button type="button" className="p-1" onClick={() => openEdit(act)} data-testid={`button-edit-activity-${act.id}`}>
                    <Pencil className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                  </button>
                  <button type="button" className="p-1" data-testid={`button-delete-activity-${act.id}`}
                    onClick={() => { if (confirm(t("activityConfirmDelete"))) del.mutate(act.id); }}>
                    <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                  </button>
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- Approval request email ----------
// v6.11 — the mailto draft dialog was folded into the unified approval email
// (components/advisor-approval-dialog.tsx), which renders from the shared
// template and offers both "copy" and "send from portal".

// ---------- LinkedIn auto-sync ----------
export interface ExtractedAdvisor {
  name?: string | null;
  nameCn?: string | null;
  background?: string | null;
  domains?: string | null;
  cohort?: string | null;
  photoUrl?: string | null;
  roles?: Array<{ title: string; organization?: string | null; isPrimary?: number }>;
}

// Identity hints from the form being edited — the rule-based layer that locks
// auto-sync onto the advisor the record is about (name first, then LinkedIn
// slug and email handle).
export interface SyncIdentity {
  name?: string;
  nameCn?: string;
  linkedinUrl?: string;
  emails?: string;
}

// Read a browser File into raw base64 (no data: prefix) for JSON upload bodies.
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(r.error ?? new Error("read failed"));
    r.readAsDataURL(file);
  });
}

export function LinkedinSyncControl({ url, identity, advisorId, onApply, openPasteSignal }: { url: string; identity?: SyncIdentity; advisorId?: number | null; onApply: (data: ExtractedAdvisor) => void; openPasteSignal?: number }) {
  const { t } = useLang();
  const { toast } = useToast();
  const [pasteOpen, setPasteOpen] = useState(false);
  // v6.05 — the guided source chooser (step 0) can pop the paste dialog open
  useEffect(() => {
    if (openPasteSignal) setPasteOpen(true);
  }, [openPasteSignal]);
  const [pasteText, setPasteText] = useState("");
  const cvInputRef = useRef<HTMLInputElement>(null);
  const [cvName, setCvName] = useState("");

  const extract = useMutation({
    mutationFn: async (body: { url?: string; text?: string; file?: { name: string; mime: string; data: string } }) => {
      const res = await apiRequest("POST", "/api/ai/advisor-extract", {
        ...body,
        advisorId: advisorId ?? undefined,
        expectedName: identity?.name?.trim() || undefined,
        expectedNameCn: identity?.nameCn?.trim() || undefined,
        linkedinUrl: identity?.linkedinUrl?.trim() || undefined,
        emails: identity?.emails?.trim() || undefined,
      });
      return res.json();
    },
    onSuccess: (data: ExtractedAdvisor, vars) => {
      onApply(data);
      setPasteOpen(false);
      setPasteText("");
      if (vars.file) {
        setCvName(vars.file.name);
        queryClient.invalidateQueries({ queryKey: ["/api/advisors"] });
        toast({ description: advisorId ? t("cvExtractFiledApplied") : t("linkedinSyncApplied") });
        return;
      }
      toast({ description: t("linkedinSyncApplied") });
    },
    onError: (e: any) => {
      const msg = String(e?.message ?? e);
      if (msg.includes("person_mismatch")) {
        let found = "";
        try { found = JSON.parse(msg.slice(msg.indexOf("{"))).found ?? ""; } catch {}
        toast({
          description: `${t("syncMismatch")}${found ? ` — ${found}` : ""}. ${t("syncMismatchHint")}`,
          variant: "destructive",
        });
        setPasteOpen(false);
      } else if (msg.includes("fetchFailed") || msg.includes("422")) {
        // Explain the fallback — an unexplained paste box after clicking Auto-sync reads as a bug
        toast({ description: t("syncFetchFallback") });
        setPasteOpen(true);
      } else {
        toast({ description: msg, variant: "destructive" });
      }
    },
  });

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={(!url.trim() && !identity?.linkedinUrl?.trim()) || extract.isPending}
        onClick={() => extract.mutate({ url: url.trim() || undefined })}
        title={t("linkedinSyncHint")}
        data-testid="button-linkedin-sync"
      >
        {extract.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-1.5" />}
        {t("linkedinSync")}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={extract.isPending}
        onClick={() => setPasteOpen(true)}
        title={t("cvExtractHint")}
        data-testid="button-cv-extract"
      >
        <FileText className="h-3.5 w-3.5 mr-1.5" />
        {t("cvExtract")}
      </Button>

      <Dialog open={pasteOpen} onOpenChange={setPasteOpen}>
        <DialogContent className="max-w-lg" data-testid="dialog-linkedin-paste">
          <DialogHeader>
            <DialogTitle>{t("cvPasteTitle")}</DialogTitle>
            <DialogDescription>{t("cvExtractHint")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            {/* v6.04 — upload the CV file itself: extracted server-side (PDF/DOCX/TXT)
                and filed against the advisor record when one exists. */}
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed border-border p-2.5">
              <input
                ref={cvInputRef}
                type="file"
                accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                className="hidden"
                data-testid="input-cv-file"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (!f) return;
                  if (f.size > 10 * 1024 * 1024) {
                    toast({ description: t("fileTooLarge"), variant: "destructive" });
                    return;
                  }
                  const data = await fileToBase64(f);
                  extract.mutate({ file: { name: f.name, mime: f.type || "application/pdf", data } });
                }}
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={extract.isPending}
                onClick={() => cvInputRef.current?.click()}
                data-testid="button-upload-cv-file"
              >
                {extract.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Upload className="h-3.5 w-3.5 mr-1.5" />}
                {t("uploadCvFile")}
              </Button>
              <span className="text-xs text-muted-foreground">{cvName || t("cvFileHint")}</span>
            </div>
            <p className="text-xs text-muted-foreground">{t("orPasteBelow")}</p>
            <Textarea rows={8} value={pasteText} onChange={(e) => setPasteText(e.target.value)} data-testid="input-linkedin-paste" />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setPasteOpen(false)} data-testid="button-cancel-paste">
                <X className="h-3.5 w-3.5 mr-1" /> {t("cancel")}
              </Button>
              <Button
                size="sm"
                className="bg-[hsl(193,52%,38%)] text-white hover:bg-[hsl(193,52%,30%)]"
                disabled={pasteText.trim().length < 40 || extract.isPending}
                onClick={() => extract.mutate({ text: pasteText.trim() })}
                data-testid="button-run-paste-extract"
              >
                {extract.isPending ? "…" : t("linkedinPasteRun")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
