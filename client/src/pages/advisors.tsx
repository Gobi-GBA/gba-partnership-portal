import { useMemo, useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useRoute } from "wouter";
import { Layout, MultiSelectFilter, PicChecklist, PartnerLogo, PicAvatars, AuditSection } from "@/components/shared";
import { useUnsavedGuard } from "@/components/unsaved-guard";
import { thankYou } from "@/components/thank-you";
import { useLang } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import type { AdvisorWithRoles, AdvisorRoleInput, Partnership, AdvisorRoleType, AdvisorTrack, Pillar, SectorTag, AdvisorLifecycle, FileAssetMeta } from "@shared/schema";
import { ADVISOR_ROLE_TYPES, ADVISOR_TRACKS, PILLARS, ADVISOR_LIFECYCLE } from "@shared/schema";
import { normalizeUrl } from "@shared/urls";
import {
  Users, Search, Plus, Pencil, Trash2, Star, ExternalLink, Linkedin,
  Building2, Mail, GraduationCap, Factory, Rocket, Sparkles, Check, X, ImagePlus,
  LayoutGrid, List, SlidersHorizontal, Send, Cake, CheckCircle2, Circle, Undo2,
  FileText, FileDown, Download, Loader2, Phone, MessageCircle, ChevronDown, Orbit, Upload,
} from "lucide-react";
import { AdvisorStarMap } from "@/components/network-graph";
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  MomentumDot, momentumOf, TagBadges, TagPicker, useSectorTags, ActivityTimeline,
  ApprovalEmailDialog, LinkedinSyncControl, formatBirthday, formatDMY, fileToBase64, type ExtractedAdvisor,
} from "@/components/advisor-crm";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { OutreachDialog } from "@/components/advisor-outreach";
import { downloadWithAuth, openHtmlWithAuth, preopenTab } from "@/lib/download";
import { cn } from "@/lib/utils";

// ---------- Grouping (v5.9) ----------
type GroupBy = "none" | "pillar" | "tag" | "lifecycle" | "track" | "cohort";
interface AdvisorGroup { key: string; label: string; items: AdvisorWithRoles[] }

// ---------- Pillar & track styling ----------
const PILLAR_STYLES: Record<Pillar, string> = {
  healthcare: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  ai: "bg-[hsl(193,52%,38%)]/15 text-[hsl(193,52%,30%)] dark:text-[hsl(193,60%,60%)] border-[hsl(193,52%,38%)]/30",
  industry40: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-400 border-indigo-500/30",
  esg: "bg-lime-600/15 text-lime-700 dark:text-lime-400 border-lime-600/30",
  spacetech: "bg-violet-500/15 text-violet-700 dark:text-violet-400 border-violet-500/30",
  consumer: "bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30",
  other: "bg-muted text-muted-foreground border-border",
};

const TRACK_ICONS: Record<AdvisorTrack, typeof GraduationCap> = {
  academic: GraduationCap,
  industry: Factory,
  entrepreneur: Rocket,
  hybrid: Sparkles,
};

// ---------- Client-side photo processing (HD + thumbnail from one upload) ----------
function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

function resizeToDataUri(img: HTMLImageElement, maxDim: number, quality: number): string {
  const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff"; // JPEG has no alpha — avoid black backgrounds on PNGs
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", quality);
}

export async function processAdvisorPhoto(file: File): Promise<{ hd: string; thumb: string }> {
  const img = await loadImage(file);
  return {
    hd: resizeToDataUri(img, 1200, 0.85),
    thumb: resizeToDataUri(img, 200, 0.8),
  };
}

// ---------- Small shared bits ----------
function AdvisorAvatar({ a, size = "md" }: { a: Pick<AdvisorWithRoles, "name" | "nameCn" | "photoThumbUrl">; size?: "md" | "lg" }) {
  const dim = size === "lg" ? "h-20 w-20 text-xl" : "h-14 w-14 text-base";
  if (a.photoThumbUrl) {
    return (
      <img
        src={a.photoThumbUrl}
        alt={a.name}
        loading="lazy"
        className={cn(dim, "shrink-0 rounded-full object-cover ring-2 ring-[hsl(var(--gold))]/30")}
      />
    );
  }
  const initials = a.name.split(/\s+/).map((s) => s[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div className={cn(dim, "shrink-0 rounded-full bg-secondary flex items-center justify-center font-bold text-[hsl(var(--gold))] ring-2 ring-[hsl(var(--gold))]/30")}>
      {initials}
    </div>
  );
}

function PillarBadge({ pillar }: { pillar: Pillar }) {
  const { t } = useLang();
  return (
    <Badge variant="outline" className={cn("text-[11px] font-semibold", PILLAR_STYLES[pillar] ?? PILLAR_STYLES.other)} data-testid={`badge-pillar-${pillar}`}>
      {t(`pillar_${pillar}` as any)}
    </Badge>
  );
}

// ---------- Lifecycle status (v5.8, restyled v5.9) ----------
// Deliberately unlike the sector tags: transparent background, status-coloured
// outline and a leading dot, so the lifecycle state reads as record status
// rather than as another taxonomy chip.
const LIFECYCLE_OUTLINE: Record<string, string> = {
  proposed: "border-slate-400/70 text-slate-600 dark:border-slate-500/70 dark:text-slate-300",
  onboarded: "border-emerald-500/70 text-emerald-700 dark:text-emerald-400",
  terminated: "border-rose-500/70 text-rose-700 dark:text-rose-400",
};

const LIFECYCLE_DOT: Record<string, string> = {
  proposed: "bg-slate-400",
  onboarded: "bg-emerald-500",
  terminated: "bg-rose-500",
};

function LifecyclePill({ status, advisorId, className }: { status: string; advisorId?: number; className?: string }) {
  const { t } = useLang();
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border bg-transparent px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        LIFECYCLE_OUTLINE[status] ?? LIFECYCLE_OUTLINE.proposed,
        className,
      )}
      data-testid={advisorId ? `badge-lifecycle-${advisorId}` : "badge-lifecycle"}
    >
      <span aria-hidden className={cn("h-1.5 w-1.5 shrink-0 rounded-full", LIFECYCLE_DOT[status] ?? LIFECYCLE_DOT.proposed)} />
      {t(`lifecycle_${status}` as any)}
    </span>
  );
}

// ---------- Mobile country codes (v5.9) ----------
const MOBILE_CODES: Array<{ code: string; region: string }> = [
  { code: "+852", region: "HK" },
  { code: "+86", region: "CN" },
  { code: "+853", region: "MO" },
  { code: "+886", region: "TW" },
  { code: "+65", region: "SG" },
  { code: "+60", region: "MY" },
  { code: "+62", region: "ID" },
  { code: "+66", region: "TH" },
  { code: "+84", region: "VN" },
  { code: "+63", region: "PH" },
  { code: "+81", region: "JP" },
  { code: "+82", region: "KR" },
  { code: "+91", region: "IN" },
  { code: "+971", region: "UAE" },
  { code: "+966", region: "KSA" },
  { code: "+1", region: "US/CA" },
  { code: "+44", region: "UK" },
  { code: "+33", region: "FR" },
  { code: "+49", region: "DE" },
  { code: "+61", region: "AU" },
];

const DEFAULT_MOBILE_CC = "+852";
const MAX_MOBILES = 3;
type MobileDraft = { cc: string; number: string };

/** Split a stored "+852 9123 4567" into picker + number. Unknown codes fall back to the default. */
function parseMobile(value: string | null | undefined): { cc: string; number: string } {
  const raw = (value ?? "").trim();
  if (!raw) return { cc: DEFAULT_MOBILE_CC, number: "" };
  const match = MOBILE_CODES
    .filter((c) => raw.startsWith(c.code))
    .sort((a, b) => b.code.length - a.code.length)[0];
  if (match) return { cc: match.code, number: raw.slice(match.code.length).trim() };
  return { cc: DEFAULT_MOBILE_CC, number: raw };
}

function joinMobile(cc: string, number: string): string | null {
  const n = number.trim();
  return n ? `${cc} ${n}` : null;
}

function mobileDrafts(values: string[] | null | undefined, legacy: string | null | undefined): MobileDraft[] {
  const stored = values?.length ? values : legacy ? [legacy] : [];
  const rows = stored.slice(0, MAX_MOBILES).map(parseMobile);
  return rows.length > 0 ? rows : [{ cc: DEFAULT_MOBILE_CC, number: "" }];
}

function joinedMobiles(rows: MobileDraft[]): string[] {
  return Array.from(new Set(rows.map((row) => joinMobile(row.cc, row.number)).filter((value): value is string => !!value)));
}

// ---------- Form section wrapper (v5.9) ----------
function FormSection({ id, step, title, children }: { id: string; step: number; title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-lg border border-border p-3" data-testid={`section-adv-${id}`}>
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-[hsl(var(--gold))]/15 text-[10px] font-bold text-[hsl(var(--gold))]">
          {step}
        </span>
        {title}
      </p>
      {children}
    </section>
  );
}

// ---------- Onboarding workflow tracker (v5.8) ----------
type WorkflowStage = "approval_emailed" | "approved" | "letter_issued" | "signed_back";

const WORKFLOW_STEPS: Array<{
  stage: WorkflowStage;
  field: "approvalEmailedAt" | "approvedAt" | "letterIssuedAt" | "signedBackAt";
  labelKey: "wfApprovalEmailed" | "wfApproved" | "wfLetterIssued" | "wfSignedBack";
  adminOnly: boolean;
}> = [
  { stage: "approval_emailed", field: "approvalEmailedAt", labelKey: "wfApprovalEmailed", adminOnly: false },
  { stage: "approved", field: "approvedAt", labelKey: "wfApproved", adminOnly: true },
  { stage: "letter_issued", field: "letterIssuedAt", labelKey: "wfLetterIssued", adminOnly: true },
  { stage: "signed_back", field: "signedBackAt", labelKey: "wfSignedBack", adminOnly: false },
];

function WorkflowTracker({ a, isAdmin }: { a: AdvisorWithRoles; isAdmin: boolean }) {
  const { t } = useLang();
  const { toast } = useToast();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/advisors"] });
    queryClient.invalidateQueries({ queryKey: ["/api/advisors", a.id] });
    queryClient.invalidateQueries({ queryKey: ["/api/advisors", a.id, "activities"] });
  };

  const advance = useMutation({
    mutationFn: async (body: { stage: WorkflowStage; undo?: boolean }) => {
      const res = await apiRequest("POST", `/api/advisors/${a.id}/workflow`, body);
      return res.json();
    },
    onSuccess: invalidate,
    onError: (e: any) => toast({ description: String(e?.message ?? e), variant: "destructive" }),
  });

  const letter = useMutation({
    mutationFn: async (target: Window | null) => {
      const opened = await openHtmlWithAuth(`/api/advisors/${a.id}/invitation-letter`, target);
      if (!opened) throw new Error(t("wfLetterFailed"));
      const res = await apiRequest("POST", `/api/advisors/${a.id}/workflow`, { stage: "letter_issued" });
      return res.json();
    },
    onSuccess: invalidate,
    onError: (e: any) => toast({ description: String(e?.message ?? e), variant: "destructive" }),
  });

  // v5.10 — same letter as an editable Word document; also records the letter stage
  const letterDocx = useMutation({
    mutationFn: async () => {
      await downloadWithAuth(`/api/advisors/${a.id}/invitation-letter.docx`, `Gobi-Advisory-Network-Letter.docx`);
      const res = await apiRequest("POST", `/api/advisors/${a.id}/workflow`, { stage: "letter_issued" });
      return res.json();
    },
    onSuccess: invalidate,
    onError: (e: any) => toast({ description: String(e?.message ?? e), variant: "destructive" }),
  });

  // v6.04 — signed letter filing: the letter document itself is stored for record
  const letterInputRef = useRef<HTMLInputElement>(null);
  const { data: letterFiles } = useQuery<FileAssetMeta[]>({
    queryKey: ["/api/advisors", a.id, "files", "letter"],
    queryFn: async () => (await apiRequest("GET", `/api/advisors/${a.id}/files?type=letter`)).json(),
  });
  const uploadLetter = useMutation({
    mutationFn: async (file: File) => {
      const data = await fileToBase64(file);
      const res = await apiRequest("POST", `/api/advisors/${a.id}/files`, {
        type: "letter", filename: file.name, mime: file.type || "application/pdf", data,
      });
      return res.json();
    },
    onSuccess: () => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: ["/api/advisors", a.id, "files"] });
      toast({ description: t("letterFiled") });
    },
    onError: (e: any) => toast({ description: String(e?.message ?? e), variant: "destructive" }),
  });

  const doneAt = (field: (typeof WORKFLOW_STEPS)[number]["field"]) => a[field] ?? null;
  // The most recently completed step is the only one that can be undone.
  let lastDone = -1;
  WORKFLOW_STEPS.forEach((s, i) => { if (doneAt(s.field)) lastDone = i; });

  return (
    <div className="rounded-lg border border-border p-3" data-testid="workflow-tracker">
      <p className="mb-3 text-xs font-semibold text-muted-foreground">{t("wfTrackerTitle")}</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
        {WORKFLOW_STEPS.map((s, i) => {
          const done = doneAt(s.field);
          const canAct = !s.adminOnly || isAdmin;
          return (
            <div key={s.stage} className="flex min-w-0 flex-col gap-1.5 rounded-md bg-secondary/40 p-2" data-testid={`workflow-step-${s.stage}`}>
              <div className="flex items-start gap-1.5">
                {done ? (
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                ) : (
                  <Circle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
                )}
                <div className="min-w-0">
                  <p className={cn("text-[11px] font-semibold leading-snug", !done && "text-muted-foreground")}>{t(s.labelKey)}</p>
                  <p className="text-[10px] text-muted-foreground tabular-nums" data-testid={`text-workflow-date-${s.stage}`}>
                    {done ? formatDMY(String(done).slice(0, 10)) : t("wfPending")}
                  </p>
                </div>
              </div>
              <div className="flex min-w-0 flex-col items-stretch gap-1">
                {!done && canAct && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-auto min-h-6 min-w-0 max-w-full whitespace-normal px-2 py-1 text-left text-[10px] leading-tight"
                    disabled={advance.isPending}
                    onClick={() => advance.mutate({ stage: s.stage })}
                    data-testid={`button-workflow-done-${s.stage}`}
                  >
                    {t("wfMarkDone")}
                  </Button>
                )}
                {done && isAdmin && i === lastDone && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-auto min-h-6 min-w-0 max-w-full whitespace-normal px-2 py-1 text-left text-[10px] leading-tight"
                    disabled={advance.isPending}
                    onClick={() => advance.mutate({ stage: s.stage, undo: true })}
                    data-testid={`button-workflow-undo-${s.stage}`}
                  >
                    <Undo2 className="mr-1 h-3 w-3" /> {t("wfUndo")}
                  </Button>
                )}
                {s.stage === "signed_back" && canAct && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-auto min-h-6 min-w-0 max-w-full whitespace-normal px-2 py-1 text-left text-[10px] leading-tight"
                    disabled={uploadLetter.isPending}
                    onClick={() => letterInputRef.current?.click()}
                    data-testid="button-upload-letter"
                  >
                    {uploadLetter.isPending ? <Loader2 className="h-3 w-3 shrink-0 animate-spin" /> : <Upload className="h-3 w-3 shrink-0" />}
                    <span className="min-w-0 break-words">{t("uploadSignedLetter")}</span>
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* v6.04 — filed signed letters (hidden input + download chips) */}
      <input
        ref={letterInputRef}
        type="file"
        accept=".pdf,.docx,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="hidden"
        data-testid="input-letter-file"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          if (f.size > 10 * 1024 * 1024) {
            toast({ description: t("fileTooLarge"), variant: "destructive" });
            return;
          }
          uploadLetter.mutate(f);
        }}
      />
      {(letterFiles ?? []).length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5" data-testid="row-letter-files">
          {(letterFiles ?? []).map((f) => (
            <button
              key={f.id}
              type="button"
              className="inline-flex items-center gap-1.5 rounded-md bg-secondary px-2 py-1 text-[11px] hover:bg-secondary/70"
              onClick={() => downloadWithAuth(`/api/files/${f.id}/download`, f.filename)}
              title={t("download")}
              data-testid={`chip-letter-file-${f.id}`}
            >
              <FileText className="h-3 w-3 text-emerald-600" /> {f.filename}
            </button>
          ))}
        </div>
      )}

      {isAdmin && (
        <div className="mt-3 border-t border-border pt-3">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={letter.isPending}
            onClick={() => letter.mutate(preopenTab())}
            data-testid="button-issue-letter"
          >
            {letter.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <FileText className="mr-1.5 h-3.5 w-3.5" />}
            {t("wfGenerateLetter")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="ml-2"
            disabled={letterDocx.isPending}
            onClick={() => letterDocx.mutate()}
            data-testid="button-issue-letter-docx"
          >
            {letterDocx.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <FileDown className="mr-1.5 h-3.5 w-3.5" />}
            {t("wfLetterDocx")}
          </Button>
        </div>
      )}
    </div>
  );
}

// ---------- CSV export buttons (v5.8) ----------
export function ExportCsvButtons({ className }: { className?: string }) {
  const { t } = useLang();
  const { toast } = useToast();
  const [busy, setBusy] = useState<"advisors" | "partners" | null>(null);

  const run = async (kind: "advisors" | "partners") => {
    setBusy(kind);
    try {
      await downloadWithAuth(`/api/export/${kind}.csv`, `gobi-${kind}.csv`);
    } catch (e: any) {
      toast({ description: `${t("exportFailed")} — ${String(e?.message ?? e)}`, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      <Button type="button" size="sm" variant="outline" disabled={busy !== null} onClick={() => run("advisors")} data-testid="button-export-advisors">
        {busy === "advisors" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Download className="mr-1.5 h-3.5 w-3.5" />}
        {t("exportAdvisorsCsv")}
      </Button>
      <Button type="button" size="sm" variant="outline" disabled={busy !== null} onClick={() => run("partners")} data-testid="button-export-partners">
        {busy === "partners" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Download className="mr-1.5 h-3.5 w-3.5" />}
        {t("exportPartnersCsv")}
      </Button>
    </div>
  );
}

// ---------- Add / edit form ----------
type RoleDraft = AdvisorRoleInput & { key: number };

const EMPTY_FORM = {
  name: "", nameCn: "", advisorType: "honourary_advisor" as AdvisorRoleType, track: "industry" as AdvisorTrack,
  pillar: "other" as Pillar, emailsText: "", domains: "", background: "", profileUrl: "", linkedinUrl: "",
  cohort: "", engagement: "", gobiPics: [] as string[], photoUrl: "", photoThumbUrl: "",
  publicClearance: false, birthDay: "", birthMonth: "", birthYear: "", tagIds: [] as number[],
  // v5.9/v6.07 CRM additions
  mobiles: [{ cc: DEFAULT_MOBILE_CC, number: "" }] as MobileDraft[], wechatId: "", originStaff: [] as string[],
};

// v5.15 — unified organization picker: one searchable combobox (shadcn Command)
// that sets both the display text and the partner link. Free text stays possible;
// unknown orgs can be created as new partner records in one click.
const ORG_FILTER_STOP = ["the", "of", "and", "for", "at", "in", "a", "an"];
// Custom cmdk filter: substring match plus acronym support so "HKU" finds
// "The University of Hong Kong" (initials uhk — word-order-free comparison).
function orgFilter(value: string, search: string): number {
  const v = value.toLowerCase();
  const s = search.toLowerCase().trim();
  if (!s) return 1;
  if (v.includes(s)) return 1;
  const toks = v.split(/[^a-z0-9\u4e00-\u9fff]+/).filter((t) => t.length > 0 && !ORG_FILTER_STOP.includes(t));
  // Initials from latin tokens only — a CJK name token must not pollute the acronym
  const inits = toks.filter((t) => /^[a-z0-9]/.test(t)).map((t) => t[0]).join("");
  const sc = s.replace(/[^a-z0-9]/g, "");
  if (sc.length >= 2 && inits.includes(sc)) return 0.9;
  if (sc.length >= 3 && sc.length <= 6 && inits.length >= 3 &&
      sc.split("").sort().join("") === inits.split("").sort().join("")) return 0.8;
  return 0;
}

function OrgCombobox({ organization, partnershipId, partners, onPick, testId }: {
  organization: string;
  partnershipId: number | null;
  partners: Partnership[];
  onPick: (organization: string, partnershipId: number | null) => void;
  testId: string;
}) {
  const { t, lang } = useLang();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const pname = (p: Partnership) => (lang === "cn" && p.nameCn ? p.nameCn : p.nameEn);
  const linked = partnershipId ? partners.find((p) => p.id === partnershipId) : undefined;
  const create = useMutation({
    mutationFn: async (nameEn: string) => {
      const res = await apiRequest("POST", "/api/partnerships", {
        nameEn,
        startDate: new Date().toISOString().slice(0, 10),
        stage: "s1_new",
        collabLevel: 1,
        category: "other",
        region: "hongkong",
      });
      return res.json();
    },
    onSuccess: (p: Partnership) => {
      queryClient.invalidateQueries({ queryKey: ["/api/partnerships"] });
      onPick(p.nameEn, p.id);
      toast({ description: t("orgCreated") });
      setOpen(false);
      setQ("");
    },
    onError: (e: any) => toast({ description: String(e?.message ?? e), variant: "destructive" }),
  });
  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQ(""); }}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" role="combobox" aria-expanded={open}
          className="h-9 w-full justify-between px-3 font-normal" data-testid={testId}>
          <span className={cn("flex items-center gap-1.5 truncate", !organization && !linked && "text-muted-foreground")}>
            {linked ? (
              <>
                <Building2 className="h-3.5 w-3.5 shrink-0 text-[hsl(var(--gold))]" />
                <span className="truncate">{pname(linked)}</span>
              </>
            ) : (organization || t("roleOrg"))}
          </span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-0" align="start">
        <Command filter={orgFilter}>
          <CommandInput placeholder={t("orgSearchPlaceholder")} value={q} onValueChange={setQ} data-testid={`${testId}-search`} />
          <CommandList className="max-h-56">
            <CommandEmpty>{t("orgNoMatch")}</CommandEmpty>
            {q.trim().length > 0 && (
              <CommandGroup>
                <CommandItem value={`__text__ ${q}`} data-testid={`${testId}-use-text`}
                  onSelect={() => { onPick(q.trim(), null); setOpen(false); setQ(""); }}>
                  <Pencil className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
                  <span className="truncate">{t("orgUseAsText")} “{q.trim()}”</span>
                </CommandItem>
                <CommandItem value={`__create__ ${q}`} disabled={create.isPending} data-testid={`${testId}-create`}
                  onSelect={() => create.mutate(q.trim())}>
                  {create.isPending
                    ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                    : <Plus className="mr-2 h-3.5 w-3.5 text-muted-foreground" />}
                  <span className="truncate">{t("orgCreateNew")} “{q.trim()}”</span>
                </CommandItem>
              </CommandGroup>
            )}
            <CommandGroup>
              {linked && (
                <CommandItem value="__unlink__" data-testid={`${testId}-unlink`}
                  onSelect={() => { onPick(organization, null); setOpen(false); }}>
                  <X className="mr-2 h-3.5 w-3.5 text-muted-foreground" /> {t("roleNone")}
                </CommandItem>
              )}
              {partners.map((p) => {
                const parent = p.parentId ? partners.find((x) => x.id === p.parentId) : undefined;
                return (
                  <CommandItem key={p.id} value={`${p.nameEn} ${p.nameCn ?? ""}`} data-testid={`${testId}-opt-${p.id}`}
                    onSelect={() => { onPick(pname(p), p.id); setOpen(false); setQ(""); }}>
                    <Check className={cn("mr-2 h-3.5 w-3.5", partnershipId === p.id ? "opacity-100" : "opacity-0")} />
                    <span className="truncate">{pname(p)}</span>
                    {parent && <span className="ml-1.5 truncate text-[11px] text-muted-foreground">· {pname(parent)}</span>}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function AdvisorFormDialog({
  open, onOpenChange, editing, partnerships,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  editing: AdvisorWithRoles | null;
  partnerships: Partnership[];
}) {
  const { t, lang } = useLang();
  const { user } = useAuth();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [roles, setRoles] = useState<RoleDraft[]>([]);
  const [photoBusy, setPhotoBusy] = useState(false);
  const keyRef = useRef(1);
  const [loadedFor, setLoadedFor] = useState<number | "new" | null>(null);
  const [advSnapshot, setAdvSnapshot] = useState<string | null>("");
  // v6.05 — step-0 source chooser (new records only) + paste-dialog trigger
  const [chooserDone, setChooserDone] = useState(false);
  const [pasteSignal, setPasteSignal] = useState(0);
  const profileUrlRef = useRef<HTMLInputElement>(null);

  // Seed the form when the dialog opens (edit uses the detail endpoint for the HD photo)
  const { data: fullEditing } = useQuery<AdvisorWithRoles>({
    queryKey: ["/api/advisors", editing?.id ?? 0],
    enabled: open && !!editing,
  });
  const target = editing ? fullEditing : null;
  const wantKey: number | "new" = editing ? editing.id : "new";
  if (open && loadedFor !== wantKey && (!editing || target)) {
    setLoadedFor(wantKey);
    if (target) {
      setForm({
        name: target.name, nameCn: target.nameCn ?? "", advisorType: target.advisorType as AdvisorRoleType,
        track: target.track as AdvisorTrack, pillar: target.pillar as Pillar,
        emailsText: (target.emails ?? []).join(", "), domains: target.domains ?? "",
        background: target.background ?? "", profileUrl: target.profileUrl || target.linkedinUrl || "",
        linkedinUrl: target.linkedinUrl ?? "", cohort: target.cohort ?? "",
        engagement: target.engagement ?? "", gobiPics: target.gobiPics ?? [],
        photoUrl: target.photoUrl ?? "", photoThumbUrl: target.photoThumbUrl ?? "",
        publicClearance: target.publicClearance === 1,
        birthDay: target.birthDay ? String(target.birthDay) : "",
        birthMonth: target.birthMonth ? String(target.birthMonth) : "",
        birthYear: target.birthYear ? String(target.birthYear) : "",
        tagIds: (target.tags ?? []).map((tg) => tg.id),
        mobiles: mobileDrafts(target.mobiles, target.mobile),
        wechatId: target.wechatId ?? "",
        originStaff: target.originStaff ?? [],
      });
      setRoles((target.roles ?? []).map((r) => ({ key: keyRef.current++, title: r.title, organization: r.organization ?? "", partnershipId: r.partnershipId, isPrimary: r.isPrimary })));
    } else {
      setForm(EMPTY_FORM);
      setRoles([{ key: keyRef.current++, title: "", organization: "", partnershipId: null, isPrimary: 1 }]);
      setChooserDone(false);
    }
    setAdvSnapshot(null); // re-baselined on the next render, after both states settle
  }
  if (!open && loadedFor !== null) setLoadedFor(null);

  // v6.01 — dirty tracking: fingerprint of form + roles (role keys are transient)
  const advFingerprint = JSON.stringify({ form, roles: roles.map(({ key, ...r }) => r) });
  if (open && advSnapshot === null) setAdvSnapshot(advFingerprint);
  const advDirty = open && !!advSnapshot && advFingerprint !== advSnapshot;
  const { requestClose, guard } = useUnsavedGuard({
    dirty: advDirty,
    onDiscard: () => onOpenChange(false),
    onSave: () => save.mutate(),
  });

  const partnerName = (p: Partnership) => (lang === "cn" && p.nameCn ? p.nameCn : p.nameEn);
  const sortedPartners = useMemo(
    () => partnerships.slice().sort((a, b) => partnerName(a).localeCompare(partnerName(b))),
    [partnerships, lang],
  );

  const save = useMutation({
    mutationFn: async () => {
      const mobiles = joinedMobiles(form.mobiles);
      const payload = {
        name: form.name.trim(),
        nameCn: form.nameCn.trim() || null,
        advisorType: form.advisorType,
        track: form.track,
        pillar: form.pillar,
        emails: form.emailsText.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean),
        domains: form.domains.trim() || null,
        background: form.background.trim() || null,
        photoUrl: form.photoUrl || null,
        photoThumbUrl: form.photoThumbUrl || null,
        profileUrl: form.profileUrl.trim() || null,
        // Single profile link now; keep linkedinUrl consistent for legacy records
        linkedinUrl: form.linkedinUrl.trim()
          || (/linkedin\.com/i.test(form.profileUrl.trim()) ? form.profileUrl.trim() : null),
        gobiPics: form.gobiPics,
        // v5.9 — staff-only CRM fields; origin staff is a permanent sourcing record
        mobiles,
        mobile: mobiles[0] ?? null,
        wechatId: form.wechatId.trim() || null,
        originStaff: form.originStaff.length > 0 ? form.originStaff : null,
        cohort: form.cohort.trim() || null,
        engagement: form.engagement.trim() || null,
        publicClearance: form.publicClearance ? 1 : 0,
        birthDay: form.birthDay ? Number(form.birthDay) : null,
        birthMonth: form.birthMonth ? Number(form.birthMonth) : null,
        birthYear: form.birthYear ? Number(form.birthYear) : null,
        tagIds: form.tagIds,
        roles: roles
          .filter((r) => r.title.trim())
          .map((r) => ({ title: r.title.trim(), organization: (r.organization ?? "").toString().trim() || null, partnershipId: r.partnershipId ?? null, isPrimary: r.isPrimary ?? 0 })),
      };
      const res = editing
        ? await apiRequest("PATCH", `/api/advisors/${editing.id}`, payload)
        : await apiRequest("POST", "/api/advisors", payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/advisors"] });
      toast({ description: user?.role === "admin" || editing ? t("advisorSaved") : t("advisorSubmitted") });
      onOpenChange(false);
      thankYou();
    },
    onError: (e: any) => toast({ description: String(e?.message ?? e), variant: "destructive" }),
  });

  const onPhoto = async (file: File | undefined) => {
    if (!file) return;
    setPhotoBusy(true);
    try {
      const { hd, thumb } = await processAdvisorPhoto(file);
      setForm((f) => ({ ...f, photoUrl: hd, photoThumbUrl: thumb }));
    } finally {
      setPhotoBusy(false);
    }
  };

  const set = (k: keyof typeof EMPTY_FORM) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <Dialog open={open} onOpenChange={(o) => { if (o) onOpenChange(true); else requestClose(); }}>
      <DialogContent className="min-w-0 max-w-2xl max-h-[88vh] overflow-y-auto [&>*]:min-w-0" data-testid="dialog-advisor-form">
        <DialogHeader>
          {/* v5.14 — auto-sync is a record-level action (it harvests the profile
              URL, LinkedIn URL and identity fields together), so it lives in the
              dialog's top-right corner rather than next to a single field. */}
          <div className="flex items-start justify-between gap-3 pr-8">
            <div className="space-y-1.5">
              <DialogTitle>{editing ? t("editAdvisor") : t("addAdvisor")}</DialogTitle>
              <DialogDescription>{t("rolesHint")}</DialogDescription>
            </div>
            <div className="flex shrink-0 gap-2">
              <LinkedinSyncControl
                url={form.profileUrl}
                advisorId={editing?.id ?? null}
                identity={{ name: form.name, nameCn: form.nameCn, linkedinUrl: form.linkedinUrl, emails: form.emailsText }}
                openPasteSignal={pasteSignal}
                onApply={(d: ExtractedAdvisor) => {
                  setChooserDone(true);
                  setForm((f) => ({
                    ...f,
                    name: d.name?.trim() || f.name,
                    nameCn: d.nameCn?.trim() || f.nameCn,
                    background: d.background?.trim() || f.background,
                    domains: d.domains?.trim() || f.domains,
                    cohort: d.cohort?.trim() || f.cohort,
                    photoUrl: d.photoUrl?.trim() || f.photoUrl,
                    photoThumbUrl: d.photoUrl?.trim() || f.photoThumbUrl,
                  }));
                  if (d.roles && d.roles.length > 0) {
                    setRoles(d.roles.map((r, i) => ({
                      key: keyRef.current++,
                      title: r.title,
                      organization: r.organization ?? "",
                      partnershipId: null,
                      isPrimary: r.isPrimary ?? (i === 0 ? 1 : 0),
                    })));
                  }
                }}
              />
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          {/* v6.05 — step 0: source chooser for brand-new records */}
          {!editing && !chooserDone && (
            <div className="rounded-lg border border-[hsl(var(--aqua))]/40 bg-[hsl(var(--aqua))]/5 p-3 space-y-2" data-testid="panel-source-chooser">
              <p className="text-sm font-semibold">{t("chooserTitle")}</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <Button type="button" variant="outline" size="sm" className="justify-start min-w-0" data-testid="button-chooser-paste"
                  onClick={() => { setChooserDone(true); setPasteSignal((n) => n + 1); }}>
                  <FileText className="h-3.5 w-3.5 mr-1.5 shrink-0" /> <span className="truncate">{t("chooserPaste")}</span>
                </Button>
                <Button type="button" variant="outline" size="sm" className="justify-start min-w-0" data-testid="button-chooser-link"
                  onClick={() => { setChooserDone(true); setTimeout(() => profileUrlRef.current?.focus(), 50); }}>
                  <Linkedin className="h-3.5 w-3.5 mr-1.5 shrink-0" /> <span className="truncate">{t("chooserLink")}</span>
                </Button>
                <Button type="button" variant="outline" size="sm" className="justify-start min-w-0" data-testid="button-chooser-manual"
                  onClick={() => setChooserDone(true)}>
                  <Pencil className="h-3.5 w-3.5 mr-1.5 shrink-0" /> <span className="truncate">{t("chooserManual")}</span>
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">{t("chooserHint")}</p>
            </div>
          )}

          {/* 1. Source — the profile link comes first so auto-sync (top right)
              has material to harvest. */}
          <FormSection id="source" step={1} title={t("advSectionSource")}>
            <div className="space-y-1">
              <Label>{t("advisorProfileUrl")}</Label>
              <Input ref={profileUrlRef} value={form.profileUrl} onChange={set("profileUrl")}
                onBlur={() => setForm((f) => ({ ...f, profileUrl: normalizeUrl(f.profileUrl) || f.profileUrl }))}
                placeholder={t("advisorProfileUrlPlaceholder")} data-testid="input-adv-profile-url" />
              <p className="text-[11px] text-muted-foreground">{t("linkedinSyncHint")}</p>
            </div>
            <div className="space-y-1">
              <Label>LinkedIn URL</Label>
              <Input value={form.linkedinUrl} onChange={set("linkedinUrl")}
                onBlur={() => setForm((f) => ({ ...f, linkedinUrl: normalizeUrl(f.linkedinUrl) || f.linkedinUrl }))}
                placeholder="https://www.linkedin.com/in/…" data-testid="input-adv-linkedin-url" />
            </div>
          </FormSection>

          {/* 2. Contact */}
          <FormSection id="contact" step={2} title={t("advSectionContact")}>
            <div className="space-y-1">
              <Label>{t("advisorEmails")}</Label>
              <Input value={form.emailsText} onChange={set("emailsText")} data-testid="input-adv-emails" />
            </div>
            <div className="space-y-1">
              <Label>{t("advisorMobile")}</Label>
              <div className="space-y-2">
                {form.mobiles.map((mobile, index) => (
                  <div key={index} className="flex min-w-0 gap-2" data-testid={`mobile-row-${index}`}>
                    <Select
                      value={mobile.cc}
                      onValueChange={(value) => setForm((current) => ({
                        ...current,
                        mobiles: current.mobiles.map((row, rowIndex) => rowIndex === index ? { ...row, cc: value } : row),
                      }))}
                    >
                      <SelectTrigger
                        className="w-32 shrink-0 sm:w-40"
                        aria-label={`${t("advisorMobileCc")} ${index + 1}`}
                        data-testid={index === 0 ? "select-mobile-cc" : `select-mobile-cc-${index}`}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="max-h-64">
                        {MOBILE_CODES.map((c) => (
                          <SelectItem key={c.code} value={c.code}>{c.code} {c.region}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      className="min-w-0"
                      value={mobile.number}
                      onChange={(event) => {
                        const number = event.target.value;
                        setForm((current) => ({
                          ...current,
                          mobiles: current.mobiles.map((row, rowIndex) => rowIndex === index ? { ...row, number } : row),
                        }));
                      }}
                      inputMode="tel"
                      placeholder="9123 4567"
                      aria-label={`${t("advisorMobile")} ${index + 1}`}
                      data-testid={index === 0 ? "input-mobile" : `input-mobile-${index}`}
                    />
                    {index > 0 && (
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="shrink-0"
                        aria-label={t("advisorMobileRemove")}
                        title={t("advisorMobileRemove")}
                        onClick={() => setForm((current) => ({
                          ...current,
                          mobiles: current.mobiles.filter((_, rowIndex) => rowIndex !== index),
                        }))}
                        data-testid={`button-remove-mobile-${index}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
                {form.mobiles.length < MAX_MOBILES && (
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    aria-label={t("advisorMobileAdd")}
                    title={t("advisorMobileAdd")}
                    onClick={() => setForm((current) => ({
                      ...current,
                      mobiles: [...current.mobiles, {
                        cc: current.mobiles[current.mobiles.length - 1]?.cc ?? DEFAULT_MOBILE_CC,
                        number: "",
                      }],
                    }))}
                    data-testid="button-add-mobile"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">{t("advisorMobileHint")}</p>
            </div>
            <div className="space-y-1">
              <Label>{t("advisorWechat")}</Label>
              <Input value={form.wechatId} onChange={set("wechatId")} data-testid="input-wechat" />
            </div>
          </FormSection>

          {/* 3. Identity */}
          <FormSection id="identity" step={3} title={t("advSectionIdentity")}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className={cn("space-y-1", !form.name.trim() && "rounded-md p-2 -m-1 ring-2 ring-amber-400/70 bg-amber-400/10")} data-testid="field-adv-name">
                <Label>
                  {t("advisorNameEn")} <span className="text-amber-600 dark:text-amber-400">*</span>
                  {!form.name.trim() && <span className="ml-1 text-[11px] font-medium text-amber-600 dark:text-amber-400">({t("requiredHint")})</span>}
                </Label>
                <Input value={form.name} onChange={set("name")} data-testid="input-adv-name" />
              </div>
              <div className="space-y-1">
                <Label>{t("advisorNameCn")}</Label>
                <Input value={form.nameCn} onChange={set("nameCn")} data-testid="input-adv-name-cn" />
              </div>
            </div>
            <div className="flex items-center gap-4">
              <AdvisorAvatar a={{ name: form.name || "?", nameCn: null, photoThumbUrl: form.photoThumbUrl || null }} size="lg" />
              <div className="space-y-1.5">
                <input ref={fileRef} type="file" accept="image/*" className="hidden" data-testid="input-advisor-photo"
                  onChange={(e) => onPhoto(e.target.files?.[0])} />
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant="outline" disabled={photoBusy} onClick={() => fileRef.current?.click()} data-testid="button-upload-photo">
                    <ImagePlus className="h-3.5 w-3.5 mr-1.5" /> {photoBusy ? "…" : t("advisorPhoto")}
                  </Button>
                  {form.photoThumbUrl && (
                    <Button type="button" size="sm" variant="ghost" onClick={() => setForm((f) => ({ ...f, photoUrl: "", photoThumbUrl: "" }))} data-testid="button-remove-photo">
                      <X className="h-3.5 w-3.5 mr-1" /> {t("advisorPhotoRemove")}
                    </Button>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground">{t("advisorPhotoHint")}</p>
              </div>
            </div>
            <div className="space-y-1">
              <Label>{t("advisorBackground")}</Label>
              <Textarea rows={4} value={form.background} onChange={set("background")} data-testid="input-adv-background" />
            </div>
          </FormSection>

          {/* 4. Roles */}
          <FormSection id="roles" step={4} title={t("advSectionRoles")}>
            <div className="flex items-center justify-between">
              <Label className="font-semibold">{t("rolesLabel")}</Label>
              <Button type="button" size="sm" variant="outline" data-testid="button-add-role"
                onClick={() => setRoles((r) => [...r, { key: keyRef.current++, title: "", organization: "", partnershipId: null, isPrimary: r.length === 0 ? 1 : 0 }])}>
                <Plus className="h-3.5 w-3.5 mr-1" /> {t("roleAdd")}
              </Button>
            </div>
            {roles.map((r, i) => (
              <div key={r.key} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2 items-start rounded-md bg-secondary/40 p-2" data-testid={`row-role-${i}`}>
                <Input placeholder={t("roleTitle")} value={r.title} data-testid={`input-role-title-${i}`}
                  onChange={(e) => setRoles((rs) => rs.map((x) => (x.key === r.key ? { ...x, title: e.target.value } : x)))} />
                <OrgCombobox
                  organization={r.organization ?? ""}
                  partnershipId={r.partnershipId ?? null}
                  partners={sortedPartners}
                  onPick={(org, pid) => setRoles((rs) => rs.map((x) => (x.key === r.key ? { ...x, organization: org, partnershipId: pid } : x)))}
                  testId={`combo-role-org-${i}`}
                />
                <div className="flex items-center gap-1.5 pt-1.5">
                  <button type="button" title={t("rolePrimary")} data-testid={`button-role-primary-${i}`}
                    onClick={() => setRoles((rs) => rs.map((x) => ({ ...x, isPrimary: x.key === r.key ? 1 : 0 })))}
                    className="p-1">
                    <Star className={cn("h-4 w-4", r.isPrimary ? "fill-[hsl(var(--gold))] text-[hsl(var(--gold))]" : "text-muted-foreground")} />
                  </button>
                  <button type="button" data-testid={`button-role-remove-${i}`}
                    onClick={() => setRoles((rs) => rs.filter((x) => x.key !== r.key))} className="p-1">
                    <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                  </button>
                </div>
              </div>
            ))}
          </FormSection>

          {/* 5. Classification */}
          <FormSection id="classification" step={5} title={t("advSectionClassification")}>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>{t("advisorRoleLabel")}</Label>
                <Select value={form.advisorType} onValueChange={(v) => setForm((f) => ({ ...f, advisorType: v as AdvisorRoleType }))}>
                  <SelectTrigger data-testid="select-adv-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ADVISOR_ROLE_TYPES.map((r) => (
                      <SelectItem key={r} value={r}>{t(`advisorRole_${r}` as any)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>{t("trackLabel")}</Label>
                <Select value={form.track} onValueChange={(v) => setForm((f) => ({ ...f, track: v as AdvisorTrack }))}>
                  <SelectTrigger data-testid="select-adv-track"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ADVISOR_TRACKS.map((r) => (
                      <SelectItem key={r} value={r}>{t(`track_${r}` as any)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>{t("pillarLabel")}</Label>
                <Select value={form.pillar} onValueChange={(v) => setForm((f) => ({ ...f, pillar: v as Pillar }))}>
                  <SelectTrigger data-testid="select-adv-pillar"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PILLARS.map((r) => (
                      <SelectItem key={r} value={r}>{t(`pillar_${r}` as any)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label>{t("advisorDomains")}</Label>
              <Input value={form.domains} onChange={set("domains")} data-testid="input-adv-domains" />
            </div>
            <div className="space-y-1.5">
              <Label>{t("sectorTags")}</Label>
              <TagPicker selected={form.tagIds} onChange={(ids) => setForm((f) => ({ ...f, tagIds: ids }))} />
            </div>
          </FormSection>

          {/* 6. Internal */}
          <FormSection id="internal" step={6} title={t("advSectionInternal")}>
            <div className="space-y-1" data-testid="control-origin-staff">
              <Label>{t("originStaffLabel")}</Label>
              <PicChecklist
                value={form.originStaff}
                onChange={(v) => setForm((f) => ({ ...f, originStaff: v }))}
                testid="button-origin-staff-checklist"
                optionPrefix="origin-staff"
                placeholderKey="selectOriginStaff"
              />
              <p className="text-[11px] text-muted-foreground">{t("originStaffHint")}</p>
            </div>
            <div className="space-y-1">
              <Label>{t("currentPicLabel")}</Label>
              <PicChecklist value={form.gobiPics} onChange={(v) => setForm((f) => ({ ...f, gobiPics: v }))} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>{t("cohortLabel")}</Label>
                <Input value={form.cohort} onChange={set("cohort")} placeholder="2025" data-testid="input-adv-cohort" />
              </div>
              <div className="space-y-1">
                <Label>{t("birthdayLabel")}</Label>
                <div className="flex gap-2">
                  <Input className="w-20" inputMode="numeric" placeholder="DD" maxLength={2} value={form.birthDay} onChange={set("birthDay")} data-testid="input-adv-birth-day" />
                  <Input className="w-20" inputMode="numeric" placeholder="MM" maxLength={2} value={form.birthMonth} onChange={set("birthMonth")} data-testid="input-adv-birth-month" />
                  <Input className="w-28" inputMode="numeric" placeholder="YYYY" maxLength={4} value={form.birthYear} onChange={set("birthYear")} data-testid="input-adv-birth-year" />
                </div>
              </div>
            </div>
            <div className="space-y-1">
              <Label>{t("advisorEngagement")}</Label>
              <Textarea rows={2} value={form.engagement} onChange={set("engagement")} data-testid="input-adv-engagement" />
            </div>
            <div className="flex items-start gap-2 rounded-lg border border-border p-3">
              <Checkbox
                id="adv-clearance"
                checked={form.publicClearance}
                onCheckedChange={(v) => setForm((f) => ({ ...f, publicClearance: v === true }))}
                data-testid="checkbox-adv-clearance"
              />
              <div className="space-y-0.5">
                <Label htmlFor="adv-clearance" className="cursor-pointer">{t("publicClearance")}</Label>
                <p className="text-[11px] text-muted-foreground">{t("publicClearanceHint")}</p>
              </div>
            </div>
          </FormSection>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={requestClose} data-testid="button-cancel-advisor">{t("cancel")}</Button>
            <Button
              onClick={() => save.mutate()}
              disabled={!form.name.trim() || save.isPending}
              className="bg-[hsl(193,52%,38%)] text-white hover:bg-[hsl(193,52%,30%)]"
              data-testid="button-save-advisor"
            >
              {save.isPending ? "…" : t("save")}
            </Button>
          </div>
        </div>
        {guard}
      </DialogContent>
    </Dialog>
  );
}

// ---------- Detail dialog ----------
function AdvisorDetailDialog({
  id, onClose, onEdit, partnerships,
}: {
  id: number | null;
  onClose: () => void;
  onEdit: (a: AdvisorWithRoles) => void;
  partnerships: Partnership[];
}) {
  const { t, lang } = useLang();
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  // v5.12 — render instantly from the cached list row (thumbnail, roles, tags);
  // the detail fetch only tops up the HD photo when it arrives.
  const { data: a, isLoading } = useQuery<AdvisorWithRoles>({
    queryKey: ["/api/advisors", id ?? 0],
    enabled: id !== null,
    placeholderData: () =>
      queryClient
        .getQueryData<AdvisorWithRoles[]>(["/api/advisors"])
        ?.find((row) => row.id === id),
  });
  const isStaff = user?.role === "admin" || user?.role === "staff";
  const isAdmin = user?.role === "admin";

  // v6.04 — CVs filed against this advisor (staff only)
  const { data: cvFiles } = useQuery<FileAssetMeta[]>({
    queryKey: ["/api/advisors", id ?? 0, "files", "cv"],
    queryFn: async () => (await apiRequest("GET", `/api/advisors/${id}/files?type=cv`)).json(),
    enabled: id !== null && isStaff,
  });
  const [approvalOpen, setApprovalOpen] = useState(false);

  const setStatus = useMutation({
    mutationFn: async (status: "approved" | "rejected") => {
      const res = await apiRequest("PATCH", `/api/advisors/${id}`, { status });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/advisors"] });
      toast({ description: t("advisorSaved") });
    },
  });

  // v5.8 — lifecycle status (admin only; the server rejects other roles with 403)
  const setLifecycle = useMutation({
    mutationFn: async (lifecycleStatus: AdvisorLifecycle) => {
      const res = await apiRequest("POST", `/api/advisors/${id}/workflow`, { lifecycleStatus });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/advisors"] });
      queryClient.invalidateQueries({ queryKey: ["/api/advisors", id ?? 0] });
      queryClient.invalidateQueries({ queryKey: ["/api/advisors", id ?? 0, "activities"] });
      toast({ description: t("advisorSaved") });
    },
    onError: (e: any) => toast({ description: String(e?.message ?? e), variant: "destructive" }),
  });

  const del = useMutation({
    mutationFn: async () => apiRequest("DELETE", `/api/advisors/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/advisors"] });
      toast({ description: t("advisorDeleted") });
      onClose();
    },
  });

  const name = a ? (lang === "cn" && a.nameCn ? a.nameCn : a.name) : "";
  const altName = a ? (lang === "cn" ? a.name : a.nameCn) : null;
  const partnerOf = (pid: number | null) => (pid ? partnerships.find((p) => p.id === pid) : undefined);
  const TrackIcon = a ? TRACK_ICONS[a.track as AdvisorTrack] ?? Sparkles : Sparkles;

  return (
    <Dialog open={id !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="min-w-0 max-w-lg max-h-[85vh] overflow-y-auto [&>*]:min-w-0" data-testid="dialog-advisor-detail">
        {isLoading || !a ? (
          <div className="space-y-3 py-6">
            <Skeleton className="h-20 w-20 rounded-full" />
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-4 w-full" />
          </div>
        ) : (
          <>
            <DialogHeader>
              <div className="flex items-start gap-4">
                {a.photoUrl ? (
                  <img src={a.photoUrl} alt={a.name} className="h-20 w-20 shrink-0 rounded-full object-cover ring-2 ring-[hsl(var(--gold))]/40" data-testid="img-advisor-hd" />
                ) : (
                  <AdvisorAvatar a={a} size="lg" />
                )}
                <div className="min-w-0 pt-1">
                  <DialogTitle className="flex flex-wrap items-center gap-2 text-lg">
                    <span data-testid="text-advisor-name">{name}</span>
                    {a.status === "pending" && (
                      <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-600 text-[11px]">{t("advisorPendingBadge")}</Badge>
                    )}
                    <LifecyclePill status={a.lifecycleStatus} advisorId={a.id} />
                  </DialogTitle>
                  {altName && <DialogDescription>{altName}</DialogDescription>}
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Badge variant="outline" className="text-[11px] font-semibold border-[hsl(var(--gold))]/40 bg-[hsl(var(--gold))]/10 text-[hsl(var(--gold))]">
                      {t(`advisorRole_${a.advisorType}` as any)}
                    </Badge>
                    <PillarBadge pillar={a.pillar as Pillar} />
                    <Badge variant="outline" className="text-[11px] gap-1">
                      <TrackIcon className="h-3 w-3" /> {t(`track_${a.track}` as any)}
                    </Badge>
                    {a.cohort && <Badge variant="outline" className="text-[11px]">{t("cohortLabel")} {a.cohort}</Badge>}
                    {isStaff && (
                      a.publicClearance === 1 ? (
                        <Badge variant="outline" className="text-[11px] border-emerald-500/40 bg-emerald-500/10 text-emerald-600" data-testid="badge-clearance-yes">
                          {t("publicClearanceYes")}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[11px] text-muted-foreground" data-testid="badge-clearance-no">
                          {t("publicClearanceNo")}
                        </Badge>
                      )
                    )}
                  </div>
                  <TagBadges tags={a.tags} className="mt-2" />
                </div>
              </div>
            </DialogHeader>

            <div className="space-y-4 pt-1">
              {/* Admin / owner actions */}
              {isStaff && (
                <div className="flex flex-wrap items-center gap-2 border-b border-border pb-3">
                  {(isAdmin || (a.submittedBy === user?.id && a.status === "pending")) && (
                    <Button size="sm" variant="outline" onClick={() => onEdit(a)} data-testid="button-edit-advisor">
                      <Pencil className="h-3.5 w-3.5 mr-1.5" /> {t("editAdvisor")}
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => setApprovalOpen(true)} data-testid="button-request-approval">
                    <Send className="h-3.5 w-3.5 mr-1.5" /> {t("requestApproval")}
                  </Button>
                  <ApprovalEmailDialog advisor={a} open={approvalOpen} onOpenChange={setApprovalOpen} />
                  {isAdmin && a.status === "pending" && (
                    <>
                      <Button size="sm" onClick={() => setStatus.mutate("approved")} className="bg-emerald-600 text-white hover:bg-emerald-700" data-testid="button-approve-advisor">
                        <Check className="h-3.5 w-3.5 mr-1" /> {t("advisorApprove")}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setStatus.mutate("rejected")} data-testid="button-reject-advisor">
                        <X className="h-3.5 w-3.5 mr-1" /> {t("advisorReject")}
                      </Button>
                    </>
                  )}
                  {isAdmin && (
                    <Button size="sm" variant="ghost" className="ml-auto text-destructive hover:text-destructive" data-testid="button-delete-advisor"
                      onClick={() => { if (confirm(t("advisorConfirmDelete"))) del.mutate(); }}>
                      <Trash2 className="h-3.5 w-3.5 mr-1.5" /> {t("delete")}
                    </Button>
                  )}
                </div>
              )}

              {/* v5.8 — lifecycle status control (admin only) */}
              {isAdmin && (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-3" data-testid="control-lifecycle">
                  <span className="text-xs font-semibold text-muted-foreground">{t("lifecycleSetLabel")}</span>
                  {ADVISOR_LIFECYCLE.map((s) => (
                    <Button
                      key={s}
                      type="button"
                      size="sm"
                      variant={a.lifecycleStatus === s ? "default" : "outline"}
                      className={cn("h-7 px-2.5 text-[11px]", a.lifecycleStatus === s && "bg-[hsl(193,52%,38%)] text-white hover:bg-[hsl(193,52%,30%)]")}
                      disabled={setLifecycle.isPending || a.lifecycleStatus === s}
                      onClick={() => {
                        if (s === "terminated" && !confirm(t("lifecycleConfirmTerminate"))) return;
                        setLifecycle.mutate(s);
                      }}
                      data-testid={`button-lifecycle-${s}`}
                    >
                      {t(`lifecycle_${s}` as any)}
                    </Button>
                  ))}
                </div>
              )}

              {/* v5.8 — onboarding workflow tracker */}
              {isStaff && <WorkflowTracker a={a} isAdmin={isAdmin} />}

              {/* Roles */}
              {a.roles.length > 0 && (
                <div className="rounded-lg border border-border p-3 space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground">{t("rolesLabel")}</p>
                  {a.roles.map((r) => {
                    const linked = partnerOf(r.partnershipId);
                    return (
                      <div key={r.id} className="flex items-start gap-2" data-testid={`row-advisor-role-${r.id}`}>
                        {r.isPrimary === 1 ? (
                          <Star className="mt-0.5 h-3.5 w-3.5 shrink-0 fill-[hsl(var(--gold))] text-[hsl(var(--gold))]" />
                        ) : (
                          <Building2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        )}
                        <div className="min-w-0 text-sm">
                          <span className="font-medium">{r.title}</span>
                          {(linked || r.organization) && (
                            <span className="text-muted-foreground"> — {linked ? (
                              <button
                                type="button"
                                className="underline decoration-dotted underline-offset-2 text-[hsl(193,52%,38%)] dark:text-[hsl(193,60%,60%)] hover:opacity-80"
                                onClick={() => navigate(`/partner/${linked.id}`)}
                                data-testid={`link-role-partner-${r.id}`}
                              >
                                {lang === "cn" && linked.nameCn ? linked.nameCn : linked.nameEn}
                              </button>
                            ) : r.organization}</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {a.domains && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-1">{t("advisorDomains")}</p>
                  <p className="text-sm leading-relaxed" data-testid="text-advisor-domains">{a.domains}</p>
                </div>
              )}

              {a.background && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-1">{t("advisorBackground")}</p>
                  <p className="text-sm leading-relaxed whitespace-pre-line" data-testid="text-advisor-background">{a.background}</p>
                </div>
              )}

              {/* v6.04 — one tidy "Contact & links" card: contact chips, then links
                  and filed documents, then origin/PIC/birthday meta. Staff only —
                  the server nulls emails/mobile/WeChat for other roles. */}
              {isStaff ? (
                <>
                  {(() => {
                    const link = a.profileUrl || a.linkedinUrl;
                    const isLinkedin = /linkedin\.com/i.test(link ?? "");
                    const mobiles = a.mobiles?.length ? a.mobiles : a.mobile ? [a.mobile] : [];
                    const hasContact = (a.emails ?? []).length > 0 || mobiles.length > 0 || a.wechatId;
                    const hasLinks = link || (cvFiles ?? []).length > 0;
                    const hasMeta = (a.originStaff ?? []).length > 0 || (a.gobiPics ?? []).length > 0 || formatBirthday(a);
                    if (!hasContact && !hasLinks && !hasMeta) return null;
                    return (
                      <div className="rounded-lg border border-border p-3 space-y-2.5" data-testid="card-contact-links">
                        <p className="text-xs font-semibold text-muted-foreground">{t("contactLinksTitle")}</p>
                        {hasContact && (
                          <div className="flex flex-wrap gap-2">
                            {(a.emails ?? []).map((e) => (
                              <a key={e} href={`mailto:${e}`} className="inline-flex items-center gap-1.5 rounded-md bg-secondary px-2 py-1 text-xs" data-testid={`link-email-${e}`}>
                                <Mail className="h-3 w-3" /> {e}
                              </a>
                            ))}
                            {mobiles.map((mobile, index) => (
                              <a
                                key={mobile}
                                href={`tel:${mobile.replace(/[^+\d]/g, "")}`}
                                className="inline-flex items-center gap-1.5 rounded-md bg-secondary px-2 py-1 text-xs"
                                data-testid={index === 0 ? "link-advisor-mobile" : `link-advisor-mobile-${index}`}
                              >
                                <Phone className="h-3 w-3" /> {mobile}
                              </a>
                            ))}
                            {a.wechatId && (
                              <button
                                type="button"
                                className="inline-flex items-center gap-1.5 rounded-md bg-secondary px-2 py-1 text-xs hover:bg-secondary/70"
                                onClick={() => {
                                  navigator.clipboard?.writeText(a.wechatId ?? "");
                                  toast({ description: t("advisorWechatCopied") });
                                }}
                                data-testid="text-advisor-wechat"
                              >
                                <MessageCircle className="h-3 w-3" /> {t("advisorWechat")}: {a.wechatId}
                              </button>
                            )}
                          </div>
                        )}
                        {hasLinks && (
                          <div className="flex flex-wrap gap-2">
                            {link && (
                              <a href={link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-secondary" data-testid="link-advisor-profile">
                                {isLinkedin ? <Linkedin className="h-3 w-3" /> : <ExternalLink className="h-3 w-3" />}
                                {isLinkedin ? "LinkedIn" : t("advisorProfileUrl")}
                              </a>
                            )}
                            {(cvFiles ?? []).map((f) => (
                              <button
                                key={f.id}
                                type="button"
                                className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-secondary"
                                onClick={() => downloadWithAuth(`/api/files/${f.id}/download`, f.filename)}
                                title={t("download")}
                                data-testid={`chip-cv-file-${f.id}`}
                              >
                                <FileDown className="h-3 w-3 text-[hsl(193,52%,38%)]" /> {t("cvOnFile")}: {f.filename}
                              </button>
                            ))}
                          </div>
                        )}
                        {hasMeta && (
                          <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-border/60 pt-2 text-xs text-muted-foreground">
                            {(a.originStaff ?? []).length > 0 && (
                              <span data-testid="text-advisor-origin-staff">{t("originStaffLabel")}: {(a.originStaff ?? []).join(", ")}</span>
                            )}
                            {(a.gobiPics ?? []).length > 0 && (
                              <span data-testid="text-advisor-pics">{t("currentPicLabel")}: {(a.gobiPics ?? []).join(", ")}</span>
                            )}
                            {formatBirthday(a) && (
                              <span className="inline-flex items-center gap-1" data-testid="text-advisor-birthday">
                                <Cake className="h-3 w-3 text-[hsl(var(--gold))]" /> {formatBirthday(a)}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                  {a.engagement && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground mb-1">{t("advisorEngagement")}</p>
                      <p className="text-sm leading-relaxed whitespace-pre-line" data-testid="text-advisor-engagement">{a.engagement}</p>
                    </div>
                  )}
                  <ActivityTimeline advisorId={a.id} />
                  {/* v6.04 — advisor change log */}
                  <AuditSection entityId={a.id} entityType="advisor" open={id !== null} />
                </>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground italic">{t("advisorContactHidden")}</p>
                  {(() => {
                    const link = a.profileUrl || a.linkedinUrl;
                    if (!link) return null;
                    const isLinkedin = /linkedin\.com/i.test(link);
                    return (
                      <div className="flex flex-wrap gap-2">
                        <a href={link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-secondary" data-testid="link-advisor-profile">
                          {isLinkedin ? <Linkedin className="h-3 w-3" /> : <ExternalLink className="h-3 w-3" />}
                          {isLinkedin ? "LinkedIn" : t("advisorProfileUrl")}
                        </a>
                      </div>
                    );
                  })()}
                </>
              )}

            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---------- Page ----------
export default function Advisors() {
  const { t, lang } = useLang();
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [, params] = useRoute("/advisors/:id");
  const selectedId = params?.id ? Number(params.id) : null;

  const [search, setSearch] = useState("");
  const [pillar, setPillar] = useState<string[]>([]);
  const [track, setTrack] = useState<string[]>([]);
  const [advisorType, setAdvisorType] = useState<string[]>([]);
  const [cohort, setCohort] = useState<string[]>([]);
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [momentumFilter, setMomentumFilter] = useState<string[]>([]);
  const [lifecycle, setLifecycle] = useState<string[]>([]);
  const [outreachOpen, setOutreachOpen] = useState(false);
  const [sortBy, setSortBy] = useState<"name" | "activity">("name");
  const [groupBy, setGroupBy] = useState<GroupBy>("none");
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [view, setView] = useState<"grid" | "list" | "map">("grid");
  const [showTags, setShowTags] = useState(true);
  const [showMomentum, setShowMomentum] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AdvisorWithRoles | null>(null);

  const { data: advisors, isLoading } = useQuery<AdvisorWithRoles[]>({
    queryKey: ["/api/advisors"],
    enabled: !!user,
  });
  const { data: partnerships } = useQuery<Partnership[]>({
    queryKey: ["/api/partnerships"],
    enabled: !!user,
  });

  const canSubmit = user?.role === "admin" || user?.role === "staff";
  const { data: allTags } = useSectorTags(!!user);
  const cohorts = useMemo(
    () => Array.from(new Set((advisors ?? []).map((a) => a.cohort).filter(Boolean) as string[])).sort(),
    [advisors],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (advisors ?? [])
      .filter((a) => (pillar.length === 0 || pillar.includes(a.pillar)))
      .filter((a) => (track.length === 0 || track.includes(a.track)))
      .filter((a) => (advisorType.length === 0 || advisorType.includes(a.advisorType)))
      .filter((a) => (cohort.length === 0 || (a.cohort && cohort.includes(a.cohort))))
      .filter((a) => (tagFilter.length === 0 || (a.tags ?? []).some((tg) => tagFilter.includes(String(tg.id)))))
      .filter((a) => (momentumFilter.length === 0 || momentumFilter.includes(momentumOf(a.lastActivityAt))))
      .filter((a) => (lifecycle.length === 0 || lifecycle.includes(a.lifecycleStatus)))
      .filter((a) => {
        if (!q) return true;
        const hay = [a.name, a.nameCn, a.domains, ...(a.tags ?? []).flatMap((tg) => [tg.nameEn, tg.nameCn]), ...(a.roles ?? []).flatMap((r) => [r.title, r.organization])]
          .filter(Boolean).join(" ").toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => {
        if (sortBy === "activity") {
          const ta = a.lastActivityAt ? new Date(a.lastActivityAt).getTime() : 0;
          const tb = b.lastActivityAt ? new Date(b.lastActivityAt).getTime() : 0;
          if (ta !== tb) return tb - ta;
        }
        return a.name.localeCompare(b.name);
      });
  }, [advisors, search, pillar, track, advisorType, cohort, tagFilter, momentumFilter, lifecycle, sortBy]);

  // v5.9 — optional grouping of the filtered set. Sector tags can place an
  // advisor in several groups; everything else is single-valued.
  const groups = useMemo<AdvisorGroup[]>(() => {
    if (groupBy === "none") return [{ key: "all", label: "", items: filtered }];
    const buckets = new Map<string, { label: string; items: AdvisorWithRoles[] }>();
    const push = (key: string, label: string, a: AdvisorWithRoles) => {
      const b = buckets.get(key);
      if (b) b.items.push(a);
      else buckets.set(key, { label, items: [a] });
    };
    for (const a of filtered) {
      if (groupBy === "pillar") push(a.pillar, t(`pillar_${a.pillar}` as any), a);
      else if (groupBy === "track") push(a.track, t(`track_${a.track}` as any), a);
      else if (groupBy === "lifecycle") push(a.lifecycleStatus, t(`lifecycle_${a.lifecycleStatus}` as any), a);
      else if (groupBy === "cohort") push(a.cohort || "__none", a.cohort || t("groupUngrouped"), a);
      else if (groupBy === "tag") {
        const tags = a.tags ?? [];
        if (tags.length === 0) push("__none", t("groupUngrouped"), a);
        else for (const tg of tags) push(`tag-${tg.id}`, lang === "cn" && tg.nameCn ? tg.nameCn : tg.nameEn, a);
      }
    }
    return Array.from(buckets.entries())
      .map(([key, v]) => ({ key, label: v.label, items: v.items }))
      .sort((x, y) => {
        if (x.key === "__none") return 1;
        if (y.key === "__none") return -1;
        return x.label.localeCompare(y.label);
      });
  }, [filtered, groupBy, lang, t]);

  const dkpOrgs = useMemo(
    () => (partnerships ?? []).filter((p) => p.isDomainKnowledgePartner === 1 && p.status === "approved")
      .sort((a, b) => a.nameEn.localeCompare(b.nameEn)),
    [partnerships],
  );

  // Sector tags for DKP organizations (joined client-side)
  const { data: pTagAssignments } = useQuery<Array<{ partnershipId: number; tagId: number }>>({
    queryKey: ["/api/partnership-tags"],
    enabled: !!user && dkpOrgs.length > 0,
  });
  const orgTags = useMemo(() => {
    const byId = new Map<number, SectorTag>();
    (allTags ?? []).forEach((tg) => byId.set(tg.id, tg));
    const m = new Map<number, SectorTag[]>();
    (pTagAssignments ?? []).forEach((x) => {
      const tg = byId.get(x.tagId);
      if (!tg) return;
      const arr = m.get(x.partnershipId) ?? [];
      arr.push(tg);
      m.set(x.partnershipId, arr);
    });
    return m;
  }, [allTags, pTagAssignments]);

  const displayName = (a: AdvisorWithRoles) => (lang === "cn" && a.nameCn ? a.nameCn : a.name);
  const primaryRole = (a: AdvisorWithRoles) => a.roles.find((r) => r.isPrimary === 1) ?? a.roles[0];
  // v5.9 — one renderer shared by the ungrouped roster and every group section.
  const renderRoster = (items: AdvisorWithRoles[]) =>
    view === "grid" ? (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.map((a) => {
          const pr = primaryRole(a);
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => navigate(`/advisors/${a.id}`)}
              className="group relative rounded-xl border border-border bg-card/80 p-4 text-left backdrop-blur transition-all hover:-translate-y-0.5 hover:border-[hsl(var(--gold))]/50 hover:shadow-lg"
              data-testid={`card-advisor-${a.id}`}
            >
              {/* Lifecycle state anchors the card corner so it never competes with the sector tags */}
              <LifecyclePill status={a.lifecycleStatus} advisorId={a.id} className="absolute right-3 top-3" />
              <div className="flex items-start gap-3">
                <AdvisorAvatar a={a} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 pr-24">
                    <p className="min-w-0 truncate font-semibold" data-testid={`text-advisor-name-${a.id}`}>{displayName(a)}</p>
                    {canSubmit && showMomentum && <MomentumDot lastActivityAt={a.lastActivityAt} />}
                  </div>
                  {pr && (
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                      {pr.title}{orgSuffix(pr)}
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <PillarBadge pillar={a.pillar as Pillar} />
                    {a.status === "pending" && (
                      <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-600 text-[11px]">{t("advisorPendingBadge")}</Badge>
                    )}
                  </div>
                  {showTags && <TagBadges tags={a.tags} className="mt-1.5" />}
                  {(a.gobiPics ?? []).length > 0 && (
                    <div className="mt-2 flex items-center gap-1.5" data-testid={`text-advisor-pic-${a.id}`}>
                      <PicAvatars names={a.gobiPics} />
                      <span className="min-w-0 truncate text-[11px] text-muted-foreground">
                        {t("picLabel")} · {(a.gobiPics ?? []).join(", ")}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    ) : (
      <div className="divide-y divide-border rounded-xl border border-border bg-card/80 backdrop-blur">
        {items.map((a) => {
          const pr = primaryRole(a);
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => navigate(`/advisors/${a.id}`)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-secondary/40"
              data-testid={`row-advisor-${a.id}`}
            >
              <AdvisorAvatar a={a} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="min-w-0 truncate text-sm font-semibold">{displayName(a)}</p>
                  {canSubmit && showMomentum && <MomentumDot lastActivityAt={a.lastActivityAt} />}
                  {a.status === "pending" && (
                    <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-600 text-[10px]">{t("advisorPendingBadge")}</Badge>
                  )}
                </div>
                {pr && (
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {pr.title}{orgSuffix(pr)}
                  </p>
                )}
              </div>
              <div className="hidden sm:flex flex-wrap items-center justify-end gap-1.5 max-w-[40%]">
                {(a.gobiPics ?? []).length > 0 && (
                  <span
                    className="inline-flex items-center"
                    title={`${t("picLabel")} · ${(a.gobiPics ?? []).join(", ")}`}
                    data-testid={`text-advisor-pic-${a.id}`}
                  >
                    <PicAvatars names={a.gobiPics} />
                  </span>
                )}
                {showTags && <TagBadges tags={a.tags} />}
                <PillarBadge pillar={a.pillar as Pillar} />
              </div>
              {/* Lifecycle gets its own trailing column so the column reads top to bottom */}
              <div className="flex w-28 shrink-0 justify-end">
                <LifecyclePill status={a.lifecycleStatus} advisorId={a.id} />
              </div>
            </button>
          );
        })}
      </div>
    );

  const orgSuffix = (r: { title: string; organization: string | null }) => {
    if (!r.organization) return "";
    const base = r.organization.split(/[(\uFF08\u2014\u2013]/)[0].trim().toLowerCase();
    if (base && r.title.toLowerCase().includes(base)) return "";
    return ` \u2014 ${r.organization}`;
  };

  return (
    <Layout>
      <div className="mx-auto max-w-6xl px-4 py-8" data-testid="page-advisors">
        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2.5 text-2xl font-bold tracking-tight" data-testid="text-advisors-title">
              <Users className="h-6 w-6 text-[hsl(var(--gold))]" /> {t("advisorsTitle")}
            </h1>
            <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">{t("advisorsSub")}</p>
          </div>
          {canSubmit && (
            <div className="flex flex-wrap items-center gap-2">
              <ExportCsvButtons />
              <Button variant="outline" size="sm" onClick={() => setOutreachOpen(true)} data-testid="button-outreach">
                <Send className="h-3.5 w-3.5 mr-1.5" /> {t("outreachTitle")}
              </Button>
              <Button onClick={() => { setEditing(null); setFormOpen(true); }} className="bg-[hsl(193,52%,38%)] text-white hover:bg-[hsl(193,52%,30%)]" data-testid="button-add-advisor">
                <Plus className="h-4 w-4 mr-1.5" /> {t("addAdvisor")}
              </Button>
            </div>
          )}
        </div>

        {/* Filters */}
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("advisorSearch")} className="h-10 w-56 pl-9" data-testid="input-advisor-search" />
          </div>
          <MultiSelectFilter label={t("pillarLabel")} testid="select-pillar" selected={pillar} onChange={setPillar}
            options={PILLARS.map((p) => ({ value: p, label: t(`pillar_${p}` as any) }))} />
          <MultiSelectFilter label={t("trackLabel")} testid="select-track" selected={track} onChange={setTrack}
            options={ADVISOR_TRACKS.map((p) => ({ value: p, label: t(`track_${p}` as any) }))} />
          <MultiSelectFilter label={t("advisorRoleLabel")} testid="select-advisor-type" selected={advisorType} onChange={setAdvisorType}
            options={ADVISOR_ROLE_TYPES.map((p) => ({ value: p, label: t(`advisorRole_${p}` as any) }))} />
          {cohorts.length > 0 && (
            <MultiSelectFilter label={t("cohortLabel")} testid="select-cohort" selected={cohort} onChange={setCohort}
              options={cohorts.map((c) => ({ value: c, label: c }))} />
          )}
          {(allTags ?? []).length > 0 && (
            <MultiSelectFilter label={t("sectorTags")} testid="select-tags" selected={tagFilter} onChange={setTagFilter}
              options={(allTags ?? []).map((tg) => ({ value: String(tg.id), label: lang === "cn" && tg.nameCn ? tg.nameCn : tg.nameEn }))} />
          )}
          <MultiSelectFilter label={t("lifecycleStatusLabel")} testid="select-lifecycle" selected={lifecycle} onChange={setLifecycle}
            options={ADVISOR_LIFECYCLE.map((s) => ({ value: s, label: t(`lifecycle_${s}` as any) }))} />
          {canSubmit && (
            <MultiSelectFilter label={t("momentumLabel")} testid="select-momentum" selected={momentumFilter} onChange={setMomentumFilter}
              options={(["active", "warm", "dormant", "none"] as const).map((m) => ({ value: m, label: t(`momentum_${m}` as any) }))} />
          )}
          <span className="ml-auto text-sm text-muted-foreground" data-testid="text-advisor-count">
            {filtered.length} {t("advisorCount")}
          </span>
        </div>

        {/* View & display controls */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-border bg-muted/40 p-0.5">
            <button
              type="button"
              onClick={() => setView("grid")}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${view === "grid" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              data-testid="button-view-grid"
            >
              <LayoutGrid className="h-3.5 w-3.5" /> {t("viewGrid")}
            </button>
            <button
              type="button"
              onClick={() => setView("list")}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${view === "list" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              data-testid="button-view-list"
            >
              <List className="h-3.5 w-3.5" /> {t("viewList")}
            </button>
            <button
              type="button"
              onClick={() => setView("map")}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${view === "map" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              data-testid="button-view-map"
            >
              <Orbit className="h-3.5 w-3.5" /> {t("viewMap")}
            </button>
          </div>
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as "name" | "activity")}>
            <SelectTrigger className="h-9 w-44" data-testid="select-sort">
              <span className="text-xs text-muted-foreground mr-1">{t("sortLabel")}:</span> <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name">{t("sortByName")}</SelectItem>
              {canSubmit && <SelectItem value="activity">{t("sortByActivity")}</SelectItem>}
            </SelectContent>
          </Select>
          <Select value={groupBy} onValueChange={(v) => { setGroupBy(v as GroupBy); setCollapsed([]); }}>
            <SelectTrigger className="h-9 w-48" data-testid="select-group-by">
              <span className="mr-1 text-xs text-muted-foreground">{t("groupByLabel")}:</span> <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{t("groupByNone")}</SelectItem>
              <SelectItem value="pillar">{t("groupByPillar")}</SelectItem>
              <SelectItem value="tag">{t("groupByTag")}</SelectItem>
              <SelectItem value="lifecycle">{t("groupByLifecycle")}</SelectItem>
              <SelectItem value="track">{t("groupByTrack")}</SelectItem>
              <SelectItem value="cohort">{t("groupByCohort")}</SelectItem>
            </SelectContent>
          </Select>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-9" data-testid="button-display-options">
                <SlidersHorizontal className="h-3.5 w-3.5 mr-1.5" /> {t("displayOptions")}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuLabel className="text-xs">{t("displayOptions")}</DropdownMenuLabel>
              <DropdownMenuCheckboxItem checked={showTags} onCheckedChange={(v) => setShowTags(v === true)} data-testid="toggle-show-tags">
                {t("sectorTags")}
              </DropdownMenuCheckboxItem>
              {canSubmit && (
                <DropdownMenuCheckboxItem checked={showMomentum} onCheckedChange={(v) => setShowMomentum(v === true)} data-testid="toggle-show-momentum">
                  {t("momentumLabel")}
                </DropdownMenuCheckboxItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Roster — grid or list, optionally grouped */}
        {isLoading ? (
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)}
          </div>
        ) : filtered.length === 0 ? (
          <p className="mt-10 text-center text-sm text-muted-foreground" data-testid="text-advisors-empty">{t("advisorEmpty")}</p>
        ) : view === "map" ? (
          <div className="mt-6">
            <p className="mb-3 text-xs text-muted-foreground" data-testid="text-advisor-map-hint">{t("advisorMapHint")}</p>
            <AdvisorStarMap advisors={filtered} partnerships={partnerships ?? []} onSelect={(id) => navigate(`/advisors/${id}`)} height={620} />
          </div>
        ) : groupBy === "none" ? (
          <div className="mt-6">{renderRoster(filtered)}</div>
        ) : (
          <div className="mt-6 space-y-3">
            {groups.map((g) => {
              const isOpen = !collapsed.includes(g.key);
              return (
                <Collapsible
                  key={g.key}
                  open={isOpen}
                  onOpenChange={(o) => setCollapsed((c) => (o ? c.filter((k) => k !== g.key) : [...c, g.key]))}
                  data-testid={`group-${g.key}`}
                >
                  <CollapsibleTrigger asChild>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded-lg border border-border bg-secondary/30 px-3 py-2 text-left transition-colors hover:bg-secondary/50"
                      data-testid={`button-group-toggle-${g.key}`}
                    >
                      <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", !isOpen && "-rotate-90")} />
                      <span className="text-sm font-semibold">{g.label}</span>
                      <span className="text-xs text-muted-foreground" data-testid={`text-group-count-${g.key}`}>{g.items.length}</span>
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pt-3">{renderRoster(g.items)}</CollapsibleContent>
                </Collapsible>
              );
            })}
          </div>
        )}

        {/* Domain Knowledge Partner organizations */}
        {dkpOrgs.length > 0 && (
          <div className="mt-12">
            <h2 className="flex items-center gap-2 text-lg font-bold tracking-tight" data-testid="text-dkp-orgs-title">
              <Building2 className="h-5 w-5 text-[hsl(var(--gold))]" /> {t("domainKnowledgeOrgs")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("domainKnowledgeOrgsHint")}</p>
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {dkpOrgs.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => navigate(`/partner/${p.id}`)}
                  className="group flex items-center gap-3 rounded-xl border border-border bg-card/80 p-4 text-left backdrop-blur transition-all hover:-translate-y-0.5 hover:border-[hsl(var(--gold))]/50 hover:shadow-lg"
                  data-testid={`card-dkp-org-${p.id}`}
                >
                  <PartnerLogo p={p} size="md" />
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{lang === "cn" && p.nameCn ? p.nameCn : p.nameEn}</p>
                    <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-[hsl(var(--gold))]">{t("domainKnowledgePartnerBadge")}</p>
                    {showTags && <TagBadges tags={orgTags.get(p.id)} className="mt-1.5" />}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Internal-tools workflow (v5.5 scaffold — advisor approval segment) */}
        {canSubmit && (
          <div className="mt-12" data-testid="section-workflow">
            <h2 className="flex items-center gap-2 text-lg font-bold tracking-tight" data-testid="text-workflow-title">
              <Sparkles className="h-5 w-5 text-[hsl(var(--gold))]" /> {t("workflowTitle")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("workflowHint")}</p>
            <div className="mt-4 rounded-xl border border-border bg-card/80 p-4 backdrop-blur">
              <div className="mb-3 flex items-center gap-2">
                <Badge className="bg-[hsl(193,52%,38%)] text-white hover:bg-[hsl(193,52%,38%)]">{t("wfLive")}</Badge>
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("advisorsTitle")}</span>
              </div>
              <div className="flex flex-wrap items-center gap-y-2">
                {(["wfStepRegister", "wfStepFactCheck", "wfStepApproval", "wfStepApproved", "wfStepClearance", "wfStepPublic"] as const).map((k, i, arr) => (
                  <span key={k} className="flex items-center">
                    <span className="rounded-full border border-[hsl(193,52%,38%)]/30 bg-[hsl(193,52%,38%)]/8 px-3 py-1 text-xs font-medium text-[hsl(193,52%,30%)] dark:text-[hsl(193,60%,60%)]">
                      {t(k)}
                    </span>
                    {i < arr.length - 1 && <span className="mx-1.5 text-muted-foreground">→</span>}
                  </span>
                ))}
              </div>
              <div className="mt-4 flex items-center gap-2 border-t border-border pt-3">
                <Badge variant="outline" className="text-muted-foreground">{t("wfPlanned")}</Badge>
                <span className="text-xs text-muted-foreground">{t("wfPlannedNote")}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      <AdvisorDetailDialog
        id={selectedId}
        onClose={() => navigate("/advisors")}
        onEdit={(a) => { setEditing(a); setFormOpen(true); }}
        partnerships={partnerships ?? []}
      />
      <AdvisorFormDialog open={formOpen} onOpenChange={setFormOpen} editing={editing} partnerships={partnerships ?? []} />
      {canSubmit && <OutreachDialog open={outreachOpen} onOpenChange={setOutreachOpen} advisors={filtered} />}
    </Layout>
  );
}
