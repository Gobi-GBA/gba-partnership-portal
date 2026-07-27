import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useLang } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Trash2, Paperclip, Loader2, Sparkles, ImagePlus, X } from "lucide-react";
import { uploadPhotoAsset, deletePhotoAsset, photoThumbSrc, isAssetToken } from "@/lib/photos";
import { useUnsavedGuard } from "@/components/unsaved-guard";
import { thankYou } from "@/components/thank-you";
import { Checkbox } from "@/components/ui/checkbox";
import { PicChecklist, StageGuide } from "@/components/shared";
import { TagPicker } from "@/components/advisor-crm";
import type { Partnership, AttachmentMeta, Stage } from "@shared/schema";
import { STAGES, CATEGORIES, REGIONS, STAGE_NUM, picsOf } from "@/lib/constants";

// Shared full edit dialog.
// mode "direct"  — admin: PATCH the record immediately.
// mode "request" — staff: submit a change request for admin approval.
export function EditPartnershipDialog({
  p, allPartners, onClose, onSaved,
}: {
  p: Partnership | null;
  allPartners: Partnership[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t, lang } = useLang();
  const { user } = useAuth();
  const { toast } = useToast();
  const [form, setForm] = useState<Record<string, any>>({});
  const [loadedId, setLoadedId] = useState<number | null>(null);
  const mode: "direct" | "request" = user?.role === "admin" ? "direct" : "request";

  const { data: attachments } = useQuery<AttachmentMeta[]>({
    queryKey: ["/api/partnerships", p?.id ?? 0, "attachments"],
    enabled: !!p,
  });

  // Sector tags (v5.5) — admin-only, saved separately from the change-request flow
  const [tagIds, setTagIds] = useState<number[]>([]);
  const [tagsSeededFor, setTagsSeededFor] = useState<number | null>(null);
  const [snapshot, setSnapshot] = useState<string>("");
  const [tagSnapshot, setTagSnapshot] = useState<string>("[]");
  const { data: tagAssignments } = useQuery<Array<{ partnershipId: number; tagId: number }>>({
    queryKey: ["/api/partnership-tags"],
    enabled: !!p && mode === "direct",
  });
  if (p && mode === "direct" && tagAssignments && tagsSeededFor !== p.id) {
    setTagsSeededFor(p.id);
    const seeded = tagAssignments.filter((x) => x.partnershipId === p.id).map((x) => x.tagId);
    setTagIds(seeded);
    setTagSnapshot(JSON.stringify(seeded));
  }

  if (p && loadedId !== p.id) {
    setLoadedId(p.id);
    const seededForm = {
      nameEn: p.nameEn ?? "", nameCn: p.nameCn ?? "", category: p.category,
      region: p.region ?? "hongkong", website: p.website ?? "", logoUrl: p.logoUrl ?? "",
      descriptionEn: p.descriptionEn ?? "", descriptionCn: p.descriptionCn ?? "",
      contactName: p.contactName ?? "", contactEmail: p.contactEmail ?? "",
      picNames: picsOf(p), parentId: p.parentId ? String(p.parentId) : "none",
      context: p.context ?? "", partnershipType: p.partnershipType ?? "",
      startDate: p.startDate ?? "", stage: p.stage,
      notes: p.notes ?? "",
      photosText: (p.photos ?? []).join("\n"),
      lpStatus: p.lpStatus ?? "na",
      isDomainKnowledgePartner: p.isDomainKnowledgePartner ?? 0,
    };
    setForm(seededForm);
    setSnapshot(JSON.stringify(seededForm)); // v6.01 — dirty-state baseline
  }

  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  // v5.13 — org-anchored auto-sync: fetches the organisation's website and
  // enriches the profile fields. Identity (name + website) locks extraction to
  // this organisation; relationship fields (stage, start date, PICs) are never
  // touched — a public website knows the org, not the relationship.
  const orgSync = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/ai/extract", {
        text: "",
        expectedOrg: {
          nameEn: String(form.nameEn ?? "").trim(),
          nameCn: String(form.nameCn ?? "").trim(),
          website: String(form.website ?? "").trim(),
        },
      });
      return res.json();
    },
    onSuccess: (d: any) => {
      setForm((f) => ({
        ...f,
        nameCn: d.nameCn?.trim() || f.nameCn,
        category: d.category || f.category,
        region: d.region || f.region,
        website: d.website?.trim() || f.website,
        descriptionEn: d.descriptionEn?.trim() || f.descriptionEn,
        descriptionCn: d.descriptionCn?.trim() || f.descriptionCn,
        contactName: d.contactName?.trim() || f.contactName,
        contactEmail: d.contactEmail?.trim() || f.contactEmail,
        partnershipType: d.partnershipType?.trim() || f.partnershipType,
        context: d.context?.trim() || f.context,
      }));
      toast({ description: t("linkedinSyncApplied") });
    },
    onError: (e: any) => {
      const msg = String(e?.message ?? e);
      if (msg.includes("org_mismatch")) {
        let found = "";
        try { found = JSON.parse(msg.slice(msg.indexOf("{"))).found ?? ""; } catch {}
        toast({ description: `${t("orgMismatch")}${found ? ` — ${found}` : ""}. ${t("orgMismatchHint")}`, variant: "destructive" });
      } else {
        toast({ description: msg, variant: "destructive" });
      }
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!p) return;
      if (!form.startDate) throw new Error(t("startDateRequired"));
      const payload: Record<string, any> = {
        ...form,
        parentId: form.parentId === "none" ? null : Number(form.parentId),
      };
      delete payload.photosText;
      payload.photos = String(form.photosText ?? "")
        .split("\n")
        .map((s: string) => s.trim())
        .filter(Boolean)
        .slice(0, 12);
      if (mode === "direct") {
        const res = await apiRequest("PATCH", `/api/partnerships/${p.id}`, payload);
        await apiRequest("PUT", `/api/partnerships/${p.id}/tags`, { tagIds });
        queryClient.invalidateQueries({ queryKey: ["/api/partnership-tags"] });
        return res.json();
      }
      // Change request: send only fields that differ from the current record
      const orig: Record<string, any> = {
        nameEn: p.nameEn ?? "", nameCn: p.nameCn ?? "", category: p.category,
        region: p.region ?? "hongkong", website: p.website ?? "", logoUrl: p.logoUrl ?? "",
        descriptionEn: p.descriptionEn ?? "", descriptionCn: p.descriptionCn ?? "",
        contactName: p.contactName ?? "", contactEmail: p.contactEmail ?? "",
        picNames: picsOf(p), parentId: p.parentId ?? null,
        context: p.context ?? "", partnershipType: p.partnershipType ?? "",
        startDate: p.startDate ?? "", stage: p.stage, notes: p.notes ?? "",
        photos: p.photos ?? [],
        lpStatus: p.lpStatus ?? "na",
        isDomainKnowledgePartner: p.isDomainKnowledgePartner ?? 0,
      };
      const changes: Record<string, any> = {};
      for (const k of Object.keys(orig)) {
        const a = JSON.stringify(orig[k] ?? null);
        const b = JSON.stringify(payload[k] ?? null);
        if (a !== b) changes[k] = payload[k];
      }
      if (Object.keys(changes).length === 0) return { noop: true };
      const res = await apiRequest("POST", "/api/change-requests", { partnershipId: p.id, changes });
      return res.json();
    },
    onSuccess: (r: any) => {
      if (mode === "request" && !r?.noop) {
        toast({ title: t("changeSubmitted") });
      }
      onSaved();
      onClose();
      setLoadedId(null);
      setSnapshot(""); setTagSnapshot("[]"); // saved — clear dirty baseline
      thankYou();
    },
    onError: (e: any) => toast({ title: String(e?.message ?? "Update failed"), variant: "destructive" }),
  });

  const deleteAttachment = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/attachments/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/partnerships", p?.id ?? 0, "attachments"] }),
    onError: () => toast({ title: "Delete failed", variant: "destructive" }),
  });

  // v6.01 — unsaved-changes guard: intercept X / Escape / overlay-click when dirty
  const dirty = !!p && snapshot !== "" && (JSON.stringify(form) !== snapshot || JSON.stringify(tagIds) !== tagSnapshot);
  const closeAndReset = () => { onClose(); setLoadedId(null); setTagsSeededFor(null); setSnapshot(""); setTagSnapshot("[]"); };
  const { requestClose, guard } = useUnsavedGuard({ dirty, onDiscard: closeAndReset, onSave: () => save.mutate() });

  if (!p) return null;

  return (
    <Dialog open={!!p} onOpenChange={(o) => { if (!o) requestClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg">{t("editRecord")} — {lang === "cn" && p.nameCn ? p.nameCn : p.nameEn}</DialogTitle>
        </DialogHeader>
        {mode === "request" && (
          <p className="text-xs rounded-md bg-[hsl(var(--aqua))]/10 text-[hsl(193,52%,30%)] dark:text-[hsl(var(--aqua))] px-3 py-2">
            {t("changeRequestHint")}
          </p>
        )}
        <form
          className="space-y-4"
          onSubmit={(e) => { e.preventDefault(); save.mutate(); }}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <EField label={t("nameEn")}><Input value={form.nameEn ?? ""} onChange={(e) => set("nameEn", e.target.value)} required data-testid="edit-name-en" /></EField>
            <EField label={t("nameCn")}><Input value={form.nameCn ?? ""} onChange={(e) => set("nameCn", e.target.value)} data-testid="edit-name-cn" /></EField>
            <EField label={t("filterCategory")}>
              <Select value={form.category} onValueChange={(v) => set("category", v)}>
                <SelectTrigger data-testid="edit-category"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{t(`cat_${c}` as any)}</SelectItem>)}
                </SelectContent>
              </Select>
            </EField>
            <EField label={t("region")}>
              <Select value={form.region} onValueChange={(v) => set("region", v)}>
                <SelectTrigger data-testid="edit-region"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {REGIONS.map((r) => <SelectItem key={r} value={r}>{t(`region_${r}` as any)}</SelectItem>)}
                </SelectContent>
              </Select>
            </EField>
            <EField label={t("picsLabel")}>
              <PicChecklist value={form.picNames ?? []} onChange={(v) => set("picNames", v)} />
            </EField>
            <EField label={t("parentLabel")}>
              <Select value={form.parentId} onValueChange={(v) => set("parentId", v)}>
                <SelectTrigger data-testid="edit-parent"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("parentNone")}</SelectItem>
                  {allPartners.filter((x) => x.id !== p.id).map((x) => (
                    <SelectItem key={x.id} value={String(x.id)}>
                      {lang === "cn" && x.nameCn ? x.nameCn : x.nameEn}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </EField>
            <EField label={t("partnershipType")}><Input value={form.partnershipType ?? ""} onChange={(e) => set("partnershipType", e.target.value)} data-testid="edit-type" /></EField>
            <EField label={t("website")}>
              <div className="flex gap-2">
                <Input value={form.website ?? ""} onChange={(e) => set("website", e.target.value)} data-testid="edit-website" />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="shrink-0"
                  disabled={!String(form.website ?? "").trim() || orgSync.isPending}
                  onClick={() => orgSync.mutate()}
                  title={t("partnerSyncHint")}
                  data-testid="button-partner-sync"
                >
                  {orgSync.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-1.5" />}
                  {t("linkedinSync")}
                </Button>
              </div>
            </EField>
            <EField label={t("logoUrl")}><Input value={form.logoUrl ?? ""} onChange={(e) => set("logoUrl", e.target.value)} data-testid="edit-logo" /></EField>
            <EField label={t("contactName")}><Input value={form.contactName ?? ""} onChange={(e) => set("contactName", e.target.value)} data-testid="edit-contact-name" /></EField>
            <EField label={t("contactEmail")}><Input value={form.contactEmail ?? ""} onChange={(e) => set("contactEmail", e.target.value)} data-testid="edit-contact-email" /></EField>
            <EField label={`${t("startDate")} *`}>
              <Input type="date" value={form.startDate ?? ""} onChange={(e) => set("startDate", e.target.value)} required data-testid="edit-start-date" />
            </EField>
            <EField label={`${t("filterStage")} · ${t("collabLevel")}`}>
              <Select value={form.stage} onValueChange={(v) => set("stage", v)}>
                <SelectTrigger data-testid="edit-stage"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STAGES.map((s) => (
                    <SelectItem key={s} value={s}>{STAGE_NUM[s as Stage]} · {t(`stage_${s}` as any)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <StageGuide selected={form.stage} />
            </EField>
            {(user?.role === "admin" || user?.isIr === 1) && (
              <EField label={t("lpStatus")}>
                <Select value={form.lpStatus ?? "na"} onValueChange={(v) => set("lpStatus", v)}>
                  <SelectTrigger data-testid="edit-lp-status"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="na">{t("lpStatusNa")}</SelectItem>
                    <SelectItem value="target">{t("lpStatusTarget")}</SelectItem>
                    <SelectItem value="lp">{t("lpStatusLp")}</SelectItem>
                  </SelectContent>
                </Select>
              </EField>
            )}
          </div>
          {user?.role === "admin" && (
            <label className="flex cursor-pointer items-center gap-2 text-sm font-medium" data-testid="edit-dkp-row">
              <Checkbox
                checked={form.isDomainKnowledgePartner === 1}
                onCheckedChange={(v) => set("isDomainKnowledgePartner", v ? 1 : 0)}
                data-testid="edit-dkp-checkbox"
              />
              {t("isDkpLabel")}
            </label>
          )}
          {user?.role === "admin" && (
            <EField label={t("sectorTags")}>
              <TagPicker selected={tagIds} onChange={setTagIds} />
            </EField>
          )}
          <EField label={t("descriptionEn")}><Textarea rows={2} value={form.descriptionEn ?? ""} onChange={(e) => set("descriptionEn", e.target.value)} data-testid="edit-desc-en" /></EField>
          <EField label={t("descriptionCn")}><Textarea rows={2} value={form.descriptionCn ?? ""} onChange={(e) => set("descriptionCn", e.target.value)} data-testid="edit-desc-cn" /></EField>
          <EField label={t("contextLabel")}><Textarea rows={3} value={form.context ?? ""} onChange={(e) => set("context", e.target.value)} data-testid="edit-context" /></EField>
          <EField label={t("notes")}><Textarea rows={2} value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} data-testid="edit-notes" /></EField>
          <EField label={t("photosLabel")}>
            <PhotoUploader
              photosText={String(form.photosText ?? "")}
              onChange={(v) => set("photosText", v)}
              ownerId={p.id}
            />
          </EField>

          {attachments && attachments.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-sm">{t("attachments")}</Label>
              {attachments.map((a) => (
                <div key={a.id} className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
                  <Paperclip className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <a
                    href={`/api/attachments/${a.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="truncate font-medium hover:underline"
                  >
                    {a.name}
                  </a>
                  {mode === "direct" && (
                    <button
                      type="button"
                      className="ml-auto rounded p-1 text-muted-foreground transition-colors hover:text-destructive hover:bg-destructive/10"
                      onClick={() => deleteAttachment.mutate(a.id)}
                      aria-label="delete attachment"
                      data-testid={`button-delete-attachment-${a.id}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={requestClose}
              className="transition-colors hover:bg-muted hover:border-foreground/30"
              data-testid="button-cancel-edit"
            >
              {t("cancel")}
            </Button>
            <Button
              type="submit"
              disabled={save.isPending}
              className="bg-[hsl(193,52%,38%)] text-white shadow-sm transition-all hover:bg-[hsl(193,52%,30%)] hover:shadow-md"
              data-testid="button-save-edit"
            >
              {save.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />{t("submitting")}</> : (mode === "direct" ? t("save") : t("submitForApproval"))}
            </Button>
          </div>
        </form>
        {guard}
      </DialogContent>
    </Dialog>
  );
}

export function EField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">{label}</Label>
      {children}
    </div>
  );
}

// ---------------- v6.01 Photo upload portal ----------------
// Uploaded files become server-stored assets ("asset:<id>" tokens in photos[]);
// thumbnails are generated in the browser before upload for fast galleries.
const parsePhotoLines = (text: string) =>
  text.split("\n").map((s) => s.trim()).filter(Boolean);

export function PhotoUploader({
  photosText,
  onChange,
  ownerId,
}: {
  photosText: string;
  onChange: (v: string) => void;
  ownerId: number;
}) {
  const { t } = useLang();
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const sessionUploads = useRef<Set<string>>(new Set());
  const [busy, setBusy] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const photos = parsePhotoLines(photosText);

  const addFiles = async (files: FileList | File[]) => {
    const list = Array.from(files).slice(0, Math.max(0, 12 - photos.length));
    if (list.length === 0) return;
    setBusy((b) => b + list.length);
    let current = photos;
    for (const file of list) {
      try {
        const token = await uploadPhotoAsset(file, "partnership", ownerId);
        sessionUploads.current.add(token);
        thankYou();
        current = [...current, token];
        onChange(current.join("\n"));
      } catch (err: any) {
        toast({ title: t("photoUploadFailed"), description: String(err?.message ?? err), variant: "destructive" });
      } finally {
        setBusy((b) => b - 1);
      }
    }
  };

  const removeAt = (i: number) => {
    const token = photos[i];
    if (isAssetToken(token) && sessionUploads.current.has(token)) {
      deletePhotoAsset(token); // brand-new upload discarded — free the row immediately
      sessionUploads.current.delete(token);
    }
    onChange(photos.filter((_, j) => j !== i).join("\n"));
  };

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="hidden"
        onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }}
        data-testid="input-photo-upload"
      />
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") inputRef.current?.click(); }}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files); }}
        className={`flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed px-3 py-4 text-xs text-muted-foreground transition-colors ${dragOver ? "border-[hsl(var(--gold))] bg-[hsl(var(--gold))]/10" : "border-border hover:border-[hsl(var(--gold))]/60"}`}
        data-testid="dropzone-photos"
      >
        {busy > 0 ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
        <span>{busy > 0 ? t("uploadingPhotos") : t("dropPhotosHint")}</span>
      </div>
      {photos.length > 0 && (
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
          {photos.map((src, i) => (
            <div key={`${src}-${i}`} className="group relative overflow-hidden rounded-md border border-border bg-muted">
              <img src={photoThumbSrc(src)} alt="" className="h-16 w-full object-cover" loading="lazy" />
              <button
                type="button"
                onClick={() => removeAt(i)}
                aria-label="Remove photo"
                className="absolute right-1 top-1 rounded-full bg-black/55 p-0.5 text-white opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
                data-testid={`button-remove-photo-${i}`}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={() => setShowAdvanced((s) => !s)}
        className="text-[11px] text-muted-foreground underline-offset-2 hover:underline"
        data-testid="button-toggle-photo-urls"
      >
        {t("advancedPhotoUrls")}
      </button>
      {showAdvanced && (
        <Textarea
          rows={3}
          value={photosText}
          onChange={(e) => onChange(e.target.value)}
          placeholder={"https://…/photo-1.jpg\nhttps://…/photo-2.jpg"}
          data-testid="edit-photos"
        />
      )}
    </div>
  );
}
