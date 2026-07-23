import { useEffect, useMemo, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { useLang } from "@/lib/i18n";
import { Layout, PartnershipCard, PartnershipDetailDialog, PartnerLogo, StageBadge, NewBadge, MultiSelectFilter, GroupedRegionFilter, DEFAULT_VIEW_OPTIONS, type ViewOptions } from "@/components/shared";
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EditPartnershipDialog } from "@/components/edit-partnership";
import { NetworkGraph, NetworkLegend } from "@/components/network-graph";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, LayoutGrid, Share2, CalendarRange, Download, Star, SlidersHorizontal } from "lucide-react";
import type { Partnership, Stage } from "@shared/schema";
import { STAGES, CATEGORIES, REGIONS, STAGE_NUM, sortPartnerships, picsOf, levelOfStage, yearsOf } from "@/lib/constants";

type ViewMode = "cards" | "network" | "timeline";

export default function Home({ initialView = "network", initialHof = false }: { initialView?: ViewMode; initialHof?: boolean }) {
  const { t, lang } = useLang();
  const queryClient = useQueryClient();
  const { data: partnerships, isLoading } = useQuery<Partnership[]>({
    queryKey: ["/api/partnerships"],
  });

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string[]>([]);
  const [stage, setStage] = useState<string[]>([]);
  const [region, setRegion] = useState<string[]>([]);
  const [year, setYear] = useState<string[]>([]);
  const [selected, setSelected] = useState<Partnership | null>(null);
  const [editTarget, setEditTarget] = useState<Partnership | null>(null);
  const [view, setView] = useState<ViewMode>(initialView);
  const [hof, setHof] = useState(initialHof);
  const [viewOpts, setViewOpts] = useState<ViewOptions>(DEFAULT_VIEW_OPTIONS);
  const [, navigate] = useLocation();
  const [matchPartner, partnerParams] = useRoute("/partner/:id");
  const [timelineFrom, setTimelineFrom] = useState("");
  const [timelineTo, setTimelineTo] = useState("");
  const [exportOpen, setExportOpen] = useState(false);

  const allYears = useMemo(() => yearsOf(partnerships ?? []), [partnerships]);

  // Deep link: /partner/:id opens the record's detail dialog (used by admin
  // console rows, the update log, and advisor role chips).
  useEffect(() => {
    if (matchPartner && partnerParams?.id && partnerships) {
      const target = partnerships.find((x) => x.id === Number(partnerParams.id));
      if (target) setSelected(target);
    }
  }, [matchPartner, partnerParams?.id, partnerships]);

  const filtered = useMemo(() => {
    if (!partnerships) return [];
    const q = search.trim().toLowerCase();
    return sortPartnerships(
      partnerships.filter((p) => {
        if (category.length > 0 && !category.includes(p.category)) return false;
        if (stage.length > 0) {
          const hit = stage.some((s) =>
            s === "active" ? p.stage === "s4_progressive" || p.stage === "s5_strategic" : p.stage === s,
          );
          if (!hit) return false;
        }
        if (region.length > 0 && !region.includes(p.region)) return false;
        if (year.length > 0 && !year.some((y) => (p.startDate ?? "").startsWith(y))) return false;
        if (view === "network" && hof && p.hallOfFame !== 1) return false;
        if (!q) return true;
        return [p.nameEn, p.nameCn, p.descriptionEn, p.descriptionCn, p.partnershipType, p.contactName, picsOf(p).join(" "), p.context]
          .filter(Boolean)
          .some((f) => f!.toLowerCase().includes(q));
      }),
    );
  }, [partnerships, search, category, stage, region, year, view, hof]);

  // Timeline: only entries with a start date, optionally within the range, oldest first, grouped by year
  const timeline = useMemo(() => {
    const dated = filtered
      .filter((p) => {
        if (!p.startDate) return false;
        if (timelineFrom && p.startDate < timelineFrom) return false;
        if (timelineTo && p.startDate > timelineTo) return false;
        return true;
      })
      .sort((a, b) => a.startDate!.localeCompare(b.startDate!));
    const groups: { year: string; items: Partnership[] }[] = [];
    for (const p of dated) {
      const y = p.startDate!.slice(0, 4);
      const g = groups[groups.length - 1];
      if (g && g.year === y) g.items.push(p);
      else groups.push({ year: y, items: [p] });
    }
    const noDate = filtered.filter((p) => !p.startDate).length;
    return { dated, groups, noDate };
  }, [filtered, timelineFrom, timelineTo]);

  const goDirectory = (opts?: { category?: string; stage?: string }) => {
    setView("cards");
    setCategory(opts?.category ? [opts.category] : []);
    setStage(opts?.stage ? [opts.stage] : []);
    setRegion([]);
    setYear([]);
    setSearch("");
    setTimeout(() => document.getElementById("directory")?.scrollIntoView({ behavior: "smooth" }), 60);
  };

  const stats = useMemo(() => {
    const all = partnerships ?? [];
    return {
      total: all.length,
      active: all.filter((p) => p.stage === "s4_progressive" || p.stage === "s5_strategic").length,
      mou: all.filter((p) => p.stage === "s3_agreement").length,
      universities: all.filter((p) => p.category === "university").length,
    };
  }, [partnerships]);

  const fmtDay = (iso: string) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString(lang === "cn" ? "zh-CN" : "en-US", { month: "short", day: "numeric" });

  // Recent partnership log — extract of the newest records for the cover
  const recentLog = useMemo(() => {
    const logDate = (p: Partnership) => (p.startDate || p.createdAt || "").slice(0, 10);
    return (partnerships ?? [])
      .slice()
      .sort((a, b) => (logDate(a) < logDate(b) ? 1 : logDate(a) > logDate(b) ? -1 : b.id - a.id))
      .slice(0, 4);
  }, [partnerships]);

  const fmtLogDay = (p: Partnership) => {
    const iso = (p.startDate || p.createdAt || "").slice(0, 10);
    if (!iso) return "";
    return new Date(`${iso}T00:00:00`).toLocaleDateString(lang === "cn" ? "zh-CN" : "en-US", { day: "numeric", month: "short", year: "numeric" });
  };

  return (
    <Layout>
      {/* Hero */}
      <section className="border-b border-border bg-[hsl(214,68%,15%)]/85 dark:bg-[hsl(218,71%,5%)]/55 backdrop-blur-sm text-white">
        <div className="mx-auto max-w-6xl px-4 py-14 md:py-20">
          <div className="flex flex-col lg:flex-row lg:items-start lg:gap-12">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold tracking-[0.2em] uppercase text-[hsl(var(--aqua))] mb-4">
                {t("heroEyebrow")}
              </p>
              <h1 className="text-2xl md:text-4xl font-extrabold tracking-tight max-w-2xl">
                {t("heroTitle")}
              </h1>
              <p className="mt-4 max-w-2xl text-sm md:text-base text-[hsl(210,40%,80%)] leading-relaxed">
                {t("heroBody")}
              </p>

              <div className="mt-10 grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl">
                <Stat value={stats.total} label={t("statPartners")} loading={isLoading} onClick={() => goDirectory()} />
                <Stat value={stats.active} label={t("statActive")} loading={isLoading} gold onClick={() => goDirectory({ stage: "active" })} />
                <Stat value={stats.mou} label={t("statMou")} loading={isLoading} onClick={() => goDirectory({ stage: "s3_agreement" })} />
                <Stat value={stats.universities} label={t("statUniversities")} loading={isLoading} onClick={() => goDirectory({ category: "university" })} />
              </div>

              <button
                type="button"
                onClick={() => goDirectory()}
                className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-[hsl(var(--aqua))] transition-colors hover:text-[hsl(var(--gold))]"
                data-testid="button-browse-all"
              >
                {t("browseAll")} →
              </button>
            </div>

            {/* Recent partnership log — extract on the cover */}
            {recentLog.length > 0 && (
              <aside className="mt-10 lg:mt-0 lg:w-[380px] shrink-0" data-testid="hero-recent-log">
                <div className="rounded-xl border border-white/15 bg-white/[0.06] backdrop-blur-sm p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-sm font-bold tracking-wide text-white/90">{t("heroLogTitle")}</h2>
                    <button
                      type="button"
                      onClick={() => navigate("/updates")}
                      className="text-xs font-semibold text-[hsl(var(--aqua))] transition-colors hover:text-[hsl(var(--gold))]"
                      data-testid="button-hero-log-all"
                    >
                      {t("heroLogAll")} →
                    </button>
                  </div>
                  <div className="space-y-2">
                    {recentLog.map((p) => (
                      <div
                        key={p.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => navigate(`/partner/${p.id}`)}
                        onKeyDown={(e) => e.key === "Enter" && navigate(`/partner/${p.id}`)}
                        className="flex cursor-pointer items-center gap-3 rounded-lg border border-white/10 bg-white/[0.05] px-3 py-2 transition-all hover:border-[hsl(var(--gold))]/60 hover:bg-white/[0.1]"
                        data-testid={`hero-log-entry-${p.id}`}
                      >
                        <PartnerLogo p={p} size="sm" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-white truncate">
                            {lang === "cn" && p.nameCn ? p.nameCn : p.nameEn}
                          </p>
                          <p className="text-[11px] text-white/55 tabular-nums">
                            {fmtLogDay(p)} · {p.startDate ? t("partnerLogStarted") : t("partnerLogAdded")}
                          </p>
                        </div>
                        <StageBadge stage={p.stage as Stage} />
                      </div>
                    ))}
                  </div>
                </div>
              </aside>
            )}
          </div>
        </div>
      </section>

      {/* Filters + directory */}
      <section id="directory" className="mx-auto max-w-6xl px-4 py-10 scroll-mt-16">
        <div className="flex flex-col md:flex-row md:flex-wrap gap-3 mb-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("searchPlaceholder")}
              className="pl-9"
              data-testid="input-search"
            />
          </div>
          <MultiSelectFilter
            label={t("filterCategory")}
            options={CATEGORIES.map((c) => ({ value: c, label: t(`cat_${c}` as any) }))}
            selected={category}
            onChange={setCategory}
            className="w-full md:w-44"
            testid="select-category"
          />
          <MultiSelectFilter
            label={t("filterStage")}
            options={[
              { value: "active", label: t("filterActive") },
              ...STAGES.map((s) => ({ value: s, label: `${STAGE_NUM[s]} · ${t(`stage_${s}` as any)}` })),
            ]}
            selected={stage}
            onChange={setStage}
            className="w-full md:w-44"
            testid="select-stage"
          />
          <GroupedRegionFilter
            selected={region}
            onChange={setRegion}
            className="w-full md:w-40"
            testid="select-region"
          />
          <MultiSelectFilter
            label={t("yearFilter")}
            options={allYears.map((y) => ({ value: y, label: y }))}
            selected={year}
            onChange={setYear}
            className="w-full md:w-36"
            testid="select-year"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 mb-8">
          {/* View toggle: cards / network / timeline */}
          <div className="inline-flex rounded-lg border border-border p-0.5 bg-muted/40">
            <button
              onClick={() => setView("cards")}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${view === "cards" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              data-testid="button-view-cards"
            >
              <LayoutGrid className="h-3.5 w-3.5" /> {t("viewCards")}
            </button>
            <button
              onClick={() => setView("network")}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${view === "network" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              data-testid="button-view-network"
            >
              <Share2 className="h-3.5 w-3.5" /> {t("viewNetwork")}
            </button>
            <button
              onClick={() => setView("timeline")}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${view === "timeline" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              data-testid="button-view-timeline"
            >
              <CalendarRange className="h-3.5 w-3.5" /> {t("viewTimeline")}
            </button>
          </div>

          {/* Display options: opt info blocks in/out (useful when screenshotting as a slide) */}
          {(view === "cards" || view === "network") && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
                  data-testid="button-display-options"
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" /> {t("displayOptions")}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuLabel className="text-xs">{t("displayOptionsHint")}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {([
                  ["newBadge", t("optNewBadge")],
                  ["lpStar", t("optLpStar")],
                  ["pic", t("optPic")],
                  ["region", t("optRegion")],
                  ["stage", t("optStage")],
                  ["category", t("optCategory")],
                ] as [keyof ViewOptions, string][]).map(([key, label]) => (
                  <DropdownMenuCheckboxItem
                    key={key}
                    checked={viewOpts[key]}
                    onCheckedChange={(c) => setViewOpts((o) => ({ ...o, [key]: c === true }))}
                    onSelect={(e) => e.preventDefault()}
                    data-testid={`check-opt-${key}`}
                  >
                    {label}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* Star map mode: all partners / Hall of Fame */}
          {view === "network" && (
            <div className="inline-flex rounded-lg border border-border p-0.5 bg-muted/40">
              <button
                onClick={() => setHof(false)}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${!hof ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                data-testid="button-mode-all"
              >
                {t("allPartnersMode")}
              </button>
              <button
                onClick={() => setHof(true)}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${hof ? "bg-background shadow-sm text-[hsl(var(--gold))]" : "text-muted-foreground hover:text-foreground"}`}
                data-testid="button-mode-hof"
              >
                <Star className={`h-3.5 w-3.5 ${hof ? "fill-[hsl(var(--gold))] text-[hsl(var(--gold))]" : ""}`} /> {t("hofMode")}
              </button>
            </div>
          )}

          {/* Timeline date range */}
          {view === "timeline" && (
            <div className="inline-flex items-center gap-2">
              <label className="text-xs font-semibold text-muted-foreground">{t("timelineFrom")}</label>
              <Input type="date" value={timelineFrom} onChange={(e) => setTimelineFrom(e.target.value)} className="w-40 h-9" data-testid="input-timeline-from" />
              <label className="text-xs font-semibold text-muted-foreground">{t("timelineTo")}</label>
              <Input type="date" value={timelineTo} onChange={(e) => setTimelineTo(e.target.value)} className="w-40 h-9" data-testid="input-timeline-to" />
            </div>
          )}

          <div className="ml-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setExportOpen(true)}
              className="gap-1.5 border-[hsl(var(--aqua))]/40 text-[hsl(193,52%,32%)] dark:text-[hsl(var(--aqua))] hover:bg-[hsl(var(--aqua))]/10 hover:border-[hsl(var(--aqua))]"
              data-testid="button-export"
            >
              <Download className="h-3.5 w-3.5" /> {t("exportBtn")}
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="h-44 rounded-xl" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-20 text-center text-muted-foreground" data-testid="text-no-results">
            {t("noResults")}
          </div>
        ) : view === "network" ? (
          <div>
            <div className="mb-4">
              <NetworkLegend />
            </div>
            <NetworkGraph partnerships={filtered} onSelect={setSelected} height={560} options={viewOpts} selectedRegions={region} onToggleRegion={(r) => setRegion(region.includes(r) ? region.filter((x) => x !== r) : [...region, r])} />
          </div>
        ) : view === "timeline" ? (
          timeline.dated.length === 0 ? (
            <div className="py-20 text-center text-muted-foreground" data-testid="text-timeline-empty">
              {t("timelineEmpty")}
            </div>
          ) : (
            <div>
              {timeline.groups.map((g) => (
                <div key={g.year} className="mb-8">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-lg font-extrabold tracking-tight text-[hsl(var(--gold))]">{g.year}</span>
                    <div className="h-px flex-1 bg-border" />
                    <span className="text-xs text-muted-foreground">{g.items.length}</span>
                  </div>
                  <div className="relative ml-2 border-l-2 border-[hsl(var(--aqua))]/30 pl-5 space-y-1">
                    {g.items.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setSelected(p)}
                        className="relative flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-muted/60"
                        data-testid={`row-timeline-${p.id}`}
                      >
                        <span className="absolute -left-[27px] top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full bg-[hsl(var(--aqua))]" />
                        <span className="w-16 shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">{fmtDay(p.startDate!)}</span>
                        <PartnerLogo p={p} size="sm" />
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                          {lang === "cn" && p.nameCn ? p.nameCn : p.nameEn}{" "}
                          <NewBadge p={p} />
                        </span>
                        <StageBadge stage={p.stage as any} />
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              {timeline.noDate > 0 && (
                <p className="mt-2 text-xs text-muted-foreground" data-testid="text-timeline-nodate">
                  {timeline.noDate} {t("timelineNoDate")}
                </p>
              )}
            </div>
          )
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filtered.map((p) => (
              <PartnershipCard key={p.id} p={p} onClick={() => setSelected(p)} opts={viewOpts} />
            ))}
          </div>
        )}
      </section>

      <PartnershipDetailDialog
        p={selected}
        open={!!selected}
        onOpenChange={(o) => {
          if (!o) {
            setSelected(null);
            if (matchPartner) navigate("/");
          }
        }}
        onEdit={(p) => {
          setSelected(null);
          setEditTarget(p);
        }}
      />
      <EditPartnershipDialog
        p={editTarget}
        allPartners={partnerships ?? []}
        onClose={() => setEditTarget(null)}
        onSaved={() => queryClient.invalidateQueries({ queryKey: ["/api/partnerships"] })}
      />
      <ExportDialog open={exportOpen} onOpenChange={setExportOpen} rows={filtered} />
    </Layout>
  );
}

// ---------- Export ----------

type ExportField = { key: string; labelKey: string; value: (p: Partnership, lang: string) => string | number };

const EXPORT_FIELDS: ExportField[] = [
  { key: "nameEn", labelKey: "nameEn", value: (p) => p.nameEn },
  { key: "nameCn", labelKey: "nameCn", value: (p) => p.nameCn ?? "" },
  { key: "category", labelKey: "filterCategory", value: (p) => p.category },
  { key: "region", labelKey: "filterRegion", value: (p) => p.region },
  { key: "stage", labelKey: "filterStage", value: (p) => p.stage },
  { key: "collabLevel", labelKey: "collabLevel", value: (p) => levelOfStage(p.stage) },
  { key: "picNames", labelKey: "picLabel", value: (p) => picsOf(p).join(", ") },
  { key: "startDate", labelKey: "startDate", value: (p) => p.startDate ?? "" },
  { key: "partnershipType", labelKey: "partnershipType", value: (p) => p.partnershipType ?? "" },
  { key: "website", labelKey: "website", value: (p) => p.website ?? "" },
  { key: "contactName", labelKey: "contactName", value: (p) => p.contactName ?? "" },
  { key: "contactEmail", labelKey: "contactEmail", value: (p) => p.contactEmail ?? "" },
  { key: "descriptionEn", labelKey: "descriptionEn", value: (p) => p.descriptionEn ?? "" },
  { key: "descriptionCn", labelKey: "descriptionCn", value: (p) => p.descriptionCn ?? "" },
  { key: "context", labelKey: "contextLabel", value: (p) => p.context ?? "" },
  { key: "notes", labelKey: "notes", value: (p) => p.notes ?? "" },
  { key: "hallOfFame", labelKey: "hofTitle", value: (p) => (p.hallOfFame === 1 ? "Y" : "") },
  { key: "status", labelKey: "exportStatusLabel", value: (p) => p.status },
  { key: "createdAt", labelKey: "exportCreatedLabel", value: (p) => p.createdAt.slice(0, 10) },
];

const DEFAULT_EXPORT_KEYS = ["nameEn", "nameCn", "category", "region", "stage", "collabLevel", "picNames", "startDate", "partnershipType"];

function ExportDialog({ open, onOpenChange, rows }: { open: boolean; onOpenChange: (o: boolean) => void; rows: Partnership[] }) {
  const { t, lang } = useLang();
  const [keys, setKeys] = useState<Set<string>>(new Set(DEFAULT_EXPORT_KEYS));

  const toggle = (k: string) =>
    setKeys((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  const buildSheet = () => {
    const fields = EXPORT_FIELDS.filter((f) => keys.has(f.key));
    const data = rows.map((p) => Object.fromEntries(fields.map((f) => [t(f.labelKey as any), f.value(p, lang)])));
    return XLSX.utils.json_to_sheet(data);
  };

  const stamp = () => new Date().toISOString().slice(0, 10);

  const doExcel = () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, buildSheet(), "Partnerships");
    XLSX.writeFile(wb, `gobi-partnerships-${stamp()}.xlsx`);
  };

  const doCsv = () => {
    const csv = XLSX.utils.sheet_to_csv(buildSheet());
    const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `gobi-partnerships-${stamp()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("exportTitle")}</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground -mt-2">
          {t("exportHint")} ({rows.length})
        </p>
        <div className="flex items-center gap-2 text-xs">
          <span className="font-semibold">{t("exportFields")}</span>
          <button type="button" onClick={() => setKeys(new Set(EXPORT_FIELDS.map((f) => f.key)))} className="text-[hsl(193,52%,32%)] dark:text-[hsl(var(--aqua))] font-semibold hover:underline" data-testid="button-select-all">
            {t("selectAll")}
          </button>
          <span className="text-muted-foreground">·</span>
          <button type="button" onClick={() => setKeys(new Set())} className="text-muted-foreground font-semibold hover:underline" data-testid="button-clear-all">
            {t("clearAll")}
          </button>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 max-h-72 overflow-y-auto pr-1">
          {EXPORT_FIELDS.map((f) => (
            <label key={f.key} className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox checked={keys.has(f.key)} onCheckedChange={() => toggle(f.key)} data-testid={`checkbox-export-${f.key}`} />
              <span className="truncate">{t(f.labelKey as any)}</span>
            </label>
          ))}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={doCsv} disabled={keys.size === 0 || rows.length === 0} data-testid="button-export-csv">
            {t("exportCsv")}
          </Button>
          <Button size="sm" onClick={doExcel} disabled={keys.size === 0 || rows.length === 0} className="bg-[hsl(193,52%,38%)] hover:bg-[hsl(193,52%,30%)] text-white" data-testid="button-export-excel">
            <Download className="h-3.5 w-3.5 mr-1" /> {t("exportExcel")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ value, label, loading, gold, onClick }: { value: number; label: string; loading: boolean; gold?: boolean; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-left cursor-pointer transition-all duration-200 hover:bg-white/10 hover:border-[hsl(var(--aqua))]/60 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-[hsl(var(--aqua))]/10"
      data-testid={`stat-${label}`}
    >
      {loading ? (
        <Skeleton className="h-8 w-12 bg-white/10" />
      ) : (
        <p className={`text-2xl font-extrabold ${gold ? "text-[hsl(var(--gold))]" : "text-[hsl(var(--aqua))]"}`}>
          {value}
        </p>
      )}
      <p className="text-xs text-[hsl(210,40%,75%)] mt-0.5">{label}</p>
    </button>
  );
}
