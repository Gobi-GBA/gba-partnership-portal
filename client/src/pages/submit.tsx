import { useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useLang } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { Layout, StageBadge, PicChecklist } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Sparkles, Loader2, LogIn, Paperclip, X, FilePen, PlusCircle, Eye } from "lucide-react";
import type { Partnership, Stage, AttachmentInput } from "@shared/schema";
import { STAGES, CATEGORIES, REGIONS, STAGE_NUM, picsOf } from "@/lib/constants";

const emptyForm = {
  nameEn: "",
  nameCn: "",
  category: "university",
  region: "hongkong",
  website: "",
  logoUrl: "",
  descriptionEn: "",
  descriptionCn: "",
  contactName: "",
  contactEmail: "",
  picNames: [] as string[],
  parentId: "none",
  context: "",
  partnershipType: "",
  startDate: "",
  stage: "s1_new",
  collabLevel: 1,
  notes: "",
};

type FormState = typeof emptyForm;

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const s = String(reader.result);
      resolve(s.slice(s.indexOf(",") + 1));
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** Build a partial payload of only the fields that differ from the original record */
function diffAgainst(p: Partnership, form: FormState): Record<string, unknown> {
  const proposed = toPayload(form);
  const changes: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(proposed)) {
    const cur = (p as any)[k];
    if (Array.isArray(v)) {
      const curArr = k === "picNames" ? picsOf(p) : Array.isArray(cur) ? cur : [];
      if (JSON.stringify(curArr) !== JSON.stringify(v)) changes[k] = v;
      continue;
    }
    if ((cur ?? (typeof v === "string" ? "" : null)) !== v && !(cur == null && (v === "" || v == null))) {
      changes[k] = v;
    }
  }
  return changes;
}

function toPayload(form: FormState) {
  return {
    nameEn: form.nameEn,
    nameCn: form.nameCn,
    category: form.category,
    region: form.region,
    website: form.website,
    logoUrl: form.logoUrl,
    descriptionEn: form.descriptionEn,
    descriptionCn: form.descriptionCn,
    contactName: form.contactName,
    contactEmail: form.contactEmail,
    picNames: form.picNames,
    parentId: form.parentId === "none" ? null : Number(form.parentId),
    context: form.context,
    partnershipType: form.partnershipType,
    startDate: form.startDate,
    stage: form.stage,
    collabLevel: Number(form.collabLevel),
    notes: form.notes,
  };
}

export default function Submit() {
  const { t, lang } = useLang();
  const { user } = useAuth();
  const { toast } = useToast();
  const [mode, setMode] = useState<"new" | "suggest">("new");
  const [form, setForm] = useState<FormState>({ ...emptyForm });
  const [targetId, setTargetId] = useState<string>("");
  const [note, setNote] = useState("");
  const [aiText, setAiText] = useState("");
  const [aiFiles, setAiFiles] = useState<File[]>([]);
  const [understanding, setUnderstanding] = useState<{ en: string; cn: string } | null>(null);
  const [attachments, setAttachments] = useState<AttachmentInput[]>([]);
  const aiFileRef = useRef<HTMLInputElement>(null);
  const attachRef = useRef<HTMLInputElement>(null);

  const set = (key: string, value: any) => setForm((f) => ({ ...f, [key]: value }));

  const { data: mine } = useQuery<Partnership[]>({
    queryKey: ["/api/mine"],
    enabled: !!user,
  });
  const { data: allPartners } = useQuery<Partnership[]>({
    queryKey: ["/api/partnerships"],
    enabled: !!user,
  });

  const target = useMemo(
    () => allPartners?.find((p) => String(p.id) === targetId) ?? null,
    [allPartners, targetId],
  );

  const loadTarget = (id: string) => {
    setTargetId(id);
    const p = allPartners?.find((x) => String(x.id) === id);
    if (!p) return;
    setForm({
      nameEn: p.nameEn ?? "",
      nameCn: p.nameCn ?? "",
      category: p.category,
      region: p.region ?? "hongkong",
      website: p.website ?? "",
      logoUrl: p.logoUrl ?? "",
      descriptionEn: p.descriptionEn ?? "",
      descriptionCn: p.descriptionCn ?? "",
      contactName: p.contactName ?? "",
      contactEmail: p.contactEmail ?? "",
      picNames: picsOf(p),
      parentId: p.parentId ? String(p.parentId) : "none",
      context: p.context ?? "",
      partnershipType: p.partnershipType ?? "",
      startDate: p.startDate ?? "",
      stage: p.stage,
      collabLevel: p.collabLevel,
      notes: p.notes ?? "",
    });
  };

  const extractMutation = useMutation({
    mutationFn: async () => {
      const files = await Promise.all(
        aiFiles.slice(0, 4).map(async (f) => ({
          name: f.name,
          mime: f.type || "application/octet-stream",
          data: await fileToBase64(f),
        })),
      );
      const res = await apiRequest("POST", "/api/ai/extract", { text: aiText, files });
      return res.json();
    },
    onSuccess: (data) => {
      setUnderstanding({ en: data.understandingEn ?? "", cn: data.understandingCn ?? "" });
      const fields = { ...data };
      delete fields.understandingEn;
      delete fields.understandingCn;
      setForm((f) => ({
        ...f,
        ...Object.fromEntries(
          Object.entries(fields).filter(([, v]) => v !== "" && v != null && !Array.isArray(v)),
        ),
        picNames: Array.isArray(fields.picNames) && fields.picNames.length > 0 ? fields.picNames : f.picNames,
      }));
      toast({ title: t("aiDone") });
    },
    onError: () => toast({ title: t("aiFailed"), variant: "destructive" }),
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      const payload = { ...toPayload(form), hallOfFame: 0, attachments };
      const res = await apiRequest("POST", "/api/partnerships", payload);
      return res.json();
    },
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ["/api/mine"] });
      queryClient.invalidateQueries({ queryKey: ["/api/partnerships"] });
      setForm({ ...emptyForm });
      setAiText("");
      setAiFiles([]);
      setAttachments([]);
      setUnderstanding(null);
      toast({ title: created.status === "approved" ? t("submittedAdmin") : t("submitted") });
    },
    onError: () => toast({ title: "Submission failed / 提交失败", variant: "destructive" }),
  });

  const changeMutation = useMutation({
    mutationFn: async () => {
      if (!target) throw new Error("no target");
      const changes = diffAgainst(target, form);
      const res = await apiRequest("POST", "/api/change-requests", {
        partnershipId: target.id,
        changes,
        note: note || undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/change-requests"] });
      setNote("");
      toast({ title: t("changesSubmitted") });
    },
    onError: () => toast({ title: "Submission failed / 提交失败", variant: "destructive" }),
  });

  const addAttachments = async (list: FileList | null) => {
    if (!list) return;
    const next: AttachmentInput[] = [...attachments];
    for (const f of Array.from(list).slice(0, 8 - next.length)) {
      if (f.size > 10 * 1024 * 1024) {
        toast({ title: `${f.name}: > 10 MB`, variant: "destructive" });
        continue;
      }
      next.push({ name: f.name, mime: f.type || "application/octet-stream", data: await fileToBase64(f) });
    }
    setAttachments(next);
    if (attachRef.current) attachRef.current.value = "";
  };

  if (!user) {
    return (
      <Layout>
        <div className="mx-auto max-w-md px-4 py-24 text-center">
          <LogIn className="h-10 w-10 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground mb-6" data-testid="text-login-required">{t("loginRequired")}</p>
          <Link href="/login">
            <Button data-testid="button-go-login">{t("navLogin")}</Button>
          </Link>
        </div>
      </Layout>
    );
  }

  if (user.role === "viewer") {
    return (
      <Layout>
        <div className="mx-auto max-w-md px-4 py-24 text-center">
          <Eye className="h-10 w-10 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground" data-testid="text-viewer-readonly">{t("viewerReadOnly")}</p>
        </div>
      </Layout>
    );
  }

  const isSuggest = mode === "suggest";
  const formReady = isSuggest ? !!target : true;

  return (
    <Layout>
      <div className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-xl md:text-2xl font-extrabold tracking-tight">{t("submitTitle")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("submitBody")}</p>

        {/* Mode tabs: register new / suggest changes */}
        <div className="mt-6 inline-flex rounded-lg border border-border p-0.5 bg-muted/40">
          <button
            onClick={() => { setMode("new"); setForm({ ...emptyForm }); setTargetId(""); }}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${!isSuggest ? "bg-background shadow-sm text-foreground" : "text-muted-foreground"}`}
            data-testid="button-mode-new"
          >
            <PlusCircle className="h-3.5 w-3.5" /> {t("registerNew")}
          </button>
          <button
            onClick={() => { setMode("suggest"); setForm({ ...emptyForm }); setTargetId(""); }}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${isSuggest ? "bg-background shadow-sm text-foreground" : "text-muted-foreground"}`}
            data-testid="button-mode-suggest"
          >
            <FilePen className="h-3.5 w-3.5" /> {t("suggestChanges")}
          </button>
        </div>

        {isSuggest && (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="text-base">{t("suggestChangesTitle")}</CardTitle>
              <CardDescription>{t("suggestChangesBody")}</CardDescription>
            </CardHeader>
            <CardContent>
              <Select value={targetId} onValueChange={loadTarget}>
                <SelectTrigger data-testid="select-change-target">
                  <SelectValue placeholder={t("selectPartner")} />
                </SelectTrigger>
                <SelectContent>
                  {(allPartners ?? []).map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {lang === "cn" && p.nameCn ? p.nameCn : p.nameEn}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>
        )}

        {/* AI quick-fill */}
        {!isSuggest && (
          <Card className="mt-6 border-[hsl(var(--aqua))]/40">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="h-4 w-4 text-[hsl(var(--aqua))]" />
                {t("aiBoxTitle")}
              </CardTitle>
              <CardDescription>{t("aiBoxBody")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                value={aiText}
                onChange={(e) => setAiText(e.target.value)}
                placeholder={t("aiBoxPlaceholder")}
                rows={5}
                data-testid="input-ai-text"
              />
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={aiFileRef}
                  type="file"
                  multiple
                  accept=".pdf,.docx,image/*"
                  className="hidden"
                  onChange={(e) => setAiFiles(Array.from(e.target.files ?? []).slice(0, 4))}
                  data-testid="input-ai-files"
                />
                <Button type="button" variant="outline" size="sm" onClick={() => aiFileRef.current?.click()} data-testid="button-ai-upload">
                  <Paperclip className="h-3.5 w-3.5 mr-1.5" /> {t("aiUploadLabel")}
                </Button>
                {aiFiles.map((f, i) => (
                  <Badge key={i} variant="secondary" className="gap-1 max-w-[220px]">
                    <span className="truncate">{f.name}</span>
                    <button type="button" onClick={() => setAiFiles((fs) => fs.filter((_, j) => j !== i))} aria-label="remove">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
              <Button
                onClick={() => extractMutation.mutate()}
                disabled={extractMutation.isPending || (aiText.trim().length < 20 && aiFiles.length === 0)}
                data-testid="button-ai-extract"
              >
                {extractMutation.isPending ? (
                  <><Loader2 className="h-4 w-4 animate-spin mr-2" />{t("aiExtracting")}</>
                ) : (
                  <><Sparkles className="h-4 w-4 mr-2" />{t("aiExtract")}</>
                )}
              </Button>

              {understanding && (understanding.en || understanding.cn) && (
                <div className="rounded-lg bg-muted p-3" data-testid="panel-ai-understanding">
                  <p className="text-xs font-semibold text-muted-foreground mb-1">{t("aiUnderstanding")}</p>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">
                    {lang === "cn" ? understanding.cn || understanding.en : understanding.en || understanding.cn}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">{t("aiUnderstandingHint")}</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Form */}
        {formReady && (
          <form
            className="mt-8 space-y-6"
            onSubmit={(e) => {
              e.preventDefault();
              if (isSuggest) changeMutation.mutate();
              else submitMutation.mutate();
            }}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label={t("nameEn")} required>
                <Input required value={form.nameEn} onChange={(e) => set("nameEn", e.target.value)} data-testid="input-name-en" />
              </Field>
              <Field label={t("nameCn")}>
                <Input value={form.nameCn} onChange={(e) => set("nameCn", e.target.value)} data-testid="input-name-cn" />
              </Field>
              <Field label={t("filterCategory")}>
                <Select value={form.category} onValueChange={(v) => set("category", v)}>
                  <SelectTrigger data-testid="select-form-category"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>{t(`cat_${c}` as any)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label={t("region")}>
                <Select value={form.region} onValueChange={(v) => set("region", v)}>
                  <SelectTrigger data-testid="select-form-region"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {REGIONS.map((r) => (
                      <SelectItem key={r} value={r}>{t(`region_${r}` as any)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label={t("picsLabel")}>
                <PicChecklist value={form.picNames} onChange={(v) => set("picNames", v)} />
              </Field>
              <Field label={t("parentLabel")}>
                <Select value={form.parentId} onValueChange={(v) => set("parentId", v)}>
                  <SelectTrigger data-testid="select-form-parent"><SelectValue placeholder={t("parentSelect")} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("parentNone")}</SelectItem>
                    {(allPartners ?? [])
                      .filter((p) => !isSuggest || String(p.id) !== targetId)
                      .map((p) => (
                        <SelectItem key={p.id} value={String(p.id)}>
                          {lang === "cn" && p.nameCn ? p.nameCn : p.nameEn}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label={t("partnershipType")}>
                <Input value={form.partnershipType} onChange={(e) => set("partnershipType", e.target.value)} placeholder="Joint fund / Deal flow MOU…" data-testid="input-type" />
              </Field>
              <Field label={t("website")}>
                <Input type="url" value={form.website} onChange={(e) => set("website", e.target.value)} placeholder="https://…" data-testid="input-website" />
              </Field>
              <Field label={t("logoUrl")} hint={t("logoHint")}>
                <Input value={form.logoUrl} onChange={(e) => set("logoUrl", e.target.value)} placeholder="https://…" data-testid="input-logo" />
              </Field>
              <Field label={t("contactName")}>
                <Input value={form.contactName} onChange={(e) => set("contactName", e.target.value)} data-testid="input-contact-name" />
              </Field>
              <Field label={t("contactEmail")}>
                <Input type="email" value={form.contactEmail} onChange={(e) => set("contactEmail", e.target.value)} data-testid="input-contact-email" />
              </Field>
              <Field label={t("startDate")}>
                <Input type="date" value={form.startDate} onChange={(e) => set("startDate", e.target.value)} data-testid="input-start-date" />
              </Field>
              <Field label={t("filterStage")}>
                <Select value={form.stage} onValueChange={(v) => set("stage", v)}>
                  <SelectTrigger data-testid="select-form-stage"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STAGES.map((s) => (
                      <SelectItem key={s} value={s}>{STAGE_NUM[s]} · {t(`stage_${s}` as any)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <Field label={`${t("collabLevel")}: ${form.collabLevel}/5`}>
              <Slider
                value={[Number(form.collabLevel)]}
                onValueChange={([v]) => set("collabLevel", v)}
                min={1} max={5} step={1}
                data-testid="slider-collab-level"
              />
            </Field>

            <Field label={t("descriptionEn")}>
              <Textarea rows={3} value={form.descriptionEn} onChange={(e) => set("descriptionEn", e.target.value)} data-testid="input-desc-en" />
            </Field>
            <Field label={t("descriptionCn")}>
              <Textarea rows={3} value={form.descriptionCn} onChange={(e) => set("descriptionCn", e.target.value)} data-testid="input-desc-cn" />
            </Field>
            <Field label={t("contextLabel")} hint={t("contextHint")}>
              <Textarea rows={4} value={form.context} onChange={(e) => set("context", e.target.value)} data-testid="input-context" />
            </Field>
            <Field label={t("notes")}>
              <Textarea rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} data-testid="input-notes" />
            </Field>

            {/* Attachments (new submissions only) */}
            {!isSuggest && (
              <Field label={t("attachments")} hint={t("attachmentsHint")}>
                <div className="space-y-2">
                  <input
                    ref={attachRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(e) => addAttachments(e.target.files)}
                    data-testid="input-attachments"
                  />
                  <Button type="button" variant="outline" size="sm" onClick={() => attachRef.current?.click()} data-testid="button-add-attachment">
                    <Paperclip className="h-3.5 w-3.5 mr-1.5" /> {t("addAttachment")}
                  </Button>
                  {attachments.map((a, i) => (
                    <div key={i} className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
                      <Paperclip className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="truncate">{a.name}</span>
                      <button
                        type="button"
                        className="ml-auto text-muted-foreground hover:text-destructive"
                        onClick={() => setAttachments((as) => as.filter((_, j) => j !== i))}
                        aria-label="remove attachment"
                        data-testid={`button-remove-attachment-${i}`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </Field>
            )}

            {isSuggest && (
              <Field label={t("changeNote")}>
                <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} data-testid="input-change-note" />
              </Field>
            )}

            <Button
              type="submit"
              size="lg"
              disabled={submitMutation.isPending || changeMutation.isPending}
              data-testid="button-submit-partnership"
            >
              {submitMutation.isPending || changeMutation.isPending ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" />{t("submitting")}</>
              ) : isSuggest ? (
                t("submitChanges")
              ) : (
                t("submitBtn")
              )}
            </Button>
          </form>
        )}

        {/* My submissions */}
        {!isSuggest && mine && mine.length > 0 && (
          <div className="mt-14">
            <h2 className="text-base font-bold mb-4">{t("mySubmissions")}</h2>
            <div className="space-y-2">
              {mine.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-card-border bg-card px-4 py-3"
                  data-testid={`row-mine-${p.id}`}
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-sm truncate">
                      {lang === "cn" && p.nameCn ? p.nameCn : p.nameEn}
                    </p>
                    <div className="mt-1 flex items-center gap-2">
                      <StageBadge stage={p.stage as Stage} />
                    </div>
                  </div>
                  <Badge
                    variant={p.status === "approved" ? "default" : p.status === "rejected" ? "destructive" : "secondary"}
                    data-testid={`status-mine-${p.id}`}
                  >
                    {t(`status_${p.status}` as any)}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}

function Field({ label, children, required, hint }: { label: string; children: React.ReactNode; required?: boolean; hint?: string }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">
        {label} {required && <span className="text-destructive">*</span>}
      </Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
