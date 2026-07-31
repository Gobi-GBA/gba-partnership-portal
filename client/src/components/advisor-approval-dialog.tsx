import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useLang } from "@/lib/i18n";
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
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { AdvisorWithRoles } from "@shared/schema";
import { Mail, Send, Loader2, Braces, CheckCircle2 } from "lucide-react";

const PLACEHOLDERS = ["{{name}}", "{{first_name}}", "{{organization}}", "{{approval_link}}"] as const;

interface ComposeResponse {
  template: { subject: string; body: string };
  preview: { subject: string; body: string };
  to: string;
  cc: string[];
  mailEnabled: boolean;
  cooEmailConfigured: boolean;
}

export function ApprovalSendDialog({
  open, onOpenChange, advisor,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  advisor: AdvisorWithRoles;
}) {
  const { t } = useLang();
  const { toast } = useToast();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [to, setTo] = useState("");
  const [cc, setCc] = useState<string[]>([]);
  const [mailEnabled, setMailEnabled] = useState(true);
  const [cooEmailConfigured, setCooEmailConfigured] = useState(true);
  const [sent, setSent] = useState(false);
  const [loadedFor, setLoadedFor] = useState<number | null>(null);

  const compose = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/advisors/${advisor.id}/approval/compose`, {});
      return res.json() as Promise<ComposeResponse>;
    },
    onSuccess: (data) => {
      setSubject(data.template.subject);
      setBody(data.template.body);
      setTo(data.to);
      setCc(data.cc);
      setMailEnabled(data.mailEnabled);
      setCooEmailConfigured(data.cooEmailConfigured);
    },
    onError: (e: any) => toast({ description: String(e?.message ?? e), variant: "destructive" }),
  });

  if (open && loadedFor !== advisor.id) {
    setLoadedFor(advisor.id);
    setSent(false);
    compose.mutate();
  }
  if (!open && loadedFor !== null) setLoadedFor(null);

  const send = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/advisors/${advisor.id}/approval/send`, { subject, body });
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

  const insertPlaceholder = (ph: string) => setBody((b) => (b ? `${b}${b.endsWith(" ") ? "" : " "}${ph}` : ph));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto" data-testid="dialog-approval-send">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-[hsl(var(--gold))]" /> {t("approvalDialogTitle")}
          </DialogTitle>
          <DialogDescription>{t("approvalDialogHint")}</DialogDescription>
        </DialogHeader>

        {compose.isPending ? (
          <div className="space-y-2 py-4">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-9 w-full rounded-md" />)}
          </div>
        ) : sent ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center" data-testid="text-approval-sent-confirmation">
            <CheckCircle2 className="h-8 w-8 text-emerald-600" />
            <p className="text-sm font-medium">{t("approvalSent")}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {!cooEmailConfigured && (
              <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400" data-testid="text-approval-no-coo-email">
                {t("approvalNoCooEmail")}
              </p>
            )}
            {cooEmailConfigured && !mailEnabled && (
              <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400" data-testid="text-approval-mail-disabled">
                {t("approvalMailDisabled")}
              </p>
            )}
            <div className="space-y-1">
              <Label>{t("approvalTo")}</Label>
              <Input value={to} disabled data-testid="input-approval-to" />
            </div>
            <div className="space-y-1">
              <Label>{t("approvalCc")}</Label>
              <Input value={cc.join(", ")} disabled data-testid="input-approval-cc" />
            </div>
            <div className="space-y-1">
              <Label>{t("approvalSubject")}</Label>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} data-testid="input-approval-subject" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label>{t("approvalBody")}</Label>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button type="button" size="sm" variant="outline" className="h-7" data-testid="button-approval-placeholder">
                      <Braces className="mr-1.5 h-3.5 w-3.5" /> {t("approvalInsertPlaceholder")}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {PLACEHOLDERS.map((ph) => (
                      <DropdownMenuItem key={ph} onClick={() => insertPlaceholder(ph)} data-testid={`item-approval-placeholder-${ph.replace(/[{}]/g, "")}`}>
                        {ph}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <Textarea rows={10} value={body} onChange={(e) => setBody(e.target.value)} data-testid="textarea-approval-body" />
              <p className="text-[11px] text-muted-foreground">{PLACEHOLDERS.join("  ")}</p>
              <p className="text-[11px] text-muted-foreground">{t("approvalLinkNote")}</p>
            </div>
          </div>
        )}

        {!compose.isPending && !sent && (
          <DialogFooter>
            <Button
              type="button"
              disabled={!mailEnabled || !cooEmailConfigured || !subject.trim() || !body.trim() || send.isPending}
              onClick={() => send.mutate()}
              className="bg-[hsl(193,52%,38%)] text-white hover:bg-[hsl(193,52%,30%)]"
              data-testid="button-approval-send"
            >
              {send.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1.5 h-3.5 w-3.5" />}
              {t("approvalSend")}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
