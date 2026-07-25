import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Layout } from "@/components/shared";
import { useLang } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
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
import { Trophy, ShieldAlert, Download, Loader2 } from "lucide-react";
import { downloadWithAuth } from "@/lib/download";
import { formatDMY } from "@/components/advisor-crm";
import { cn } from "@/lib/utils";

// v5.9 — rows are anchored to team accounts, not to free-text PIC labels.
interface ScoreboardRow {
  name: string;
  userId: number | null;
  role: string | null;
  isFormer: boolean;
  partners: number;
  partnersInPeriod: number;
  advOriginated: number;
  advManaging: number;
  advProposed: number;
  advOnboarded: number;
  advTerminated: number;
  advOnboardedInPeriod: number;
  advOriginatedInPeriod: number;
}

interface ScoreboardResponse {
  rows: ScoreboardRow[];
  isAdmin: boolean;
  from: string;
  to: string;
}

type LedgerRelation = "originated" | "managing" | "both";

interface LedgerAdvisor {
  id: number;
  name: string;
  nameCn: string | null;
  lifecycleStatus: string;
  onboardedAt: string | null;
  relation: LedgerRelation;
}

interface LedgerPartner {
  id: number;
  nameEn: string;
  nameCn: string | null;
  category: string;
  startDate: string | null;
  collabLevel: number;
}

interface LedgerResponse {
  name: string;
  advisors: LedgerAdvisor[];
  partners: LedgerPartner[];
}

const RELATION_KEYS: Record<LedgerRelation, "sbRelOriginated" | "sbRelManaging" | "sbRelBoth"> = {
  originated: "sbRelOriginated",
  managing: "sbRelManaging",
  both: "sbRelBoth",
};

const RELATION_STYLES: Record<LedgerRelation, string> = {
  originated: "border-[hsl(var(--gold))]/40 bg-[hsl(var(--gold))]/10 text-[hsl(var(--gold))]",
  managing: "border-[hsl(193,52%,38%)]/40 bg-[hsl(193,52%,38%)]/10 text-[hsl(193,52%,30%)] dark:text-[hsl(193,60%,60%)]",
  both: "border-emerald-500/40 bg-emerald-500/10 text-emerald-600",
};

// ---------- Click-through ledger ----------
function LedgerDialog({
  name, range, onClose,
}: {
  name: string | null;
  range: { from: string; to: string };
  onClose: () => void;
}) {
  const { t, lang } = useLang();
  const qs = new URLSearchParams();
  if (name) qs.set("name", name);
  if (range.from) qs.set("from", range.from);
  if (range.to) qs.set("to", range.to);

  const { data, isLoading, isError } = useQuery<LedgerResponse>({
    queryKey: ["/api/scoreboard/ledger", name ?? "", range.from, range.to],
    queryFn: async () => (await apiRequest("GET", `/api/scoreboard/ledger?${qs.toString()}`)).json(),
    enabled: name !== null,
  });

  const advisorName = (a: LedgerAdvisor) => (lang === "cn" && a.nameCn ? a.nameCn : a.name);
  const partnerName = (p: LedgerPartner) => (lang === "cn" && p.nameCn ? p.nameCn : p.nameEn);

  return (
    <Dialog open={name !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" data-testid="dialog-ledger">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-[hsl(var(--gold))]" /> {t("sbLedgerTitle")} — {name}
          </DialogTitle>
          <DialogDescription>{t("sbLedgerHint")}</DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-2 pt-1">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-9 w-full rounded-md" />)}
          </div>
        ) : isError || !data ? (
          <p className="py-6 text-center text-sm text-muted-foreground" data-testid="text-ledger-error">{t("sbLedgerFailed")}</p>
        ) : (
          <div className="space-y-5 pt-1">
            {/* Advisors */}
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t("sbLedgerAdvisors")} ({data.advisors.length})
              </p>
              {data.advisors.length === 0 ? (
                <p className="text-sm text-muted-foreground" data-testid="text-ledger-advisors-empty">{t("sbLedgerEmpty")}</p>
              ) : (
                <div className="divide-y divide-border rounded-lg border border-border">
                  {data.advisors.map((a) => (
                    <div key={a.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm" data-testid={`row-ledger-advisor-${a.id}`}>
                      <span className="font-medium">{advisorName(a)}</span>
                      {a.nameCn && lang !== "cn" && <span className="text-xs text-muted-foreground">{a.nameCn}</span>}
                      <Badge variant="outline" className={cn("text-[10px]", RELATION_STYLES[a.relation])} data-testid={`badge-ledger-relation-${a.id}`}>
                        {t(RELATION_KEYS[a.relation])}
                      </Badge>
                      <Badge variant="outline" className="text-[10px] text-muted-foreground">
                        {t(`lifecycle_${a.lifecycleStatus}` as any)}
                      </Badge>
                      <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                        {a.onboardedAt ? formatDMY(String(a.onboardedAt).slice(0, 10)) : "—"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Partners */}
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t("sbLedgerPartners")} ({data.partners.length})
              </p>
              {data.partners.length === 0 ? (
                <p className="text-sm text-muted-foreground" data-testid="text-ledger-partners-empty">{t("sbLedgerEmpty")}</p>
              ) : (
                <div className="divide-y divide-border rounded-lg border border-border">
                  {data.partners.map((p) => (
                    <div key={p.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm" data-testid={`row-ledger-partner-${p.id}`}>
                      <span className="font-medium">{partnerName(p)}</span>
                      <Badge variant="outline" className="text-[10px] text-muted-foreground">
                        {t(`cat_${p.category}` as any)}
                      </Badge>
                      <Badge variant="outline" className="text-[10px] text-muted-foreground">
                        {t("sbLedgerLevel")} L{p.collabLevel}
                      </Badge>
                      <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                        {p.startDate ? formatDMY(String(p.startDate).slice(0, 10)) : "—"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// v5.12 — the scoreboard lives inside the admin portal (hidden from other roles).
// ScoreboardPanel is embedded as an admin tab; the standalone /scoreboard route
// keeps working for old bookmarks, admin-guarded.
export function ScoreboardPanel() {
  const { t } = useLang();
  const { user } = useAuth();
  const { toast } = useToast();
  const isAdmin = user?.role === "admin";

  // Draft inputs vs the applied range that drives the query key.
  const [fromDraft, setFromDraft] = useState("");
  const [toDraft, setToDraft] = useState("");
  const [range, setRange] = useState({ from: "", to: "" });
  const [showFormer, setShowFormer] = useState(true);
  const [roleFilter, setRoleFilter] = useState<"all" | "admin" | "staff">("all");
  const [ledgerFor, setLedgerFor] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const qs = new URLSearchParams();
  if (range.from) qs.set("from", range.from);
  if (range.to) qs.set("to", range.to);
  const url = qs.toString() ? `/api/scoreboard?${qs.toString()}` : "/api/scoreboard";

  const { data, isLoading } = useQuery<ScoreboardResponse>({
    queryKey: ["/api/scoreboard", range.from, range.to],
    queryFn: async () => (await apiRequest("GET", url)).json(),
    enabled: !!user && isAdmin,
  });

  const rows = useMemo(() => {
    return (data?.rows ?? [])
      .filter((r) => (showFormer ? true : !r.isFormer))
      .filter((r) => (roleFilter === "all" ? true : r.role === roleFilter));
  }, [data, showFormer, roleFilter]);

  const exportCsv = async () => {
    setExporting(true);
    try {
      const ex = new URLSearchParams();
      ex.set("from", range.from);
      ex.set("to", range.to);
      await downloadWithAuth(`/api/export/scoreboard.csv?${ex.toString()}`, "gobi-scoreboard.csv");
    } catch (e: any) {
      toast({ description: `${t("exportFailed")} — ${String(e?.message ?? e)}`, variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <ShieldAlert className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
        <p className="text-muted-foreground" data-testid="text-scoreboard-denied">{t("sbAdminOnly")}</p>
      </div>
    );
  }

  const numericColumns: Array<{ key: keyof ScoreboardRow; label: string }> = [
    { key: "advOriginated", label: t("sbOriginated") },
    { key: "advOnboardedInPeriod", label: t("sbOnboardedPeriod") },
    { key: "advOriginatedInPeriod", label: t("sbOriginatedPeriod") },
    { key: "partners", label: t("sbPartners") },
    { key: "partnersInPeriod", label: t("sbPartnersPeriod") },
  ];

  return (
    <>
      <div className="mx-auto max-w-6xl px-4 py-8" data-testid="page-scoreboard">
        <div>
          <h1 className="flex items-center gap-2.5 text-2xl font-bold tracking-tight" data-testid="text-scoreboard-title">
            <Trophy className="h-6 w-6 text-[hsl(var(--gold))]" /> {t("scoreboardTitle")}
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">{t("scoreboardSub")}</p>
        </div>

        {/* Filters */}
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

          <div className="space-y-1">
            <Label className="text-xs">{t("sbRoleFilter")}</Label>
            <Select value={roleFilter} onValueChange={(v) => setRoleFilter(v as "all" | "admin" | "staff")}>
              <SelectTrigger className="h-10 w-40" data-testid="select-scoreboard-role"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("sbRoleAll")}</SelectItem>
                <SelectItem value="admin">{t("sbRoleAdmin")}</SelectItem>
                <SelectItem value="staff">{t("sbRoleStaff")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <label className="flex h-10 cursor-pointer items-center gap-2 rounded-md border border-border px-3 text-sm">
            <Checkbox
              checked={showFormer}
              onCheckedChange={(v) => setShowFormer(v === true)}
              data-testid="checkbox-scoreboard-former"
            />
            <span>{t("sbShowFormer")}</span>
          </label>

          <Button
            type="button"
            variant="outline"
            className="h-10"
            disabled={exporting}
            onClick={exportCsv}
            data-testid="button-export-scoreboard"
          >
            {exporting ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Download className="mr-1.5 h-3.5 w-3.5" />}
            {t("exportScoreboardCsv")}
          </Button>
        </div>

        <p className="mt-3 text-xs text-muted-foreground" data-testid="text-scoreboard-row-hint">{t("sbRowHint")}</p>

        {/* Matrix */}
        {isLoading ? (
          <div className="mt-6 space-y-2">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full rounded-md" />)}
          </div>
        ) : rows.length === 0 ? (
          <p className="mt-10 text-center text-sm text-muted-foreground" data-testid="text-scoreboard-empty">{t("scoreboardEmpty")}</p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-xl border border-border bg-card/80 backdrop-blur">
            <table className="w-full text-sm" data-testid="table-scoreboard">
              <thead>
                <tr className="border-b border-border bg-secondary/40 text-left">
                  <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("sbStaffColumn")}</th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                    {t("sbManaging")}
                  </th>
                  {numericColumns.map((c) => (
                    <th key={String(c.key)} className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => {
                  const isSelf = r.name === user?.name;
                  return (
                    <tr
                      key={r.name}
                      onClick={() => setLedgerFor(r.name)}
                      className={cn("cursor-pointer transition-colors hover:bg-secondary/30", isSelf && "bg-[hsl(var(--gold))]/8")}
                      data-testid={`row-scoreboard-${r.name}`}
                    >
                      <td className="px-4 py-2.5" data-testid={`text-scoreboard-staff-${r.name}`}>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-medium whitespace-nowrap">{r.name}</span>
                          {r.isFormer && (
                            <Badge variant="outline" className="text-[10px] text-muted-foreground" data-testid={`badge-scoreboard-former-${r.name}`}>
                              {t("sbFormerBadge")}
                            </Badge>
                          )}
                        </div>
                        {r.role && (
                          <p className="text-[11px] text-muted-foreground">
                            {r.role === "admin" ? t("sbRoleAdmin") : t("sbRoleStaff")}
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right" data-testid={`text-scoreboard-advManaging-${r.name}`}>
                        <span className="tabular-nums font-medium">{r.advManaging}</span>
                        <p className="text-[10px] text-muted-foreground tabular-nums whitespace-nowrap">
                          {t("sbProposed")} {r.advProposed} · {t("sbOnboarded")} {r.advOnboarded} · {t("sbTerminated")} {r.advTerminated}
                        </p>
                      </td>
                      {numericColumns.map((c) => (
                        <td
                          key={String(c.key)}
                          className="px-3 py-2.5 text-right tabular-nums"
                          data-testid={`text-scoreboard-${String(c.key)}-${r.name}`}
                        >
                          {r[c.key] as number}
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

      <LedgerDialog name={ledgerFor} range={range} onClose={() => setLedgerFor(null)} />
    </>
  );
}

export default function Scoreboard() {
  return (
    <Layout>
      <ScoreboardPanel />
    </Layout>
  );
}
