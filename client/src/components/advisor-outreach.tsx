import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useLang } from "@/lib/i18n";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { AdvisorWithRoles } from "@shared/schema";
import { Mail, Send, Loader2, Users, Check, Braces, Copy } from "lucide-react";
import { copyText } from "@/lib/download";
import { cn } from "@/lib/utils";

type OutreachTemplate = "onboarding_invite" | "general_update";

interface Recipient {
  advisorId: number;
  name: string;
  firstName: string;
  organization: string;
  to: string[];
}

interface ComposeResponse {
  template: { key: string; subject: string; body: string };
  recipients: Recipient[];
  mailEnabled: boolean;
}

const PLACEHOLDERS = ["{{name}}", "{{first_name}}", "{{organization}}"] as const;

/** Resolve {{name}} / {{first_name}} / {{organization}} for one recipient. */
function resolve(text: string, r: Recipient): string {
  return text
    .replace(/\{\{\s*first_name\s*\}\}/gi, r.firstName || r.name)
    .replace(/\{\{\s*name\s*\}\}/gi, r.name)
    .replace(/\{\{\s*organization\s*\}\}/gi, r.organization || "");
}

type Step = 1 | 2 | 3;

export function OutreachDialog({
  open, onOpenChange, advisors,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Candidate advisors — normally the currently filtered list. */
  advisors: AdvisorWithRoles[];
}) {
  const { t } = useLang();
  const { toast } = useToast();
  const [step, setStep] = useState<Step>(1);
  const [template, setTemplate] = useState<OutreachTemplate>("onboarding_invite");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [previewId, setPreviewId] = useState<number | null>(null);
  const [mailEnabled, setMailEnabled] = useState(true);
  const [sent, setSent] = useState<number[]>([]);
  const [failed, setFailed] = useState<number[]>([]);
  const [sendingId, setSendingId] = useState<number | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  const compose = useMutation({
    mutationFn: async (key: OutreachTemplate) => {
      const res = await apiRequest("POST", "/api/advisors/outreach/compose", {
        advisorIds: advisors.map((a) => a.id),
        template: key,
      });
      return res.json() as Promise<ComposeResponse>;
    },
    onSuccess: (data) => {
      setSubject(data.template.subject);
      setBody(data.template.body);
      setRecipients(data.recipients);
      setMailEnabled(data.mailEnabled);
      const withEmail = data.recipients.filter((r) => r.to.length > 0).map((r) => r.advisorId);
      setSelected(withEmail);
      setPreviewId(withEmail[0] ?? data.recipients[0]?.advisorId ?? null);
    },
    onError: (e: any) => toast({ description: String(e?.message ?? e), variant: "destructive" }),
  });

  // Reset and pull the template each time the dialog opens for a new candidate set.
  const openKey = advisors.map((a) => a.id).join(",");
  if (open && loadedFor !== openKey && advisors.length > 0) {
    setLoadedFor(openKey);
    setStep(1);
    setSent([]);
    setFailed([]);
    compose.mutate(template);
  }
  if (!open && loadedFor !== null) setLoadedFor(null);

  const chosen = useMemo(
    () => recipients.filter((r) => selected.includes(r.advisorId) && r.to.length > 0),
    [recipients, selected],
  );
  const previewRecipient = useMemo(
    () => chosen.find((r) => r.advisorId === previewId) ?? chosen[0] ?? null,
    [chosen, previewId],
  );

  const insertPlaceholder = (ph: string) => setBody((b) => (b ? `${b}${b.endsWith(" ") ? "" : " "}${ph}` : ph));

  const send = useMutation({
    mutationFn: async (r: Recipient) => {
      const res = await apiRequest("POST", "/api/advisors/outreach/send", {
        advisorId: r.advisorId,
        to: r.to,
        subject: resolve(subject, r),
        body: resolve(body, r),
      });
      return res.json();
    },
  });

  const sendOne = async (r: Recipient) => {
    setSendingId(r.advisorId);
    try {
      await send.mutateAsync(r);
      setSent((s) => (s.includes(r.advisorId) ? s : [...s, r.advisorId]));
      setFailed((f) => f.filter((x) => x !== r.advisorId));
    } catch (e: any) {
      setFailed((f) => (f.includes(r.advisorId) ? f : [...f, r.advisorId]));
      toast({ description: String(e?.message ?? e), variant: "destructive" });
    } finally {
      setSendingId(null);
    }
  };

  const sendAll = async () => {
    for (const r of chosen) {
      if (sent.includes(r.advisorId)) continue;
      await sendOne(r);
    }
  };

  const mailtoFor = (r: Recipient) =>
    `mailto:${r.to.join(",")}?subject=${encodeURIComponent(resolve(subject, r))}&body=${encodeURIComponent(resolve(body, r))}`;

  // v5.10 — copy the fully resolved email as plain text (fallback when no mail client is set up)
  const copyFor = async (r: Recipient) => {
    const text = `To: ${r.to.join(", ")}\nSubject: ${resolve(subject, r)}\n\n${resolve(body, r)}`;
    const ok = await copyText(text);
    toast(ok ? { description: t("copiedToClipboard") } : { description: t("copyFailed"), variant: "destructive" });
  };

  const templateLabel = template === "onboarding_invite" ? t("outreachTplOnboarding") : t("outreachTplUpdate");
  const summary = t("outreachSummary").replace("{n}", String(chosen.length)).replace("{t}", templateLabel);

  const STEPS: Array<{ n: Step; label: string }> = [
    { n: 1, label: t("outreachStepTemplate") },
    { n: 2, label: t("outreachStepPreview") },
    { n: 3, label: t("outreachStepSend") },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto" data-testid="dialog-outreach">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-[hsl(var(--gold))]" /> {t("outreachTitle")}
          </DialogTitle>
          <DialogDescription>{t("outreachPlaceholderHint")}</DialogDescription>
        </DialogHeader>

        {/* Stepper */}
        <div className="flex flex-wrap items-center gap-2 border-b border-border pb-3">
          {STEPS.map((s, i) => (
            <span key={s.n} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => { if (s.n < step) setStep(s.n); }}
                disabled={s.n > step}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors",
                  s.n === step
                    ? "border-[hsl(193,52%,38%)] bg-[hsl(193,52%,38%)]/10 text-[hsl(193,52%,30%)] dark:text-[hsl(193,60%,60%)]"
                    : "border-border text-muted-foreground",
                  s.n < step && "hover:bg-secondary",
                )}
                data-testid={`button-outreach-step-${s.n}`}
              >
                <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-secondary text-[10px]">{s.n}</span>
                {s.label}
              </button>
              {i < STEPS.length - 1 && <span className="text-muted-foreground">→</span>}
            </span>
          ))}
          <span className="ml-auto text-xs text-muted-foreground" data-testid="text-outreach-summary">{summary}</span>
        </div>

        {compose.isPending ? (
          <div className="space-y-2 py-4">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-9 w-full rounded-md" />)}
          </div>
        ) : recipients.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground" data-testid="text-outreach-empty">{t("outreachNoRecipients")}</p>
        ) : (
          <div className="space-y-4 pt-1">
            {/* ---------- Step 1: one editable template ---------- */}
            {step === 1 && (
              <>
                <div className="space-y-1">
                  <Label>{t("outreachTemplate")}</Label>
                  <Select
                    value={template}
                    onValueChange={(v) => { setTemplate(v as OutreachTemplate); compose.mutate(v as OutreachTemplate); }}
                  >
                    <SelectTrigger className="w-64" data-testid="select-outreach-template"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="onboarding_invite">{t("outreachTplOnboarding")}</SelectItem>
                      <SelectItem value="general_update">{t("outreachTplUpdate")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label>{t("outreachSubject")}</Label>
                  <Input value={subject} onChange={(e) => setSubject(e.target.value)} data-testid="input-outreach-subject" />
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label>{t("outreachBody")}</Label>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button type="button" size="sm" variant="outline" className="h-7" data-testid="button-outreach-placeholder">
                          <Braces className="mr-1.5 h-3.5 w-3.5" /> {t("outreachInsertPlaceholder")}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {PLACEHOLDERS.map((ph) => (
                          <DropdownMenuItem key={ph} onClick={() => insertPlaceholder(ph)} data-testid={`item-placeholder-${ph.replace(/[{}]/g, "")}`}>
                            {ph}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <Textarea rows={10} value={body} onChange={(e) => setBody(e.target.value)} data-testid="textarea-outreach-body" />
                  <p className="text-[11px] text-muted-foreground">{PLACEHOLDERS.join("  ")}</p>
                </div>

                {/* Recipient selection */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="flex items-center gap-1.5">
                      <Users className="h-3.5 w-3.5" /> {t("outreachRecipients")}
                    </Label>
                    <div className="flex gap-2">
                      <Button type="button" size="sm" variant="ghost" className="h-7"
                        onClick={() => setSelected(recipients.filter((r) => r.to.length > 0).map((r) => r.advisorId))}
                        data-testid="button-outreach-select-all">
                        {t("outreachSelectAll")}
                      </Button>
                      <Button type="button" size="sm" variant="ghost" className="h-7" onClick={() => setSelected([])} data-testid="button-outreach-clear">
                        {t("outreachClear")}
                      </Button>
                    </div>
                  </div>
                  <div className="max-h-56 divide-y divide-border overflow-y-auto rounded-lg border border-border">
                    {recipients.map((r) => {
                      const noEmail = r.to.length === 0;
                      return (
                        <label
                          key={r.advisorId}
                          className={cn("flex cursor-pointer items-center gap-2 px-3 py-2 text-sm", noEmail && "cursor-not-allowed opacity-60")}
                          data-testid={`row-outreach-candidate-${r.advisorId}`}
                        >
                          <Checkbox
                            checked={selected.includes(r.advisorId)}
                            disabled={noEmail}
                            onCheckedChange={(v) =>
                              setSelected((s) => (v === true ? [...s, r.advisorId] : s.filter((x) => x !== r.advisorId)))
                            }
                            data-testid={`checkbox-outreach-${r.advisorId}`}
                          />
                          <span className="font-medium">{r.name}</span>
                          {r.organization && <span className="truncate text-xs text-muted-foreground">{r.organization}</span>}
                          <span className="ml-auto truncate text-xs text-muted-foreground">
                            {noEmail ? t("outreachNoEmail") : r.to.join(", ")}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            {/* ---------- Step 2: live per-recipient preview ---------- */}
            {step === 2 && (
              <div className="space-y-3" data-testid="preview-outreach">
                <div className="space-y-1">
                  <Label>{t("outreachPreviewFor")}</Label>
                  <Select
                    value={previewRecipient ? String(previewRecipient.advisorId) : ""}
                    onValueChange={(v) => setPreviewId(Number(v))}
                  >
                    <SelectTrigger className="w-72" data-testid="select-outreach-preview"><SelectValue /></SelectTrigger>
                    <SelectContent className="max-h-64">
                      {chosen.map((r) => (
                        <SelectItem key={r.advisorId} value={String(r.advisorId)}>{r.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {previewRecipient ? (
                  <div className="space-y-2 rounded-lg border border-border bg-secondary/20 p-3">
                    <p className="text-xs text-muted-foreground">
                      {t("outreachToLabel")}: <span className="font-medium text-foreground" data-testid="text-preview-to">{previewRecipient.to.join(", ")}</span>
                    </p>
                    <p className="text-sm font-semibold" data-testid="text-preview-subject">{resolve(subject, previewRecipient)}</p>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("outreachResolvedBody")}</p>
                    <p className="whitespace-pre-line text-sm leading-relaxed" data-testid="text-preview-body">{resolve(body, previewRecipient)}</p>
                  </div>
                ) : (
                  <p className="py-6 text-center text-sm text-muted-foreground">{t("outreachNoneSelected")}</p>
                )}
              </div>
            )}

            {/* ---------- Step 3: send ---------- */}
            {step === 3 && (
              <div className="space-y-3">
                {!mailEnabled && (
                  <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400" data-testid="text-outreach-mail-disabled">
                    {t("outreachMailDisabled")}
                  </p>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground" data-testid="text-outreach-progress">
                    {t("outreachSendProgress").replace("{a}", String(sent.length)).replace("{b}", String(chosen.length))}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    disabled={!mailEnabled || chosen.length === 0 || sendingId !== null || sent.length === chosen.length}
                    onClick={sendAll}
                    className="bg-[hsl(193,52%,38%)] text-white hover:bg-[hsl(193,52%,30%)]"
                    data-testid="button-outreach-send-all"
                  >
                    {sendingId !== null ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1.5 h-3.5 w-3.5" />}
                    {t("outreachSendAll")}
                  </Button>
                </div>
                <div className="divide-y divide-border rounded-lg border border-border">
                  {chosen.map((r) => (
                    <div key={r.advisorId} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm" data-testid={`row-outreach-send-${r.advisorId}`}>
                      <span className="font-medium">{r.name}</span>
                      <span className="truncate text-xs text-muted-foreground">{r.to.join(", ")}</span>
                      <div className="ml-auto flex items-center gap-2">
                        {sent.includes(r.advisorId) && (
                          <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-[10px] text-emerald-600" data-testid={`badge-outreach-sent-${r.advisorId}`}>
                            <Check className="mr-1 h-3 w-3" /> {t("outreachSent")}
                          </Badge>
                        )}
                        {failed.includes(r.advisorId) && (
                          <Badge variant="outline" className="border-rose-500/40 bg-rose-500/10 text-[10px] text-rose-600" data-testid={`badge-outreach-failed-${r.advisorId}`}>
                            {t("outreachFailedRow")}
                          </Badge>
                        )}
                        <button
                          type="button"
                          onClick={() => copyFor(r)}
                          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-secondary"
                          data-testid={`button-copy-outreach-${r.advisorId}`}
                        >
                          <Copy className="h-3 w-3" /> {t("outreachCopyText")}
                        </button>
                        <a
                          href={mailtoFor(r)}
                          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-secondary"
                          data-testid={`button-draft-mailto-${r.advisorId}`}
                        >
                          <Mail className="h-3 w-3" /> {t("outreachOpenMail")}
                        </a>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7"
                          disabled={!mailEnabled || sendingId !== null || sent.includes(r.advisorId)}
                          onClick={() => sendOne(r)}
                          data-testid={`button-draft-send-${r.advisorId}`}
                        >
                          {sendingId === r.advisorId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t("outreachSendServer")}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Stepper controls */}
            <div className="flex justify-end gap-2 border-t border-border pt-3">
              {step > 1 && (
                <Button type="button" variant="outline" onClick={() => setStep((s) => (s - 1) as Step)} data-testid="button-outreach-prev">
                  {t("outreachPrev")}
                </Button>
              )}
              {step < 3 && (
                <Button
                  type="button"
                  disabled={chosen.length === 0 || !subject.trim() || !body.trim()}
                  onClick={() => setStep((s) => (s + 1) as Step)}
                  className="bg-[hsl(193,52%,38%)] text-white hover:bg-[hsl(193,52%,30%)]"
                  data-testid="button-outreach-next"
                >
                  {t("outreachNext")}
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
