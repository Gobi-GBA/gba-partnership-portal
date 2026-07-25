import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Layout } from "@/components/shared";
import { useLang } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Trophy, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";

interface ScoreboardRow {
  pic: string;
  partners: number;
  advisorsTotal: number;
  advProposed: number;
  advOnboarded: number;
  advTerminated: number;
  advOnboardedInPeriod: number;
  partnersInPeriod: number;
}

interface ScoreboardResponse {
  rows: ScoreboardRow[];
  isAdmin: boolean;
  from: string;
  to: string;
}

export default function Scoreboard() {
  const { t } = useLang();
  const { user } = useAuth();
  const isStaff = user?.role === "admin" || user?.role === "staff";

  // Draft inputs vs the applied range that drives the query key.
  const [fromDraft, setFromDraft] = useState("");
  const [toDraft, setToDraft] = useState("");
  const [range, setRange] = useState({ from: "", to: "" });

  const qs = new URLSearchParams();
  if (range.from) qs.set("from", range.from);
  if (range.to) qs.set("to", range.to);
  const url = qs.toString() ? `/api/scoreboard?${qs.toString()}` : "/api/scoreboard";

  const { data, isLoading } = useQuery<ScoreboardResponse>({
    queryKey: ["/api/scoreboard", range.from, range.to],
    queryFn: async () => (await apiRequest("GET", url)).json(),
    enabled: !!user && isStaff,
  });

  if (!isStaff) {
    return (
      <Layout>
        <div className="mx-auto max-w-md px-4 py-24 text-center">
          <ShieldAlert className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
          <p className="text-muted-foreground" data-testid="text-scoreboard-denied">{t("sbStaffOnly")}</p>
        </div>
      </Layout>
    );
  }

  const columns: Array<{ key: keyof ScoreboardRow; label: string }> = [
    { key: "partners", label: t("sbPartners") },
    { key: "partnersInPeriod", label: t("sbPartnersPeriod") },
    { key: "advisorsTotal", label: t("sbAdvisors") },
    { key: "advProposed", label: t("sbProposed") },
    { key: "advOnboarded", label: t("sbOnboarded") },
    { key: "advTerminated", label: t("sbTerminated") },
    { key: "advOnboardedInPeriod", label: t("sbOnboardedPeriod") },
  ];

  return (
    <Layout>
      <div className="mx-auto max-w-5xl px-4 py-8" data-testid="page-scoreboard">
        <div>
          <h1 className="flex items-center gap-2.5 text-2xl font-bold tracking-tight" data-testid="text-scoreboard-title">
            <Trophy className="h-6 w-6 text-[hsl(var(--gold))]" /> {t("scoreboardTitle")}
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">{t("scoreboardSub")}</p>
        </div>

        {/* Period filter */}
        <div className="mt-6 flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label className="text-xs">{t("scoreboardFrom")}</Label>
            <Input
              type="date"
              className="h-10 w-40"
              value={fromDraft}
              onChange={(e) => setFromDraft(e.target.value)}
              data-testid="input-scoreboard-from"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t("scoreboardTo")}</Label>
            <Input
              type="date"
              className="h-10 w-40"
              value={toDraft}
              onChange={(e) => setToDraft(e.target.value)}
              data-testid="input-scoreboard-to"
            />
          </div>
          <Button
            onClick={() => setRange({ from: fromDraft, to: toDraft })}
            className="h-10 bg-[hsl(193,52%,38%)] text-white hover:bg-[hsl(193,52%,30%)]"
            data-testid="button-scoreboard-apply"
          >
            {t("scoreboardApply")}
          </Button>
        </div>

        {data && data.isAdmin === false && (
          <p className="mt-4 rounded-md border border-[hsl(var(--gold))]/40 bg-[hsl(var(--gold))]/10 px-3 py-2 text-xs text-[hsl(var(--gold))]" data-testid="text-scoreboard-own-only">
            {t("sbOwnOnly")}
          </p>
        )}

        {/* Matrix */}
        {isLoading ? (
          <div className="mt-6 space-y-2">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full rounded-md" />)}
          </div>
        ) : !data || data.rows.length === 0 ? (
          <p className="mt-10 text-center text-sm text-muted-foreground" data-testid="text-scoreboard-empty">{t("scoreboardEmpty")}</p>
        ) : (
          <div className="mt-6 overflow-x-auto rounded-xl border border-border bg-card/80 backdrop-blur">
            <table className="w-full text-sm" data-testid="table-scoreboard">
              <thead>
                <tr className="border-b border-border bg-secondary/40 text-left">
                  <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("sbPic")}</th>
                  {columns.map((c) => (
                    <th key={String(c.key)} className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.rows.map((r) => {
                  const isSelf = r.pic === user?.name;
                  return (
                    <tr
                      key={r.pic}
                      className={cn("transition-colors hover:bg-secondary/30", isSelf && "bg-[hsl(var(--gold))]/8")}
                      data-testid={`row-scoreboard-${r.pic}`}
                    >
                      <td className="px-4 py-2.5 font-medium whitespace-nowrap" data-testid={`text-scoreboard-pic-${r.pic}`}>
                        {r.pic}
                      </td>
                      {columns.map((c) => (
                        <td
                          key={String(c.key)}
                          className="px-3 py-2.5 text-right tabular-nums"
                          data-testid={`text-scoreboard-${String(c.key)}-${r.pic}`}
                        >
                          {r[c.key]}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Layout>
  );
}
