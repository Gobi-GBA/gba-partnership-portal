import { useMemo, useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useRoute } from "wouter";
import { Layout, MultiSelectFilter, PicChecklist, PartnerLogo } from "@/components/shared";
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
import type { AdvisorWithRoles, AdvisorRoleInput, Partnership, AdvisorRoleType, AdvisorTrack, Pillar, SectorTag } from "@shared/schema";
import { ADVISOR_ROLE_TYPES, ADVISOR_TRACKS, PILLARS } from "@shared/schema";
import {
  Users, Search, Plus, Pencil, Trash2, Star, ExternalLink, Linkedin,
  Building2, Mail, GraduationCap, Factory, Rocket, Sparkles, Check, X, ImagePlus,
  LayoutGrid, List, SlidersHorizontal, Send, Cake,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  MomentumDot, momentumOf, TagBadges, TagPicker, useSectorTags, ActivityTimeline,
  ApprovalEmailDialog, LinkedinSyncControl, formatBirthday, type ExtractedAdvisor,
} from "@/components/advisor-crm";
import { cn } from "@/lib/utils";

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

// ---------- Add / edit form ----------
type RoleDraft = AdvisorRoleInput & { key: number };

const EMPTY_FORM = {
  name: "", nameCn: "", advisorType: "honourary_advisor" as AdvisorRoleType, track: "industry" as AdvisorTrack,
  pillar: "other" as Pillar, emailsText: "", domains: "", background: "", profileUrl: "", linkedinUrl: "",
  cohort: "", engagement: "", gobiPics: [] as string[], photoUrl: "", photoThumbUrl: "",
  publicClearance: false, birthDay: "", birthMonth: "", birthYear: "", tagIds: [] as number[],
};

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
        background: target.background ?? "", profileUrl: target.profileUrl ?? "",
        linkedinUrl: target.linkedinUrl ?? "", cohort: target.cohort ?? "",
        engagement: target.engagement ?? "", gobiPics: target.gobiPics ?? [],
        photoUrl: target.photoUrl ?? "", photoThumbUrl: target.photoThumbUrl ?? "",
        publicClearance: target.publicClearance === 1,
        birthDay: target.birthDay ? String(target.birthDay) : "",
        birthMonth: target.birthMonth ? String(target.birthMonth) : "",
        birthYear: target.birthYear ? String(target.birthYear) : "",
        tagIds: (target.tags ?? []).map((tg) => tg.id),
      });
      setRoles((target.roles ?? []).map((r) => ({ key: keyRef.current++, title: r.title, organization: r.organization ?? "", partnershipId: r.partnershipId, isPrimary: r.isPrimary })));
    } else {
      setForm(EMPTY_FORM);
      setRoles([{ key: keyRef.current++, title: "", organization: "", partnershipId: null, isPrimary: 1 }]);
    }
  }
  if (!open && loadedFor !== null) setLoadedFor(null);

  const partnerName = (p: Partnership) => (lang === "cn" && p.nameCn ? p.nameCn : p.nameEn);
  const sortedPartners = useMemo(
    () => partnerships.slice().sort((a, b) => partnerName(a).localeCompare(partnerName(b))),
    [partnerships, lang],
  );

  const save = useMutation({
    mutationFn: async () => {
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
        linkedinUrl: form.linkedinUrl.trim() || null,
        gobiPics: form.gobiPics,
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto" data-testid="dialog-advisor-form">
        <DialogHeader>
          <DialogTitle>{editing ? t("editAdvisor") : t("addAdvisor")}</DialogTitle>
          <DialogDescription>{t("rolesHint")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          {/* Photo */}
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

          {/* Names */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>{t("advisorNameEn")}</Label>
              <Input value={form.name} onChange={set("name")} data-testid="input-adv-name" />
            </div>
            <div className="space-y-1">
              <Label>{t("advisorNameCn")}</Label>
              <Input value={form.nameCn} onChange={set("nameCn")} data-testid="input-adv-name-cn" />
            </div>
          </div>

          {/* Classification */}
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

          {/* Roles editor */}
          <div className="space-y-2 rounded-lg border border-border p-3">
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
                <div className="space-y-2">
                  <Input placeholder={t("roleOrg")} value={r.organization ?? ""} data-testid={`input-role-org-${i}`}
                    onChange={(e) => setRoles((rs) => rs.map((x) => (x.key === r.key ? { ...x, organization: e.target.value } : x)))} />
                  <Select
                    value={r.partnershipId ? String(r.partnershipId) : "none"}
                    onValueChange={(v) => setRoles((rs) => rs.map((x) => (x.key === r.key ? { ...x, partnershipId: v === "none" ? null : Number(v) } : x)))}
                  >
                    <SelectTrigger className="h-9" data-testid={`select-role-partner-${i}`}>
                      <SelectValue placeholder={t("roleLinkPartner")} />
                    </SelectTrigger>
                    <SelectContent className="max-h-64">
                      <SelectItem value="none">{t("roleNone")}</SelectItem>
                      {sortedPartners.map((p) => (
                        <SelectItem key={p.id} value={String(p.id)}>{partnerName(p)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
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
          </div>

          {/* Details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>{t("advisorEmails")}</Label>
              <Input value={form.emailsText} onChange={set("emailsText")} data-testid="input-adv-emails" />
            </div>
            <div className="space-y-1">
              <Label>{t("cohortLabel")}</Label>
              <Input value={form.cohort} onChange={set("cohort")} placeholder="2025" data-testid="input-adv-cohort" />
            </div>
          </div>
          <div className="space-y-1">
            <Label>{t("advisorDomains")}</Label>
            <Input value={form.domains} onChange={set("domains")} data-testid="input-adv-domains" />
          </div>
          <div className="space-y-1">
            <Label>{t("advisorBackground")}</Label>
            <Textarea rows={4} value={form.background} onChange={set("background")} data-testid="input-adv-background" />
          </div>
          <div className="space-y-1">
            <Label>{t("advisorEngagement")}</Label>
            <Textarea rows={2} value={form.engagement} onChange={set("engagement")} data-testid="input-adv-engagement" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>{t("advisorProfileUrl")}</Label>
              <Input value={form.profileUrl} onChange={set("profileUrl")} data-testid="input-adv-profile-url" />
            </div>
            <div className="space-y-1">
              <Label>{t("advisorLinkedin")}</Label>
              <div className="flex gap-2">
                <Input value={form.linkedinUrl} onChange={set("linkedinUrl")} data-testid="input-adv-linkedin" />
                <LinkedinSyncControl
                  url={form.linkedinUrl}
                  onApply={(d: ExtractedAdvisor) => {
                    setForm((f) => ({
                      ...f,
                      name: d.name?.trim() || f.name,
                      nameCn: d.nameCn?.trim() || f.nameCn,
                      background: d.background?.trim() || f.background,
                      domains: d.domains?.trim() || f.domains,
                      cohort: d.cohort?.trim() || f.cohort,
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
              <p className="text-[11px] text-muted-foreground">{t("linkedinSyncHint")}</p>
            </div>
          </div>

          {/* Sector tags */}
          <div className="space-y-1.5">
            <Label>{t("sectorTags")}</Label>
            <TagPicker selected={form.tagIds} onChange={(ids) => setForm((f) => ({ ...f, tagIds: ids }))} />
          </div>

          {/* CRM: date of birth */}
          <div className="space-y-1">
            <Label>{t("birthdayLabel")}</Label>
            <div className="flex gap-2">
              <Input className="w-20" inputMode="numeric" placeholder="DD" maxLength={2} value={form.birthDay} onChange={set("birthDay")} data-testid="input-adv-birth-day" />
              <Input className="w-20" inputMode="numeric" placeholder="MM" maxLength={2} value={form.birthMonth} onChange={set("birthMonth")} data-testid="input-adv-birth-month" />
              <Input className="w-28" inputMode="numeric" placeholder="YYYY" maxLength={4} value={form.birthYear} onChange={set("birthYear")} data-testid="input-adv-birth-year" />
            </div>
          </div>

          {/* Public clearance */}
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
          <div className="space-y-1">
            <Label>Gobi PIC</Label>
            <PicChecklist value={form.gobiPics} onChange={(v) => setForm((f) => ({ ...f, gobiPics: v }))} />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-advisor">{t("cancel")}</Button>
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
  const { data: a, isLoading } = useQuery<AdvisorWithRoles>({
    queryKey: ["/api/advisors", id ?? 0],
    enabled: id !== null,
  });
  const isStaff = user?.role === "admin" || user?.role === "staff";
  const isAdmin = user?.role === "admin";
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
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto" data-testid="dialog-advisor-detail">
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

              {/* Staff-only: contact + engagement */}
              {isStaff ? (
                <>
                  {(a.emails ?? []).length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {(a.emails ?? []).map((e) => (
                        <a key={e} href={`mailto:${e}`} className="inline-flex items-center gap-1.5 rounded-md bg-secondary px-2 py-1 text-xs" data-testid={`link-email-${e}`}>
                          <Mail className="h-3 w-3" /> {e}
                        </a>
                      ))}
                    </div>
                  )}
                  {a.engagement && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground mb-1">{t("advisorEngagement")}</p>
                      <p className="text-sm leading-relaxed whitespace-pre-line" data-testid="text-advisor-engagement">{a.engagement}</p>
                    </div>
                  )}
                  {formatBirthday(a) && (
                    <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground" data-testid="text-advisor-birthday">
                      <Cake className="h-3.5 w-3.5 text-[hsl(var(--gold))]" /> {formatBirthday(a)}
                    </p>
                  )}
                  <ActivityTimeline advisorId={a.id} />
                </>
              ) : (
                <p className="text-xs text-muted-foreground italic">{t("advisorContactHidden")}</p>
              )}

              {(a.gobiPics ?? []).length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-1">Gobi PIC</p>
                  <p className="text-sm">{(a.gobiPics ?? []).join(", ")}</p>
                </div>
              )}

              {/* External links */}
              {(a.profileUrl || a.linkedinUrl) && (
                <div className="flex flex-wrap gap-2">
                  {a.profileUrl && (
                    <a href={a.profileUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-secondary" data-testid="link-advisor-profile">
                      <ExternalLink className="h-3 w-3" /> {t("advisorProfileUrl")}
                    </a>
                  )}
                  {a.linkedinUrl && (
                    <a href={a.linkedinUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-secondary" data-testid="link-advisor-linkedin">
                      <Linkedin className="h-3 w-3" /> LinkedIn
                    </a>
                  )}
                </div>
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
  const [sortBy, setSortBy] = useState<"name" | "activity">("name");
  const [view, setView] = useState<"grid" | "list">("grid");
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
  }, [advisors, search, pillar, track, advisorType, cohort, tagFilter, momentumFilter, sortBy]);

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
            <Button onClick={() => { setEditing(null); setFormOpen(true); }} className="bg-[hsl(193,52%,38%)] text-white hover:bg-[hsl(193,52%,30%)]" data-testid="button-add-advisor">
              <Plus className="h-4 w-4 mr-1.5" /> {t("addAdvisor")}
            </Button>
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

        {/* Grid */}
        {isLoading ? (
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)}
          </div>
        ) : filtered.length === 0 ? (
          <p className="mt-10 text-center text-sm text-muted-foreground" data-testid="text-advisors-empty">{t("advisorEmpty")}</p>
        ) : view === "grid" ? (
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((a) => {
              const pr = primaryRole(a);
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => navigate(`/advisors/${a.id}`)}
                  className="group rounded-xl border border-border bg-card/80 p-4 text-left backdrop-blur transition-all hover:-translate-y-0.5 hover:border-[hsl(var(--gold))]/50 hover:shadow-lg"
                  data-testid={`card-advisor-${a.id}`}
                >
                  <div className="flex items-start gap-3">
                    <AdvisorAvatar a={a} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
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
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="mt-6 divide-y divide-border rounded-xl border border-border bg-card/80 backdrop-blur">
            {filtered.map((a) => {
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
                  <div className="hidden sm:flex flex-wrap items-center justify-end gap-1.5 max-w-[45%]">
                    {showTags && <TagBadges tags={a.tags} />}
                    <PillarBadge pillar={a.pillar as Pillar} />
                  </div>
                </button>
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
    </Layout>
  );
}
