import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLang } from "@/lib/i18n";
import { Layout, PartnershipCard, PartnershipDetailDialog } from "@/components/shared";
import { NetworkGraph, NetworkLegend } from "@/components/network-graph";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, LayoutGrid, Share2 } from "lucide-react";
import type { Partnership } from "@shared/schema";
import { STAGES, CATEGORIES, REGIONS, STAGE_NUM, sortPartnerships, picsOf } from "@/lib/constants";

export default function Home() {
  const { t, lang } = useLang();
  const { data: partnerships, isLoading } = useQuery<Partnership[]>({
    queryKey: ["/api/partnerships"],
  });

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [stage, setStage] = useState("all");
  const [region, setRegion] = useState("all");
  const [selected, setSelected] = useState<Partnership | null>(null);
  // Network diagram is the primary view
  const [view, setView] = useState<"cards" | "network">("network");

  const filtered = useMemo(() => {
    if (!partnerships) return [];
    const q = search.trim().toLowerCase();
    return sortPartnerships(
      partnerships.filter((p) => {
        if (category !== "all" && p.category !== category) return false;
        if (stage === "active") {
          if (p.stage !== "s4_progressive" && p.stage !== "s5_strategic") return false;
        } else if (stage !== "all" && p.stage !== stage) return false;
        if (region !== "all" && p.region !== region) return false;
        if (!q) return true;
        return [p.nameEn, p.nameCn, p.descriptionEn, p.descriptionCn, p.partnershipType, p.contactName, picsOf(p).join(" "), p.context]
          .filter(Boolean)
          .some((f) => f!.toLowerCase().includes(q));
      }),
    );
  }, [partnerships, search, category, stage, region]);

  const goDirectory = (opts?: { category?: string; stage?: string }) => {
    setView("cards");
    setCategory(opts?.category ?? "all");
    setStage(opts?.stage ?? "all");
    setRegion("all");
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

  return (
    <Layout>
      {/* Hero */}
      <section className="border-b border-border bg-[hsl(214,68%,15%)] dark:bg-[hsl(218,71%,5%)] text-white">
        <div className="mx-auto max-w-6xl px-4 py-14 md:py-20">
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
      </section>

      {/* Filters + directory */}
      <section id="directory" className="mx-auto max-w-6xl px-4 py-10 scroll-mt-16">
        <div className="flex flex-col md:flex-row gap-3 mb-8">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("searchPlaceholder")}
              className="pl-9"
              data-testid="input-search"
            />
          </div>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-full md:w-48" data-testid="select-category">
              <SelectValue placeholder={t("filterCategory")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("filterCategory")}: {t("filterAll")}</SelectItem>
              {CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>{t(`cat_${c}` as any)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={stage} onValueChange={setStage}>
            <SelectTrigger className="w-full md:w-48" data-testid="select-stage">
              <SelectValue placeholder={t("filterStage")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("filterStage")}: {t("filterAll")}</SelectItem>
              <SelectItem value="active">{t("filterActive")}</SelectItem>
              {STAGES.map((s) => (
                <SelectItem key={s} value={s}>{STAGE_NUM[s]} · {t(`stage_${s}` as any)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={region} onValueChange={setRegion}>
            <SelectTrigger className="w-full md:w-48" data-testid="select-region">
              <SelectValue placeholder={t("filterRegion")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("filterRegion")}: {t("filterAll")}</SelectItem>
              {REGIONS.map((r) => (
                <SelectItem key={r} value={r}>{t(`region_${r}` as any)}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* View toggle: cards / network */}
          <div className="inline-flex rounded-lg border border-border p-0.5 bg-muted/40 self-start">
            <button
              onClick={() => setView("cards")}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${view === "cards" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground"}`}
              data-testid="button-view-cards"
            >
              <LayoutGrid className="h-3.5 w-3.5" /> {t("viewCards")}
            </button>
            <button
              onClick={() => setView("network")}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${view === "network" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground"}`}
              data-testid="button-view-network"
            >
              <Share2 className="h-3.5 w-3.5" /> {t("viewNetwork")}
            </button>
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
            <NetworkGraph partnerships={filtered} onSelect={setSelected} height={560} />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filtered.map((p) => (
              <PartnershipCard key={p.id} p={p} onClick={() => setSelected(p)} />
            ))}
          </div>
        )}
      </section>

      <PartnershipDetailDialog p={selected} open={!!selected} onOpenChange={(o) => !o && setSelected(null)} />
    </Layout>
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
