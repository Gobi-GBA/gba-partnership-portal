import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useLang } from "@/lib/i18n";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import type { AdvisorWithRoles } from "@shared/schema";
import { Mail, Send, Loader2, ChevronLeft, Users } from "lucide-react";

type OutreachTemplate = "onboarding_invite" | "general_update";

interface Draft {
  advisorId: number;
  name: string;
  to: string[];
  subject: string;
  body: string;
}

interface ComposeResponse {
  drafts: Draft[];
  mailEnabled: boolean;
}

export function OutreachDialog({
  open, onOpenChange, advisors,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Candidate advisors — normally the currently filtered list. */
  advisors: AdvisorWithRoles[];
}) {
  const { t, lang } = useLang();
  const { toast } = useToast();
  const [template, setTemplate] = useState<OutreachTemplate>("onboarding_invite");
  const [selected, setSelected] = useState<number[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [mailEnabled, setMailEnabled] = useState(true);
  const [sent, setSent] = useState<number[]>([]);
  const [loadedFor, setLoadedFor] = useState(false);

  // Seed the selection with the advisors handed in when the dialog opens.
  if (open && !loadedFor) {
    setLoadedFor(true);
    setSelected(advisors.map((a) => a.id));
    setDrafts([]);
    setSent([]);
  }
  if (!open && loadedFor) setLoadedFor(false);

  const displayName = (a: AdvisorWithRoles) => (lang === "cn" && a.nameCn ? a.nameCn : a.name);
  const toggle = (id: number) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const compose = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/advisors/outreach/compose", {
        advisorIds: selected,
        template,
      });
      return (await res.json()) as ComposeResponse;
    },
    onSuccess: (data) => {
      setDrafts(data.drafts);
      setMailEnabled(data.mailEnabled);
      setSent([]);
    },
    onError: (e: any) => toast({ description: String(e?.message ?? e), variant: "destructive" }),
  });

  const send = useMutation({
    mutationFn: async (d: Draft) => {
      const res = await apiRequest("POST", "/api/advisors/outreach/send", {
        advisorId: d.advisorId,
        to: d.to[0],
        subject: d.subject,
        body: d.body,
      });
      return res.json();
    },
    onSuccess: (_data, d) => {
      setSent((s) => (s.includes(d.advisorId) ? s : [...s, d.advisorId]));
      queryClient.invalidateQueries({ queryKey: ["/api/advisors"] });
      queryClient.invalidateQueries({ queryKey: ["/api/advisors", d.advisorId, "activities"] });
      toast({ description: `${t("outreachSent")} — ${d.to[0]}` });
    },
    onError: (e: any) => {
      const msg = String(e?.message ?? e);
      toast({
        description: msg.includes("503") ? t("outreachMailDisabled") : msg,
        variant: "destructive",
      });
      if (msg.includes("503")) setMailEnabled(false);
    },
  });

  const confirmFor = (d: Draft) => window.confirm(t("outreachConfirm").replace("{n}", d.to[0] ?? ""));

  const updateDraft = (advisorId: number, patch: Partial<Draft>) =>
    setDrafts((ds) => ds.map((d) => (d.advisorId === advisorId ? { ...d, ...patch } : d)));

  const openInMailClient = (d: Draft) => {
    if (!confirmFor(d)) return;
    const href = `mailto:${encodeURIComponent(d.to.join(","))}?subject=${encodeURIComponent(d.subject)}&body=${encodeURIComponent(d.body)}`;
    window.location.href = href;
  };

  const sendViaServer = (d: Draft) => {
    if (!confirmFor(d)) return;
    send.mutate(d);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto" data-testid="dialog-outreach">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-[hsl(var(--gold))]" /> {t("outreachTitle")}
          </DialogTitle>
          <DialogDescription>{t("outreachHint")}</DialogDescription>
        </DialogHeader>

        {drafts.length === 0 ? (
          <div className="space-y-4 pt-1">
            <div className="space-y-1">
              <Label>{t("outreachTemplate")}</Label>
              <Select value={template} onValueChange={(v) => setTemplate(v as OutreachTemplate)}>
                <SelectTrigger data-testid="select-outreach-template"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="onboarding_invite">{t("outreachTplOnboarding")}</SelectItem>
                  <SelectItem value="general_update">{t("outreachTplUpdate")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 rounded-lg border border-border p-3">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-1.5 font-semibold">
                  <Users className="h-3.5 w-3.5" /> {t("outreachRecipients")}
                  <span className="text-xs font-normal text-muted-foreground" data-testid="text-outreach-selected-count">
                    ({selected.length}/{advisors.length})
                  </span>
                </Label>
                <div className="flex gap-1.5">
                  <Button type="button" size="sm" variant="outline"
                    onClick={() => setSelected(advisors.map((a) => a.id))} data-testid="button-outreach-select-all">
                    {t("outreachSelectAll")}
                  </Button>
                  <Button type="button" size="sm" variant="ghost"
                    onClick={() => setSelected([])} data-testid="button-outreach-clear">
                    {t("outreachClear")}
                  </Button>
                </div>
              </div>
              <div className="max-h-64 space-y-1 overflow-y-auto">
                {advisors.map((a) => {
                  const hasEmail = (a.emails ?? []).length > 0;
                  return (
                    <label
                      key={a.id}
                      className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-secondary/50"
                      data-testid={`row-outreach-candidate-${a.id}`}
                    >
                      <Checkbox
                        checked={selected.includes(a.id)}
                        onCheckedChange={() => toggle(a.id)}
                        data-testid={`checkbox-outreach-${a.id}`}
                      />
                      <span className="min-w-0 flex-1 truncate">{displayName(a)}</span>
                      {hasEmail ? (
                        <span className="truncate text-xs text-muted-foreground">{(a.emails ?? [])[0]}</span>
                      ) : (
                        <span className="text-xs italic text-muted-foreground" data-testid={`text-outreach-no-email-${a.id}`}>
                          {t("outreachNoEmail")}
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-outreach-cancel">
                {t("cancel")}
              </Button>
              <Button
                onClick={() => {
                  if (selected.length === 0) {
                    toast({ description: t("outreachNoneSelected"), variant: "destructive" });
                    return;
                  }
                  compose.mutate();
                }}
                disabled={compose.isPending}
                className="bg-[hsl(193,52%,38%)] text-white hover:bg-[hsl(193,52%,30%)]"
                data-testid="button-outreach-compose"
              >
                {compose.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1.5 h-3.5 w-3.5" />}
                {t("outreachCompose")}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 pt-1">
            <div className="flex items-center justify-between">
              <Button size="sm" variant="ghost" onClick={() => setDrafts([])} data-testid="button-outreach-back">
                <ChevronLeft className="mr-1 h-3.5 w-3.5" /> {t("outreachBack")}
              </Button>
              {!mailEnabled && (
                <span className="text-xs text-amber-600 dark:text-amber-400" data-testid="text-outreach-mail-disabled">
                  {t("outreachMailDisabled")}
                </span>
              )}
            </div>

            {drafts.map((d) => {
              const hasEmail = d.to.length > 0 && Boolean(d.to[0]);
              const isSent = sent.includes(d.advisorId);
              return (
                <div key={d.advisorId} className="space-y-2 rounded-lg border border-border p-3" data-testid={`card-draft-${d.advisorId}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-sm" data-testid={`text-draft-name-${d.advisorId}`}>{d.name}</span>
                    {hasEmail ? (
                      <span className="text-xs text-muted-foreground" data-testid={`text-draft-to-${d.advisorId}`}>{d.to.join(", ")}</span>
                    ) : (
                      <span className="text-xs italic text-muted-foreground" data-testid={`text-draft-no-email-${d.advisorId}`}>
                        {t("outreachNoEmail")}
                      </span>
                    )}
                    {isSent && (
                      <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-600 text-[11px]" data-testid={`badge-draft-sent-${d.advisorId}`}>
                        {t("outreachSent")}
                      </Badge>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{t("outreachSubject")}</Label>
                    <Input
                      value={d.subject}
                      onChange={(e) => updateDraft(d.advisorId, { subject: e.target.value })}
                      data-testid={`input-draft-subject-${d.advisorId}`}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{t("outreachBody")}</Label>
                    <Textarea
                      rows={8}
                      value={d.body}
                      onChange={(e) => updateDraft(d.advisorId, { body: e.target.value })}
                      data-testid={`input-draft-body-${d.advisorId}`}
                    />
                  </div>
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!hasEmail}
                      onClick={() => openInMailClient(d)}
                      data-testid={`button-draft-mailto-${d.advisorId}`}
                    >
                      <Mail className="mr-1.5 h-3.5 w-3.5" /> {t("outreachOpenMail")}
                    </Button>
                    <Button
                      size="sm"
                      className="bg-[hsl(193,52%,38%)] text-white hover:bg-[hsl(193,52%,30%)]"
                      disabled={!hasEmail || !mailEnabled || send.isPending || isSent}
                      onClick={() => sendViaServer(d)}
                      data-testid={`button-draft-send-${d.advisorId}`}
                    >
                      {send.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1.5 h-3.5 w-3.5" />}
                      {t("outreachSendServer")}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
