import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Layout } from "@/components/shared";
import { useLang } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PartnerLogo, StageBadge, CategoryBadge } from "@/components/shared";
import { VERSIONS, CURRENT_VERSION } from "@/lib/versions";
import type { Feedback, FeedbackStatus, Partnership, Stage, Category } from "@shared/schema";
import { FEEDBACK_STATUSES } from "@shared/schema";
import { History, MessageSquarePlus, Send, Handshake } from "lucide-react";
import { cn } from "@/lib/utils";
import { thankYou } from "@/components/thank-you";

// The partnerships API enriches each row with the submitter's display name.
type PartnershipWithAuthor = Partnership & { submittedByName?: string | null };

export const STATUS_STYLES: Record<FeedbackStatus, string> = {
  open: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
  in_progress: "bg-[hsl(193,52%,38%)]/15 text-[hsl(193,52%,30%)] dark:text-[hsl(193,60%,60%)] border-[hsl(193,52%,38%)]/30",
  solved: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  declined: "bg-muted text-muted-foreground border-border",
};

export function FeedbackStatusBadge({ status }: { status: FeedbackStatus }) {
  const { t } = useLang();
  return (
    <Badge variant="outline" className={cn("text-[11px] font-semibold", STATUS_STYLES[status])} data-testid={`badge-status-${status}`}>
      {t(`fbStatus_${status}` as any)}
    </Badge>
  );
}

export default function Updates() {
  const { t, lang } = useLang();
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [message, setMessage] = useState("");
  // v6.01 — personal response tracker
  const [statusFilter, setStatusFilter] = useState<FeedbackStatus | null>(null);
  const [scope, setScope] = useState<"mine" | "all">("all");

  // v6.05 — visiting this page acknowledges the current version and any
  // answered requests, clearing the gold nav badge.
  useEffect(() => {
    if (!user) return;
    apiRequest("POST", "/api/me/seen-version", { version: CURRENT_VERSION })
      .then(() => queryClient.invalidateQueries({ queryKey: ["/api/me/notifications"] }))
      .catch(() => {});
  }, [user]);

  const { data: requests, isLoading } = useQuery<Feedback[]>({
    queryKey: ["/api/feedback"],
    enabled: !!user,
  });

  const { data: partnerships, isLoading: loadingPartners } = useQuery<PartnershipWithAuthor[]>({
    queryKey: ["/api/partnerships"],
    enabled: !!user,
  });

  // Partnership records log: newest first, keyed on start date (fallback to created date)
  const logDate = (p: Partnership) => p.startDate || p.createdAt;
  const partnerLog = (partnerships ?? [])
    .slice()
    .sort((a, b) => (logDate(a) < logDate(b) ? 1 : logDate(a) > logDate(b) ? -1 : b.id - a.id));
  const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString(lang === "cn" ? "zh-CN" : "en-GB", { year: "numeric", month: "short", day: "numeric" });

  const isTeam = user?.role === "admin" || user?.isDev === 1;
  const mine = (requests ?? []).filter((r) => r.userId === user?.id);
  const scoped = isTeam && scope === "all" ? (requests ?? []) : mine;
  const visible = statusFilter ? scoped.filter((r) => r.status === statusFilter) : scoped;
  const countOf = (s: FeedbackStatus) => mine.filter((r) => r.status === s).length;

  const submit = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/feedback", { message: message.trim() });
      return res.json();
    },
    onSuccess: () => {
      setMessage("");
      queryClient.invalidateQueries({ queryKey: ["/api/feedback"] });
      toast({ title: t("requestSubmitted") });
      thankYou();
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  return (
    <Layout>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 space-y-12">
        {/* ---- Logs: system requests + system updates + partnership records (tabbed) ---- */}
        <section>
          <Tabs defaultValue="system" className="w-full">
            <TabsList className="mb-6">
              <TabsTrigger value="requests" data-testid="tab-system-requests">
                <MessageSquarePlus className="h-4 w-4 mr-2" />
                {t("tabSystemRequests")}
              </TabsTrigger>
              <TabsTrigger value="system" data-testid="tab-system-log">
                <History className="h-4 w-4 mr-2" />
                {t("tabSystemLog")}
              </TabsTrigger>
              <TabsTrigger value="partnerships" data-testid="tab-partnership-log">
                <Handshake className="h-4 w-4 mr-2" />
                {t("tabPartnershipLog")}
              </TabsTrigger>
            </TabsList>

            {/* Tab 1: system requests */}
            <TabsContent value="requests" data-testid="panel-system-requests">
              <div className="flex items-center gap-2 mb-1">
                <MessageSquarePlus className="h-5 w-5 text-[hsl(193,52%,38%)]" />
                <h2 className="font-display text-xl font-bold" data-testid="text-requests-title">{t("requestsTitle")}</h2>
              </div>
              <p className="text-sm text-muted-foreground mb-6">{t("requestsSub")}</p>

              <div className="rounded-lg border border-border bg-card p-4 space-y-3">
                <Textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={t("requestPlaceholder")}
                  rows={3}
                  maxLength={2000}
                  data-testid="input-feedback"
                />
                <div className="flex justify-end">
                  <Button
                    onClick={() => submit.mutate()}
                    disabled={message.trim().length < 3 || submit.isPending}
                    className="bg-[hsl(193,52%,38%)] hover:bg-[hsl(193,52%,30%)] text-white"
                    data-testid="button-submit-feedback"
                  >
                    <Send className="h-4 w-4 mr-2" />
                    {t("newRequest")}
                  </Button>
                </div>
              </div>

              <div className="mt-8 mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  {isTeam && scope === "all" ? t("adminFeedback") : t("myRequests")}
                </h3>
                {isTeam && (
                  <div className="flex rounded-md border border-border overflow-hidden text-xs">
                    <button
                      type="button"
                      onClick={() => setScope("mine")}
                      className={cn("px-2.5 py-1 font-semibold transition-colors", scope === "mine" ? "bg-[hsl(193,52%,38%)] text-white" : "bg-card text-muted-foreground hover:text-foreground")}
                      data-testid="toggle-feedback-mine"
                    >
                      {t("myRequests")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setScope("all")}
                      className={cn("px-2.5 py-1 font-semibold transition-colors", scope === "all" ? "bg-[hsl(193,52%,38%)] text-white" : "bg-card text-muted-foreground hover:text-foreground")}
                      data-testid="toggle-feedback-all"
                    >
                      {t("allRequests")}
                    </button>
                  </div>
                )}
              </div>
              {mine.length > 0 && (
                <div className="mb-4 flex flex-wrap gap-2" data-testid="tracker-feedback">
                  {FEEDBACK_STATUSES.map((s) =>
                    countOf(s) > 0 ? (
                      <button
                        key={s}
                        type="button"
                        onClick={() => {
                          setStatusFilter((f) => (f === s ? null : s));
                          if (isTeam) setScope("mine");
                        }}
                        className={cn(
                          "rounded-full border px-3 py-1 text-[11px] font-semibold transition-all",
                          STATUS_STYLES[s],
                          statusFilter === s ? "ring-2 ring-[hsl(43,55%,55%)] ring-offset-1 ring-offset-background" : "opacity-80 hover:opacity-100",
                        )}
                        data-testid={`chip-status-${s}`}
                      >
                        {t(`fbStatus_${s}` as any)} · {countOf(s)}
                      </button>
                    ) : null,
                  )}
                </div>
              )}
              {isLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                </div>
              ) : visible.length === 0 ? (
                <p className="text-sm text-muted-foreground" data-testid="text-no-requests">{t("noRequests")}</p>
              ) : (
                <div className="space-y-3">
                  {visible.map((r) => (
                    <div key={r.id} className="rounded-lg border border-border bg-card p-4" data-testid={`card-feedback-${r.id}`}>
                      <div className="flex items-start justify-between gap-3 mb-1.5">
                        <div className="text-xs text-muted-foreground">
                          {isTeam && scope === "all" && <span className="font-semibold text-foreground">{r.userName} · </span>}
                          {isTeam && r.userId === user?.id && (
                            <Badge variant="outline" className="mr-1.5 border-[hsl(43,55%,55%)]/40 bg-[hsl(43,55%,55%)]/10 px-1.5 py-0 text-[10px] font-bold text-[hsl(43,55%,35%)] dark:text-[hsl(43,55%,65%)]" data-testid="tag-feedback-you">
                              {t("youTag")}
                            </Badge>
                          )}
                          {fmtDate(r.createdAt)}
                          {r.updatedAt && (r.status !== "open" || r.adminNote) && (
                            <span className="ml-1.5 text-[hsl(193,52%,38%)]">· {t("fbUpdated")} {fmtDate(r.updatedAt)}</span>
                          )}
                        </div>
                        <FeedbackStatusBadge status={r.status as FeedbackStatus} />
                      </div>
                      <p className="text-sm whitespace-pre-wrap" data-testid={`text-feedback-message-${r.id}`}>{r.message}</p>
                      {r.adminNote && (
                        <div className="mt-2 rounded-md bg-muted px-3 py-2 text-sm">
                          <span className="text-xs font-semibold text-muted-foreground block mb-0.5">{t("adminResponse")}</span>
                          <span className="whitespace-pre-wrap">{r.adminNote}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* Tab 2: system update log */}
            <TabsContent value="system" data-testid="panel-system-log">
              <div className="flex items-center gap-2 mb-1">
                <History className="h-5 w-5 text-[hsl(193,52%,38%)]" />
                <h2 className="font-display text-xl font-bold" data-testid="text-updates-title">{t("updatesTitle")}</h2>
              </div>
              <p className="text-sm text-muted-foreground mb-6">{t("updatesSub")}</p>

              <div className="relative border-l-2 border-border ml-2 space-y-8">
                {VERSIONS.map((v) => (
                  <div key={v.version} className="relative pl-6" data-testid={`version-entry-${v.version}`}>
                    <span
                      className={cn(
                        "absolute -left-[7px] top-1.5 h-3 w-3 rounded-full border-2 border-background",
                        v.version === CURRENT_VERSION ? "bg-[hsl(43,55%,55%)]" : "bg-[hsl(193,52%,38%)]",
                      )}
                    />
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="font-display font-bold">v{v.version}</span>
                      {v.version === CURRENT_VERSION && (
                        <Badge className="bg-[hsl(43,55%,55%)]/15 text-[hsl(43,55%,35%)] dark:text-[hsl(43,55%,65%)] border-[hsl(43,55%,55%)]/30" variant="outline">
                          {t("currentVersion")}
                        </Badge>
                      )}
                      <span className="text-xs text-muted-foreground tabular-nums">{v.date}</span>
                      <span className="text-xs text-muted-foreground" data-testid={`version-author-${v.version}`}>{t("versionBy")} {v.by}</span>
                    </div>
                    <div className="font-semibold text-sm mb-1.5">{lang === "cn" ? v.titleCn : v.titleEn}</div>
                    <ul className="space-y-1 text-sm text-muted-foreground list-disc pl-4">
                      {(lang === "cn" ? v.itemsCn : v.itemsEn).map((item, i) => (
                        <li key={i}>{item}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </TabsContent>

            {/* Tab 3: partnership records log */}
            <TabsContent value="partnerships" data-testid="panel-partnership-log">
              <div className="flex items-center gap-2 mb-1">
                <Handshake className="h-5 w-5 text-[hsl(193,52%,38%)]" />
                <h2 className="font-display text-xl font-bold" data-testid="text-partner-log-title">{t("partnerLogTitle")}</h2>
              </div>
              <p className="text-sm text-muted-foreground mb-6">{t("partnerLogSub")}</p>

              {loadingPartners ? (
                <div className="space-y-3">
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                </div>
              ) : partnerLog.length === 0 ? (
                <p className="text-sm text-muted-foreground" data-testid="text-partner-log-empty">{t("partnerLogEmpty")}</p>
              ) : (
                <div className="relative border-l-2 border-border ml-2 space-y-6">
                  {partnerLog.map((p) => (
                    <div key={p.id} className="relative pl-6" data-testid={`partner-log-entry-${p.id}`}>
                      <span className="absolute -left-[7px] top-1.5 h-3 w-3 rounded-full border-2 border-background bg-[hsl(193,52%,38%)]" />
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="text-xs text-muted-foreground tabular-nums" data-testid={`partner-log-date-${p.id}`}>{fmtDate(logDate(p))}</span>
                        <span className="text-[11px] text-muted-foreground/70">·</span>
                        <span className="text-[11px] text-muted-foreground/80">
                          {p.startDate ? t("partnerLogStarted") : t("partnerLogAdded")}
                        </span>
                        {p.submittedByName && (
                          <>
                            <span className="text-[11px] text-muted-foreground/70">·</span>
                            <span className="text-[11px] text-muted-foreground/80" data-testid={`partner-log-by-${p.id}`}>
                              {t("versionBy")} {p.submittedByName}
                            </span>
                          </>
                        )}
                        {p.status === "pending" && (
                          <Badge variant="outline" className="text-[10px] bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30">
                            {t("partnerLogPending")}
                          </Badge>
                        )}
                      </div>
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => navigate(`/partner/${p.id}`)}
                        onKeyDown={(e) => e.key === "Enter" && navigate(`/partner/${p.id}`)}
                        title={t("viewPartnerRecord")}
                        className="flex cursor-pointer items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5 transition-all hover:border-[hsl(var(--gold))]/50 hover:shadow-sm"
                        data-testid={`link-partner-log-${p.id}`}
                      >
                        <PartnerLogo p={p} size="sm" />
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-sm truncate" data-testid={`partner-log-name-${p.id}`}>
                            {lang === "cn" && p.nameCn ? p.nameCn : p.nameEn}
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5 mt-1">
                            <CategoryBadge category={p.category as Category} />
                            <StageBadge stage={p.stage as Stage} />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </section>
      </div>
    </Layout>
  );
}
