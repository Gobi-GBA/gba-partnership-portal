import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Layout } from "@/components/shared";
import { useLang } from "@/lib/i18n";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Check, X, ShieldCheck, AlertTriangle, UserRound } from "lucide-react";

interface ApprovalAdvisor {
  id: number;
  name: string;
  nameCn?: string | null;
  advisorType: string;
  track?: string | null;
  pillar?: string | null;
  background?: string | null;
  photoUrl?: string | null;
  linkedinUrl?: string | null;
}

interface ApprovalRole {
  title: string;
  organization: string;
  isPrimary: number | boolean;
}

interface ApprovalLookup {
  advisor: ApprovalAdvisor;
  roles: ApprovalRole[];
}

function useTokenFromHash(): string {
  return useMemo(() => {
    const hash = window.location.hash || "";
    const qIndex = hash.indexOf("?");
    const query = qIndex >= 0 ? hash.slice(qIndex + 1) : "";
    return new URLSearchParams(query).get("token") ?? "";
  }, []);
}

export default function AdvisorApproval() {
  const { t } = useLang();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const token = useTokenFromHash();
  const [decided, setDecided] = useState<"approved" | "rejected" | null>(null);

  const lookup = useQuery<ApprovalLookup>({
    queryKey: ["/api/advisors/approval", token],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/advisors/approval/${encodeURIComponent(token)}`);
      return res.json();
    },
    enabled: token.length > 0,
    retry: false,
  });

  const decide = useMutation({
    mutationFn: async (decision: "approve" | "reject") => {
      const res = await apiRequest("POST", `/api/advisors/approval/${encodeURIComponent(token)}/decide`, { decision });
      return res.json() as Promise<{ ok: boolean; decision: "approved" | "rejected" }>;
    },
    onSuccess: (data) => {
      setDecided(data.decision);
      queryClient.invalidateQueries({ queryKey: ["/api/advisors"] });
      toast({ description: t("approvalDecisionRecorded") });
    },
    onError: (e: any) => toast({ description: String(e?.message ?? e), variant: "destructive" }),
  });

  let errorKey: "approvalPageInvalid" | "approvalPageExpired" | "approvalPageDecided" | null = null;
  if (lookup.isError) {
    const message = String((lookup.error as any)?.message ?? "");
    if (message.includes("410") || message.includes("expired_token")) errorKey = "approvalPageExpired";
    else if (message.includes("409") || message.includes("already_decided")) errorKey = "approvalPageDecided";
    else errorKey = "approvalPageInvalid";
  }

  return (
    <Layout>
      <div className="mx-auto max-w-xl px-4 py-10">
        <Card data-testid="card-advisor-approval">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="h-5 w-5 text-[hsl(var(--gold))]" /> {t("approvalPageTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!token && (
              <p className="text-sm text-muted-foreground" data-testid="text-approval-missing-token">{t("approvalPageInvalid")}</p>
            )}

            {token && lookup.isLoading && (
              <div className="space-y-2" data-testid="text-approval-loading">
                <p className="text-sm text-muted-foreground">{t("approvalPageLoading")}</p>
                <Skeleton className="h-24 w-full rounded-md" />
              </div>
            )}

            {token && errorKey && (
              <div className="flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400" data-testid="text-approval-error">
                <AlertTriangle className="h-4 w-4 shrink-0" /> {t(errorKey)}
              </div>
            )}

            {token && lookup.data && !errorKey && !decided && (
              <div className="space-y-4" data-testid="content-approval-review">
                <div className="flex items-center gap-3">
                  {lookup.data.advisor.photoUrl ? (
                    <img src={lookup.data.advisor.photoUrl} alt={lookup.data.advisor.name} className="h-12 w-12 rounded-full object-cover" data-testid="img-approval-advisor-photo" />
                  ) : (
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary" data-testid="placeholder-approval-advisor-photo">
                      <UserRound className="h-6 w-6 text-muted-foreground" />
                    </div>
                  )}
                  <div>
                    <p className="font-semibold" data-testid="text-approval-advisor-name">{lookup.data.advisor.name}</p>
                    {lookup.data.advisor.nameCn && <p className="text-xs text-muted-foreground">{lookup.data.advisor.nameCn}</p>}
                  </div>
                </div>
                {lookup.data.roles.length > 0 && (
                  <div className="space-y-1 rounded-md bg-secondary/40 p-3 text-sm">
                    {lookup.data.roles.map((r, i) => (
                      <p key={i} data-testid={`text-approval-role-${i}`}>
                        <span className="font-medium">{r.title}</span>
                        {r.organization ? ` · ${r.organization}` : ""}
                      </p>
                    ))}
                  </div>
                )}
                {lookup.data.advisor.background && (
                  <p className="whitespace-pre-line text-sm text-muted-foreground" data-testid="text-approval-background">
                    {lookup.data.advisor.background}
                  </p>
                )}
                <div className="flex gap-2 pt-2">
                  <Button
                    className="bg-emerald-600 text-white hover:bg-emerald-700"
                    disabled={decide.isPending}
                    onClick={() => decide.mutate("approve")}
                    data-testid="button-approval-approve"
                  >
                    <Check className="mr-1.5 h-4 w-4" /> {t("approvalApprove")}
                  </Button>
                  <Button
                    variant="outline"
                    disabled={decide.isPending}
                    onClick={() => decide.mutate("reject")}
                    data-testid="button-approval-reject"
                  >
                    <X className="mr-1.5 h-4 w-4" /> {t("approvalReject")}
                  </Button>
                </div>
              </div>
            )}

            {decided && (
              <div className="flex flex-col items-center gap-3 py-6 text-center" data-testid="text-approval-decided-confirmation">
                {decided === "approved" ? (
                  <Check className="h-8 w-8 text-emerald-600" />
                ) : (
                  <X className="h-8 w-8 text-rose-600" />
                )}
                <p className="text-sm font-medium">{t("approvalDecisionRecorded")}</p>
                <Button variant="outline" size="sm" onClick={() => navigate("/")} data-testid="button-approval-back-home">
                  {t("approvalBackHome")}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
