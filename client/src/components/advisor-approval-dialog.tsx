// v6.11 — Unified advisor approval email.
//
// Replaces the old pair of buttons ("Request approval" opened a mailto draft,
// "Send approval email" opened a separate server-send composer). One dialog now
// covers the whole path: an AI-drafted relevance paragraph, editable recipients
// and subject, a live preview of the exact message that will go out, and a
// choice of copying the formatted email or sending it straight from the portal.
//
// The preview and the sent message are rendered by the same shared template
// (shared/approval-email.ts), so they cannot drift apart.
import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useLang } from "@/lib/i18n";
import { copyRichText } from "@/lib/download";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import type { AdvisorWithRoles } from "@shared/schema";
import { buildApprovalEmail, type ApprovalEmailData } from "@shared/approval-email";
import { coiAttestationText, type CoiStatus } from "@shared/coi";
import { Mail, Send, Loader2, CheckCircle2, Copy, Sparkles, ShieldAlert, ShieldCheck } from "lucide-react";

type ApprovalBase = Omit<ApprovalEmailData, "intro" | "approvalLink">;

interface ComposeResponse {
  base: ApprovalBase;
  to: string;
  cc: string[];
  subject: string;
  fallbackIntro: string;
  expiryDays: number;
  mailEnabled: boolean;
  cooEmailConfigured: boolean;
  aiEnabled: boolean;
  coi: CoiState;
}

// v7.14 — the conflict-of-interest slice the server reports back for this advisor.
interface CoiState {
  status: CoiStatus;
  blocked: boolean;
  declaredBy: string | null;
  declaredAt: string | null;
  details: string | null;
}

/** Split a comma / semicolon / whitespace separated recipient list. */
function parseList(value: string): string[] {
  return value
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function ApprovalSendDialog({
  open, onOpenChange, advisor,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  advisor: AdvisorWithRoles;
}) {
  const { t, lang } = useLang();
  const { toast } = useToast();
  const [base, setBase] = useState<ApprovalBase | null>(null);
  const [subject, setSubject] = useState("");
  const [to, setTo] = useState("");
  const [ccText, setCcText] = useState("");
  const [intro, setIntro] = useState("");
  const [mailEnabled, setMailEnabled] = useState(true);
  const [cooEmailConfigured, setCooEmailConfigured] = useState(true);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [sent, setSent] = useState(false);
  const [loadedFor, setLoadedFor] = useState<number | null>(null);
  // v7.14 — conflict-of-interest gate. `null` means unanswered, which is the
  // state the dialog always opens in: the declaration is never pre-filled, so
  // the sender has to make the statement deliberately every time.
  const [coiConflict, setCoiConflict] = useState<boolean | null>(null);
  const [coiDetails, setCoiDetails] = useState("");
  const [coiState, setCoiState] = useState<CoiState | null>(null);
  const [coiJustRecorded, setCoiJustRecorded] = useState(false);

  const emailLang = lang === "cn" ? "cn" : "en";

  const draftIntro = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/advisors/${advisor.id}/approval/intro`, { lang: emailLang });
      return res.json() as Promise<{ intro: string; ai: boolean }>;
    },
    onSuccess: (d) => setIntro(d.intro),
    onError: () => {
      // The compose fallback is already in the field; surface nothing noisy.
    },
  });

  const compose = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/advisors/${advisor.id}/approval/compose`, { lang: emailLang });
      return res.json() as Promise<ComposeResponse>;
    },
    onSuccess: (data) => {
      setBase(data.base);
      setSubject(data.subject);
      setTo(data.to);
      setCcText(data.cc.join(", "));
      setIntro(data.fallbackIntro);
      setMailEnabled(data.mailEnabled);
      setCooEmailConfigured(data.cooEmailConfigured);
      setAiEnabled(data.aiEnabled);
      setCoiState(data.coi ?? null);
      if (data.aiEnabled) draftIntro.mutate();
    },
    onError: (e: any) => toast({ description: String(e?.message ?? e), variant: "destructive" }),
  });

  // Load once per advisor each time the dialog is opened.
  useEffect(() => {
    if (open && loadedFor !== advisor.id) {
      setLoadedFor(advisor.id);
      setSent(false);
      setBase(null);
      // Reset the declaration on every open — an attestation from a previous
      // session must never be carried silently into a new send.
      setCoiConflict(null);
      setCoiDetails("");
      setCoiState(null);
      setCoiJustRecorded(false);
      compose.mutate();
    }
    if (!open && loadedFor !== null) setLoadedFor(null);
  }, [open, advisor.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const cc = useMemo(() => parseList(ccText), [ccText]);
  const toValid = EMAIL_RE.test(to.trim());
  const ccValid = cc.every((e) => EMAIL_RE.test(e));

  const coiBlocked = Boolean(coiState?.blocked);

  // Live preview — identical to what the server renders, apart from the link,
  // which only exists once a one-time token is minted at send time.
  // v7.14 — the attestation row appears in the preview as soon as "no conflict"
  // is selected, using a provisional timestamp; the server stamps the real one.
  const rendered = useMemo(() => {
    if (!base) return null;
    return buildApprovalEmail({
      ...base,
      intro,
      approvalLink: "https://gba-partnership-portal.vercel.app/#/advisor-approval?token=…",
      coiAttestation:
        coiConflict === false
          ? coiAttestationText(base.lang, base.requesterName, new Date().toISOString())
          : null,
    });
  }, [base, intro, coiConflict]);

  const send = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/advisors/${advisor.id}/approval/send`, {
        lang: emailLang, to: to.trim(), cc, subject, intro,
        // v7.14 — the gate is enforced server-side; this is the declaration the
        // server evaluates, records and stamps into the email.
        coi: { conflict: coiConflict === true, details: coiConflict ? coiDetails.trim() : undefined },
      });
      return res.json();
    },
    onSuccess: () => {
      setSent(true);
      queryClient.invalidateQueries({ queryKey: ["/api/advisors"] });
      queryClient.invalidateQueries({ queryKey: ["/api/advisors", advisor.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/advisors", advisor.id, "activities"] });
      toast({ description: t("approvalSent") });
    },
    onError: (e: any) => toast({ description: String(e?.message ?? e), variant: "destructive" }),
  });

  // v7.14 — recording a declared conflict travels the same endpoint as a send,
  // because the server is the thing that decides. A conflict comes back as a 409
  // with the updated flag, and nothing was emailed.
  const declareConflict = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/advisors/${advisor.id}/approval/send`, {
        lang: emailLang, to: to.trim(), cc, subject, intro,
        coi: { conflict: true, details: coiDetails.trim() || undefined },
      });
      return res.json();
    },
    // A 409 is the expected outcome here, so both paths land on the same state.
    onSettled: () => {
      setCoiJustRecorded(true);
      setCoiState((prev) => ({
        status: "blocked",
        blocked: true,
        declaredBy: prev?.declaredBy ?? null,
        declaredAt: prev?.declaredAt ?? new Date().toISOString(),
        details: coiDetails.trim() || null,
      }));
      queryClient.invalidateQueries({ queryKey: ["/api/advisors"] });
      queryClient.invalidateQueries({ queryKey: ["/api/advisors", advisor.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/advisors", advisor.id, "activities"] });
      queryClient.invalidateQueries({ queryKey: ["/api/advisors/coi/blocked"] });
      toast({ description: t("coiRecorded") });
    },
  });

  const copy = async () => {
    if (!rendered) return;
    const header = `To: ${to}\nCc: ${cc.join(", ")}\nSubject: ${subject}\n\n`;
    const ok = await copyRichText(rendered.html, header + rendered.plain);
    toast(ok ? { description: t("copiedToClipboard") } : { description: t("copyFailed"), variant: "destructive" });
  };

  const canSend = Boolean(
    mailEnabled && toValid && ccValid && subject.trim() && intro.trim() && !send.isPending &&
    // v7.14 — an unanswered or conflicted declaration, or a pre-existing block,
    // all keep the send button off. The server re-checks every one of these.
    coiConflict === false && !coiBlocked,
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto" data-testid="dialog-approval-send">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-[hsl(var(--gold))]" /> {t("approvalDialogTitle")}
          </DialogTitle>
          <DialogDescription>{t("approvalDialogHint")}</DialogDescription>
        </DialogHeader>

        {compose.isPending || !base ? (
          <div className="space-y-2 py-4">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-9 w-full rounded-md" />)}
          </div>
        ) : sent ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center" data-testid="text-approval-sent-confirmation">
            <CheckCircle2 className="h-8 w-8 text-emerald-600" />
            <p className="text-sm font-medium">{t("approvalSent")}</p>
            <p className="text-xs text-muted-foreground">{to}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {!cooEmailConfigured && (
              <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400" data-testid="text-approval-no-coo-email">
                {t("approvalNoCooEmail")}
              </p>
            )}
            {!mailEnabled && (
              <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400" data-testid="text-approval-mail-disabled">
                {t("approvalMailDisabled")}
              </p>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="approval-to">{t("approvalTo")}</Label>
                <Input
                  id="approval-to"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  aria-invalid={!toValid}
                  className={!toValid && to.trim() ? "border-destructive" : undefined}
                  data-testid="input-approval-to"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="approval-cc">{t("approvalCc")}</Label>
                <Input
                  id="approval-cc"
                  value={ccText}
                  onChange={(e) => setCcText(e.target.value)}
                  placeholder={t("approvalCcPlaceholder")}
                  aria-invalid={!ccValid}
                  className={!ccValid ? "border-destructive" : undefined}
                  data-testid="input-approval-cc"
                />
              </div>
            </div>
            {(!toValid && to.trim()) || !ccValid ? (
              <p className="text-[11px] text-destructive" data-testid="text-approval-email-invalid">{t("approvalInvalidEmail")}</p>
            ) : null}

            <div className="space-y-1">
              <Label htmlFor="approval-subject">{t("approvalSubject")}</Label>
              <Input id="approval-subject" value={subject} onChange={(e) => setSubject(e.target.value)} data-testid="input-approval-subject" />
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="approval-intro">{t("approvalRelevance")}</Label>
                {aiEnabled && (
                  <Button
                    type="button" size="sm" variant="outline" className="h-7"
                    disabled={draftIntro.isPending}
                    onClick={() => draftIntro.mutate()}
                    data-testid="button-approval-redraft"
                  >
                    {draftIntro.isPending
                      ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      : <Sparkles className="mr-1.5 h-3.5 w-3.5" />}
                    {t("approvalRedraft")}
                  </Button>
                )}
              </div>
              {draftIntro.isPending ? (
                <Skeleton className="h-[92px] w-full rounded-md" data-testid="skeleton-approval-intro" />
              ) : (
                <Textarea
                  id="approval-intro" rows={4} value={intro}
                  onChange={(e) => setIntro(e.target.value)}
                  data-testid="textarea-approval-intro"
                />
              )}
              <p className="text-[11px] text-muted-foreground">{t("approvalRelevanceHint")}</p>
            </div>

            {/* v7.14 — conflict-of-interest gate. Sits directly above the preview
                so the sender reads the declaration before the send button. */}
            <div className="space-y-2 rounded-md border border-border bg-muted/30 p-3" data-testid="section-approval-coi">
              <div className="flex items-center gap-2">
                {coiBlocked
                  ? <ShieldAlert className="h-4 w-4 text-destructive" />
                  : <ShieldCheck className="h-4 w-4 text-[hsl(var(--gold))]" />}
                <Label className="text-sm font-semibold">{t("coiSectionTitle")}</Label>
              </div>

              {coiBlocked ? (
                <div className="space-y-1 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2" data-testid="text-approval-coi-blocked">
                  <p className="text-xs font-medium text-destructive">{t("coiBlockedBanner")}</p>
                  {coiState?.declaredBy || coiState?.declaredAt ? (
                    <p className="text-[11px] text-muted-foreground">
                      {t("coiDeclaredByAt")}: {coiState?.declaredBy ?? "—"}
                      {coiState?.declaredAt ? ` · ${coiState.declaredAt.slice(0, 10)}` : ""}
                    </p>
                  ) : null}
                  {coiState?.details ? (
                    <p className="whitespace-pre-wrap text-[11px] text-muted-foreground">{coiState.details}</p>
                  ) : null}
                </div>
              ) : (
                <>
                  <p className="text-[11px] leading-relaxed text-muted-foreground">{t("coiScope")}</p>
                  <div className="space-y-1.5">
                    <label className="flex cursor-pointer items-start gap-2 text-xs" data-testid="radio-approval-coi-none">
                      <input
                        type="radio"
                        name="approval-coi"
                        className="mt-0.5"
                        checked={coiConflict === false}
                        onChange={() => { setCoiConflict(false); setCoiDetails(""); }}
                      />
                      <span>{t("coiNone")}</span>
                    </label>
                    <label className="flex cursor-pointer items-start gap-2 text-xs" data-testid="radio-approval-coi-yes">
                      <input
                        type="radio"
                        name="approval-coi"
                        className="mt-0.5"
                        checked={coiConflict === true}
                        onChange={() => setCoiConflict(true)}
                      />
                      <span>{t("coiYes")}</span>
                    </label>
                  </div>

                  {coiConflict === true && (
                    <div className="space-y-1 pt-1">
                      <Label htmlFor="approval-coi-details" className="text-xs">{t("coiDetailsLabel")}</Label>
                      <Textarea
                        id="approval-coi-details"
                        rows={3}
                        value={coiDetails}
                        placeholder={t("coiDetailsPlaceholder")}
                        onChange={(e) => setCoiDetails(e.target.value)}
                        data-testid="textarea-approval-coi-details"
                      />
                      <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-700 dark:text-amber-400" data-testid="text-approval-coi-will-block">
                        {t("coiWillBlock")}
                      </p>
                    </div>
                  )}

                  {coiConflict === null && (
                    <p className="text-[11px] text-muted-foreground" data-testid="text-approval-coi-required">{t("coiRequired")}</p>
                  )}
                  <p className="text-[11px] leading-relaxed text-muted-foreground">{t("coiScopeNote")}</p>
                </>
              )}
            </div>

            <div className="space-y-1">
              <Label>{t("approvalPreview")}</Label>
              <iframe
                title="approval-email-preview"
                srcDoc={rendered?.html ?? ""}
                className="h-80 w-full rounded-md border border-border bg-white"
                sandbox=""
                data-testid="iframe-approval-preview"
              />
              <p className="text-[11px] text-muted-foreground">{t("approvalLinkNote")}</p>
            </div>
          </div>
        )}

        {!compose.isPending && base && !sent && (
          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="outline" onClick={copy} data-testid="button-approval-copy">
              <Copy className="mr-1.5 h-3.5 w-3.5" /> {t("copyEmail")}
            </Button>
            {/* v7.14 — a declared conflict swaps the send action for a record-only
                action. There is no path from this dialog that both declares a
                conflict and sends the email. */}
            {coiConflict === true && !coiBlocked ? (
              <Button
                type="button"
                variant="destructive"
                disabled={declareConflict.isPending || coiJustRecorded}
                onClick={() => declareConflict.mutate()}
                data-testid="button-approval-coi-declare"
              >
                {declareConflict.isPending
                  ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  : <ShieldAlert className="mr-1.5 h-3.5 w-3.5" />}
                {t("coiRecordButton")}
              </Button>
            ) : (
              <Button
                type="button"
                disabled={!canSend}
                onClick={() => send.mutate()}
                className="bg-[hsl(193,52%,38%)] text-white hover:bg-[hsl(193,52%,30%)]"
                data-testid="button-approval-send"
              >
                {send.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1.5 h-3.5 w-3.5" />}
                {t("approvalSend")}
              </Button>
            )}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
