import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient, API_BASE, getAuthToken } from "@/lib/queryClient";
import { useLang } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Trash2, Paperclip, Loader2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { PicChecklist } from "@/components/shared";
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

  if (p && loadedId !== p.id) {
    setLoadedId(p.id);
    setForm({
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
    });
  }

  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

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
    },
    onError: (e: any) => toast({ title: String(e?.message ?? "Update failed"), variant: "destructive" }),
  });

  const deleteAttachment = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/attachments/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/partnerships", p?.id ?? 0, "attachments"] }),
    onError: () => toast({ title: "Delete failed", variant: "destructive" }),
  });

  if (!p) return null;
  const token = getAuthToken();
  const tokenQS = token ? `?token=${encodeURIComponent(token)}` : "";

  return (
    <Dialog open={!!p} onOpenChange={(o) => { if (!o) { onClose(); setLoadedId(null); } }}>
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
            <EField label={t("website")}><Input value={form.website ?? ""} onChange={(e) => set("website", e.target.value)} data-testid="edit-website" /></EField>
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
          <EField label={t("descriptionEn")}><Textarea rows={2} value={form.descriptionEn ?? ""} onChange={(e) => set("descriptionEn", e.target.value)} data-testid="edit-desc-en" /></EField>
          <EField label={t("descriptionCn")}><Textarea rows={2} value={form.descriptionCn ?? ""} onChange={(e) => set("descriptionCn", e.target.value)} data-testid="edit-desc-cn" /></EField>
          <EField label={t("contextLabel")}><Textarea rows={3} value={form.context ?? ""} onChange={(e) => set("context", e.target.value)} data-testid="edit-context" /></EField>
          <EField label={t("notes")}><Textarea rows={2} value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} data-testid="edit-notes" /></EField>
          <EField label={`${t("photosLabel")} · ${t("photosHint")}`}>
            <Textarea
              rows={3}
              value={form.photosText ?? ""}
              onChange={(e) => set("photosText", e.target.value)}
              placeholder={"https://…/photo-1.jpg\nhttps://…/photo-2.jpg"}
              data-testid="edit-photos"
            />
          </EField>

          {attachments && attachments.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-sm">{t("attachments")}</Label>
              {attachments.map((a) => (
                <div key={a.id} className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
                  <Paperclip className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <a
                    href={`${API_BASE}/api/attachments/${a.id}${tokenQS}`}
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
              onClick={() => { onClose(); setLoadedId(null); }}
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
