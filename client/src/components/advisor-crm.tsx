import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLang } from "@/lib/i18n";
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
  Plus, Trash2, Pencil, Copy, Mail, Sparkles, CalendarDays, Loader2, Send, X,
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
          className="text-[11px] font-medium border-[hsl(193,52%,38%)]/30 bg-[hsl(193,52%,38%)]/8 text-[hsl(193,52%,30%)] dark:text-[hsl(193,60%,60%)]"
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
const CC_EMAIL = "fred@gobi.vc";

function buildApprovalEmail(a: AdvisorWithRoles, requesterName: string, lang: string, tHelper: (k: any) => string) {
  const cn = lang === "cn";
  const primary = a.roles.find((r) => r.isPrimary === 1) ?? a.roles[0];
  const roleLine = primary ? `${primary.title}${primary.organization ? ` — ${primary.organization}` : ""}` : "—";
  const tagsLine = (a.tags ?? []).map((tg) => (cn && tg.nameCn ? tg.nameCn : tg.nameEn)).join(", ") || "—";
  const fullName = a.nameCn ? `${a.name} (${a.nameCn})` : a.name;
  const subject = cn
    ? `顾问审批申请 — ${fullName}`
    : `Advisor approval request — ${fullName}`;
  const clearance = a.publicClearance === 1 ? tHelper("publicClearanceYes") : tHelper("publicClearanceNo");

  const rows: Array<[string, string]> = cn
    ? [
        ["姓名", fullName],
        ["顾问类别", tHelper(`advisorRole_${a.advisorType}`)],
        ["主要职务", roleLine],
        ["行业标签", tagsLine],
        ["专长领域", a.domains ?? "—"],
        ["公开展示许可", clearance],
        ["申请人", requesterName],
      ]
    : [
        ["Name", fullName],
        ["Advisor type", tHelper(`advisorRole_${a.advisorType}`)],
        ["Primary role", roleLine],
        ["Sector tags", tagsLine],
        ["Expert domains", a.domains ?? "—"],
        ["Public listing clearance", clearance],
        ["Requested by", requesterName],
      ];

  const intro = cn
    ? "您好，\n\n现提请审批以下顾问任命，详情如下："
    : "Dear COO Office,\n\nI would like to request approval for the following advisor appointment:";
  const outro = cn
    ? `此申请由 Gobi Partners 合作伙伴门户生成。\n\n此致\n${requesterName}`
    : `This request was generated from the Gobi Partners Partnership Portal.\n\nBest regards,\n${requesterName}`;
  const plain = `${intro}\n\n${rows.map(([k, v]) => `${k}: ${v}`).join("\n")}\n\n${outro}`;

  const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f5f7;font-family:'Plus Jakarta Sans','Noto Sans SC',Helvetica,Arial,sans-serif;">
<div style="max-width:560px;margin:24px auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e5ea;">
  <div style="background:#0C2340;padding:20px 28px;">
    <p style="margin:0;color:#D4A843;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">Gobi Partners</p>
    <p style="margin:6px 0 0;color:#ffffff;font-size:18px;font-weight:700;">${cn ? "顾问审批申请" : "Advisor Approval Request"}</p>
  </div>
  <div style="height:3px;background:linear-gradient(90deg,#D4A843,#48A9C5);"></div>
  <div style="padding:24px 28px;">
    <p style="margin:0 0 16px;color:#333a45;font-size:14px;line-height:1.6;white-space:pre-line;">${intro}</p>
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      ${rows.map(([k, v]) => `<tr><td style="padding:7px 12px 7px 0;color:#6b7280;font-weight:600;vertical-align:top;white-space:nowrap;">${k}</td><td style="padding:7px 0;color:#0C2340;">${v}</td></tr>`).join("")}
    </table>
    <p style="margin:18px 0 0;color:#333a45;font-size:14px;line-height:1.6;white-space:pre-line;">${outro}</p>
  </div>
  <div style="background:#f8f9fb;padding:12px 28px;border-top:1px solid #eceef2;">
    <p style="margin:0;color:#9aa2ad;font-size:11px;">Gobi Partners — Partnership Portal</p>
  </div>
</div>
</body></html>`;

  return { subject, plain, html };
}

export function ApprovalEmailDialog({ advisor, open, onOpenChange }: {
  advisor: AdvisorWithRoles;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { t, lang } = useLang();
  const { user } = useAuth();
  const { toast } = useToast();
  const { data: settings } = useQuery<{ cooEmail: string }>({ queryKey: ["/api/settings"], enabled: open });
  const cooEmail = (settings?.cooEmail ?? "").trim();

  const { subject, plain, html } = buildApprovalEmail(advisor, user?.name ?? "", lang, t);
  const mailtoHref = `mailto:${encodeURIComponent(cooEmail)}?cc=${encodeURIComponent(CC_EMAIL)}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(plain)}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`Subject: ${subject}\n\n${plain}`);
      toast({ description: t("copiedToClipboard") });
    } catch {
      toast({ description: "Copy failed", variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[88vh] overflow-y-auto" data-testid="dialog-approval-email">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-4 w-4 text-[hsl(var(--gold))]" /> {t("approvalEmailTitle")}
          </DialogTitle>
          <DialogDescription>{t("approvalEmailHint")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 pt-1">
          <div className="rounded-md bg-secondary/50 px-3 py-2 text-xs space-y-0.5" data-testid="text-email-headers">
            <p><span className="font-semibold text-muted-foreground">To:</span> {cooEmail || <span className="italic text-amber-600">—</span>}</p>
            <p><span className="font-semibold text-muted-foreground">Cc:</span> {CC_EMAIL}</p>
            <p><span className="font-semibold text-muted-foreground">Subject:</span> {subject}</p>
          </div>

          {!cooEmail && (
            <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400" data-testid="text-coo-missing">
              {t("cooEmailMissing")}
            </p>
          )}

          <iframe
            title="email-preview"
            srcDoc={html}
            className="h-96 w-full rounded-md border border-border bg-white"
            sandbox=""
            data-testid="iframe-email-preview"
          />

          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={copy} data-testid="button-copy-email">
              <Copy className="h-3.5 w-3.5 mr-1.5" /> {t("copyEmail")}
            </Button>
            <Button
              size="sm"
              className="bg-[hsl(193,52%,38%)] text-white hover:bg-[hsl(193,52%,30%)]"
              disabled={!cooEmail}
              onClick={() => { window.location.href = mailtoHref; }}
              data-testid="button-open-mail"
            >
              <Mail className="h-3.5 w-3.5 mr-1.5" /> {t("openInMail")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------- LinkedIn auto-sync ----------
export interface ExtractedAdvisor {
  name?: string | null;
  nameCn?: string | null;
  background?: string | null;
  domains?: string | null;
  cohort?: string | null;
  roles?: Array<{ title: string; organization?: string | null; isPrimary?: number }>;
}

export function LinkedinSyncControl({ url, onApply }: { url: string; onApply: (data: ExtractedAdvisor) => void }) {
  const { t } = useLang();
  const { toast } = useToast();
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");

  const extract = useMutation({
    mutationFn: async (body: { url?: string; text?: string }) => {
      const res = await apiRequest("POST", "/api/ai/advisor-extract", body);
      return res.json();
    },
    onSuccess: (data: ExtractedAdvisor) => {
      onApply(data);
      setPasteOpen(false);
      setPasteText("");
      toast({ description: t("linkedinSyncApplied") });
    },
    onError: (e: any) => {
      const msg = String(e?.message ?? e);
      if (msg.includes("fetchFailed") || msg.includes("422")) {
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
        disabled={!url.trim() || extract.isPending}
        onClick={() => extract.mutate({ url: url.trim() })}
        title={t("linkedinSyncHint")}
        data-testid="button-linkedin-sync"
      >
        {extract.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-1.5" />}
        {t("linkedinSync")}
      </Button>

      <Dialog open={pasteOpen} onOpenChange={setPasteOpen}>
        <DialogContent className="max-w-lg" data-testid="dialog-linkedin-paste">
          <DialogHeader>
            <DialogTitle>{t("linkedinPasteLabel")}</DialogTitle>
            <DialogDescription>{t("linkedinSyncFailed")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-1">
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
