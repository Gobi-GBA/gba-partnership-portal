import { useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useLang } from "@/lib/i18n";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import type { AdvisorWithRoles } from "@shared/schema";
import { markdownToPlainText, resolveOutreachPlaceholders } from "@shared/markdown";
import { Mail, Send, Loader2, Users, Check, Braces, Copy, ChevronDown, Plus, X, CircleAlert, CircleCheck } from "lucide-react";
import { copyText } from "@/lib/download";
import { cn } from "@/lib/utils";
import {
  MarkdownEmailEditor,
  MarkdownPreview,
  type MarkdownEmailEditorHandle,
} from "@/components/markdown-email-editor";

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
  copyCandidates: CopyCandidate[];
  mailEnabled: boolean;
}

interface CopyCandidate {
  userId: number;
  name: string;
  email: string;
}

interface CampaignSnapshot {
  subject: string;
  body: string;
  recipientIds: number[];
  campaignAdvisorIds: number[];
  userIds: number[];
  customEmails: string[];
}

type CopyStatus = "idle" | "sending" | "sent" | "failed";

const PLACEHOLDERS = ["{{name}}", "{{first_name}}", "{{organization}}"] as const;

const recipientValues = (r: Recipient) => ({
  name: r.name,
  firstName: r.firstName || r.name,
  organization: r.organization || "",
});

const resolvePlain = (text: string, r: Recipient) =>
  resolveOutreachPlaceholders(text, recipientValues(r));

const resolveMarkdown = (text: string, r: Recipient) =>
  resolveOutreachPlaceholders(text, recipientValues(r), true);

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
  const [copyCandidates, setCopyCandidates] = useState<CopyCandidate[]>([]);
  const [copyUserIds, setCopyUserIds] = useState<number[]>([]);
  const [customEmails, setCustomEmails] = useState<string[]>([]);
  const [customEmailInput, setCustomEmailInput] = useState("");
  const [copyPickerOpen, setCopyPickerOpen] = useState(false);
  const [copyStatus, setCopyStatus] = useState<CopyStatus>("idle");
  const [campaignLocked, setCampaignLocked] = useState(false);
  const bodyEditorRef = useRef<MarkdownEmailEditorHandle>(null);
  const sentRef = useRef<number[]>([]);
  const copyStatusRef = useRef<CopyStatus>("idle");
  const campaignSnapshotRef = useRef<CampaignSnapshot | null>(null);

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
      setCopyCandidates(data.copyCandidates);
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
    sentRef.current = [];
    setCopyUserIds([]);
    setCustomEmails([]);
    setCustomEmailInput("");
    setCopyStatus("idle");
    copyStatusRef.current = "idle";
    setCampaignLocked(false);
    campaignSnapshotRef.current = null;
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

  const insertPlaceholder = (ph: string) => bodyEditorRef.current?.insertText(ph);

  const send = useMutation({
    mutationFn: async ({ r, message }: { r: Recipient; message: Pick<CampaignSnapshot, "subject" | "body"> }) => {
      const res = await apiRequest("POST", "/api/advisors/outreach/send", {
        advisorId: r.advisorId,
        to: r.to[0],
        subject: message.subject,
        body: message.body,
      });
      return res.json();
    },
  });

  const currentSnapshot = (): CampaignSnapshot => ({
    subject,
    body,
    recipientIds: chosen.map((r) => r.advisorId),
    campaignAdvisorIds: recipients.filter((r) => r.to.length > 0).map((r) => r.advisorId),
    userIds: [...copyUserIds],
    customEmails: [...customEmails],
  });

  const sendCampaignCopy = async (snapshot: CampaignSnapshot, sentIds: number[]) => {
    const hasCopyRecipients = snapshot.userIds.length + snapshot.customEmails.length > 0;
    const allSent = snapshot.recipientIds.every((id) => sentIds.includes(id));
    if (!hasCopyRecipients || !allSent || copyStatusRef.current === "sending" || copyStatusRef.current === "sent") return;
    copyStatusRef.current = "sending";
    setCopyStatus("sending");
    try {
      await apiRequest("POST", "/api/advisors/outreach/summary", {
        campaignAdvisorIds: snapshot.campaignAdvisorIds,
        sentAdvisorIds: snapshot.recipientIds,
        subject: snapshot.subject,
        body: snapshot.body,
        userIds: snapshot.userIds,
        customEmails: snapshot.customEmails,
      });
      copyStatusRef.current = "sent";
      setCopyStatus("sent");
      toast({ description: t("outreachCopySent") });
    } catch (e: any) {
      copyStatusRef.current = "failed";
      setCopyStatus("failed");
      toast({ description: String(e?.message ?? e), variant: "destructive" });
    }
  };

  const sendOne = async (r: Recipient) => {
    setSendingId(r.advisorId);
    const snapshot = campaignSnapshotRef.current ?? currentSnapshot();
    try {
      await send.mutateAsync({ r, message: snapshot });
      if (!campaignSnapshotRef.current) campaignSnapshotRef.current = snapshot;
      setCampaignLocked(true);
      const nextSent = sentRef.current.includes(r.advisorId) ? sentRef.current : [...sentRef.current, r.advisorId];
      sentRef.current = nextSent;
      setSent(nextSent);
      setFailed((f) => f.filter((x) => x !== r.advisorId));
      await sendCampaignCopy(snapshot, nextSent);
    } catch (e: any) {
      setFailed((f) => (f.includes(r.advisorId) ? f : [...f, r.advisorId]));
      toast({ description: String(e?.message ?? e), variant: "destructive" });
    } finally {
      setSendingId(null);
    }
  };

  const sendAll = async () => {
    for (const r of chosen) {
      if (sentRef.current.includes(r.advisorId)) continue;
      await sendOne(r);
    }
  };

  const retryCampaignCopy = () => {
    const snapshot = campaignSnapshotRef.current;
    if (!snapshot) return;
    copyStatusRef.current = "idle";
    void sendCampaignCopy(snapshot, sentRef.current);
  };

  const addCustomEmail = () => {
    const email = customEmailInput.trim().toLowerCase();
    if (!/^[^@\s]+@gobi\.vc$/i.test(email)) {
      toast({ description: t("outreachCopyGobiOnly"), variant: "destructive" });
      return;
    }
    const candidate = copyCandidates.find((item) => item.email.toLowerCase() === email);
    if (candidate) {
      if (copyUserIds.includes(candidate.userId)) {
        toast({ description: t("outreachCopyDuplicate"), variant: "destructive" });
        return;
      }
      if (customEmails.length + copyUserIds.length >= 50) {
        toast({ description: t("outreachCopyLimit"), variant: "destructive" });
        return;
      }
      setCopyUserIds((ids) => [...ids, candidate.userId]);
      setCustomEmailInput("");
      return;
    }
    const selectedCandidateEmails = copyCandidates
      .filter((item) => copyUserIds.includes(item.userId))
      .map((item) => item.email.toLowerCase());
    if (customEmails.includes(email) || selectedCandidateEmails.includes(email)) {
      toast({ description: t("outreachCopyDuplicate"), variant: "destructive" });
      return;
    }
    if (customEmails.length + copyUserIds.length >= 50) {
      toast({ description: t("outreachCopyLimit"), variant: "destructive" });
      return;
    }
    setCustomEmails((emails) => [...emails, email]);
    setCustomEmailInput("");
  };

  const mailtoFor = (r: Recipient) =>
    `mailto:${r.to.join(",")}?subject=${encodeURIComponent(resolvePlain(subject, r))}&body=${encodeURIComponent(markdownToPlainText(resolveMarkdown(body, r)))}`;

  // v5.10 — copy the fully resolved email as plain text (fallback when no mail client is set up)
  const copyFor = async (r: Recipient) => {
    const text = `To: ${r.to.join(", ")}\nSubject: ${resolvePlain(subject, r)}\n\n${markdownToPlainText(resolveMarkdown(body, r))}`;
    const ok = await copyText(text);
    toast(ok ? { description: t("copiedToClipboard") } : { description: t("copyFailed"), variant: "destructive" });
  };

  const selectedCopyUsers = copyCandidates.filter((item) => copyUserIds.includes(item.userId));
  const copyRecipientCount = selectedCopyUsers.length + customEmails.length;

  const templateLabel = template === "onboarding_invite" ? t("outreachTplOnboarding") : t("outreachTplUpdate");
  const summary = t("outreachSummary").replace("{n}", String(chosen.length)).replace("{t}", templateLabel);

  const STEPS: Array<{ n: Step; label: string }> = [
    { n: 1, label: t("outreachStepTemplate") },
    { n: 2, label: t("outreachStepPreview") },
    { n: 3, label: t("outreachStepSend") },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="grid-cols-[minmax(0,1fr)] w-[calc(100%-1rem)] max-w-3xl max-h-[88vh] overflow-x-hidden overflow-y-auto p-4 sm:p-6" data-testid="dialog-outreach">
        <DialogHeader className="min-w-0">
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-[hsl(var(--gold))]" /> {t("outreachTitle")}
          </DialogTitle>
          <DialogDescription>{t("outreachPlaceholderHint")}</DialogDescription>
        </DialogHeader>

        {/* Stepper */}
        <div className="flex min-w-0 flex-wrap items-center gap-2 border-b border-border pb-3">
          {STEPS.map((s, i) => (
            <span key={s.n} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => { if (s.n < step && !campaignLocked) setStep(s.n); }}
                disabled={s.n > step || (campaignLocked && s.n < step)}
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
          <div className="min-w-0 space-y-4 pt-1">
            {/* ---------- Step 1: one editable template ---------- */}
            {step === 1 && (
              <>
                <div className="space-y-1">
                  <Label>{t("outreachTemplate")}</Label>
                  <Select
                    value={template}
                    onValueChange={(v) => { setTemplate(v as OutreachTemplate); compose.mutate(v as OutreachTemplate); }}
                  >
                    <SelectTrigger className="w-64 max-w-full" data-testid="select-outreach-template"><SelectValue /></SelectTrigger>
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
                  <div className="flex flex-wrap items-center justify-between gap-2">
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
                  <MarkdownEmailEditor
                    ref={bodyEditorRef}
                    rows={10}
                    value={body}
                    onChange={setBody}
                    testId="textarea-outreach-body"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    {t("markdownFormattingHint")} {PLACEHOLDERS.join(" · ")}
                  </p>
                </div>

                {/* Recipient selection */}
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
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
                          className={cn("flex min-w-0 cursor-pointer items-center gap-2 px-3 py-2 text-sm", noEmail && "cursor-not-allowed opacity-60")}
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
                          <span className="min-w-0 truncate font-medium">{r.name}</span>
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
                    <SelectTrigger className="w-72 max-w-full" data-testid="select-outreach-preview"><SelectValue /></SelectTrigger>
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
                    <p className="text-sm font-semibold" data-testid="text-preview-subject">{resolvePlain(subject, previewRecipient)}</p>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("outreachResolvedBody")}</p>
                    <MarkdownPreview
                      markdown={resolveMarkdown(body, previewRecipient)}
                      className="rounded-md bg-background/35 p-3"
                      testId="text-preview-body"
                    />
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
                <div className="space-y-2 rounded-lg border border-border bg-secondary/15 p-3" data-testid="panel-outreach-copy-recipients">
                  <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Label className="flex items-center gap-1.5">
                        <Users className="h-3.5 w-3.5" /> {t("outreachCopyRecipients")}
                      </Label>
                      <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{t("outreachCopyHint")}</p>
                    </div>
                    {campaignLocked && (
                      <Badge variant="outline" className="shrink-0 text-[10px]">{t("outreachCampaignLocked")}</Badge>
                    )}
                  </div>

                  <Popover open={copyPickerOpen} onOpenChange={setCopyPickerOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        role="combobox"
                        aria-expanded={copyPickerOpen}
                        disabled={campaignLocked || sendingId !== null}
                        className="h-auto min-h-9 w-full min-w-0 justify-between px-3 py-2 font-normal"
                        data-testid="select-outreach-copy-users"
                      >
                        <span className={cn("truncate", copyUserIds.length === 0 && "text-muted-foreground")}>
                          {copyUserIds.length > 0
                            ? t("outreachCopyUsersSelected").replace("{n}", String(copyUserIds.length))
                            : t("outreachCopySelectUsers")}
                        </span>
                        <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-2rem)] p-0" align="start" collisionPadding={16}>
                      <Command>
                        <CommandInput placeholder={t("outreachCopySearchUsers")} data-testid="input-outreach-copy-search" />
                        <CommandList className="max-h-64">
                          <CommandEmpty>{t("outreachCopyNoUsers")}</CommandEmpty>
                          {copyCandidates.map((candidate) => {
                            const checked = copyUserIds.includes(candidate.userId);
                            return (
                              <CommandItem
                                key={candidate.userId}
                                value={`${candidate.name} ${candidate.email}`}
                                onSelect={() => {
                                  if (checked) {
                                    setCopyUserIds((ids) => ids.filter((id) => id !== candidate.userId));
                                    return;
                                  }
                                  if (copyRecipientCount >= 50) {
                                    toast({ description: t("outreachCopyLimit"), variant: "destructive" });
                                    return;
                                  }
                                  setCustomEmails((emails) => emails.filter((email) => email !== candidate.email.toLowerCase()));
                                  setCopyUserIds((ids) => [...ids, candidate.userId]);
                                }}
                                data-testid={`option-outreach-copy-user-${candidate.userId}`}
                              >
                                <Check className={cn("h-4 w-4", checked ? "opacity-100" : "opacity-0")} />
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate font-medium">{candidate.name}</span>
                                  <span className="block truncate text-xs text-muted-foreground">{candidate.email}</span>
                                </span>
                              </CommandItem>
                            );
                          })}
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>

                  <div className="flex min-w-0 gap-2">
                    <Input
                      type="email"
                      inputMode="email"
                      value={customEmailInput}
                      onChange={(event) => setCustomEmailInput(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          addCustomEmail();
                        }
                      }}
                      disabled={campaignLocked || sendingId !== null}
                      placeholder={t("outreachCopyEmailPlaceholder")}
                      className="min-w-0"
                      data-testid="input-outreach-copy-email"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={addCustomEmail}
                      disabled={campaignLocked || sendingId !== null || !customEmailInput.trim()}
                      aria-label={t("outreachCopyAddEmail")}
                      title={t("outreachCopyAddEmail")}
                      data-testid="button-outreach-copy-add-email"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>

                  {copyRecipientCount > 0 && (
                    <div className="flex min-w-0 flex-wrap gap-1.5" data-testid="list-outreach-copy-recipients">
                      {selectedCopyUsers.map((candidate) => (
                        <Badge key={candidate.userId} variant="secondary" className="h-auto max-w-full gap-1 py-1 pl-2 pr-1 font-normal">
                          <span className="min-w-0 truncate">{candidate.name} · {candidate.email}</span>
                          <button
                            type="button"
                            onClick={() => setCopyUserIds((ids) => ids.filter((id) => id !== candidate.userId))}
                            disabled={campaignLocked || sendingId !== null}
                            aria-label={t("outreachCopyRemove").replace("{email}", candidate.email)}
                            title={t("outreachCopyRemove").replace("{email}", candidate.email)}
                            className="rounded p-0.5 hover:bg-background/60 disabled:opacity-50"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                      {customEmails.map((email) => (
                        <Badge key={email} variant="secondary" className="h-auto max-w-full gap-1 py-1 pl-2 pr-1 font-normal">
                          <span className="min-w-0 truncate">{email}</span>
                          <button
                            type="button"
                            onClick={() => setCustomEmails((emails) => emails.filter((item) => item !== email))}
                            disabled={campaignLocked || sendingId !== null}
                            aria-label={t("outreachCopyRemove").replace("{email}", email)}
                            title={t("outreachCopyRemove").replace("{email}", email)}
                            className="rounded p-0.5 hover:bg-background/60 disabled:opacity-50"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  )}

                  {copyRecipientCount > 0 && copyStatus === "idle" && (
                    <p className="flex items-start gap-1.5 text-xs leading-4 text-muted-foreground">
                      <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {t("outreachCopyWaiting")}
                    </p>
                  )}
                  {copyStatus === "sending" && (
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground" data-testid="status-outreach-copy-sending">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t("outreachCopySending")}
                    </p>
                  )}
                  {copyStatus === "sent" && (
                    <p className="flex items-center gap-1.5 text-xs text-emerald-600" data-testid="status-outreach-copy-sent">
                      <CircleCheck className="h-3.5 w-3.5" /> {t("outreachCopySent")}
                    </p>
                  )}
                  {copyStatus === "failed" && (
                    <div className="flex flex-wrap items-center justify-between gap-2" data-testid="status-outreach-copy-failed">
                      <p className="flex items-center gap-1.5 text-xs text-rose-600"><CircleAlert className="h-3.5 w-3.5" /> {t("outreachCopyFailed")}</p>
                      <Button type="button" size="sm" variant="outline" className="h-7" onClick={retryCampaignCopy}>
                        {t("outreachCopyRetry")}
                      </Button>
                    </div>
                  )}
                </div>
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
                    {mailEnabled ? t("outreachSendAll") : `${t("outreachSendAll")} · ${t("comingSoon")}`}
                  </Button>
                </div>
                <div className="divide-y divide-border rounded-lg border border-border">
                  {chosen.map((r) => (
                    <div key={r.advisorId} className="flex min-w-0 flex-wrap items-center gap-2 px-3 py-2 text-sm" data-testid={`row-outreach-send-${r.advisorId}`}>
                      <span className="font-medium">{r.name}</span>
                      <span className="truncate text-xs text-muted-foreground">{r.to.join(", ")}</span>
                      <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
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
                          {sendingId === r.advisorId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : mailEnabled ? t("outreachSendServer") : `${t("outreachSendServer")} · ${t("comingSoon")}`}
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
                <Button type="button" variant="outline" disabled={campaignLocked || sendingId !== null} onClick={() => setStep((s) => (s - 1) as Step)} data-testid="button-outreach-prev">
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
