import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLang } from "@/lib/i18n";
import { Layout, PartnerLogo, StageBadge, CategoryBadge, LevelDots, PartnershipDetailDialog } from "@/components/shared";
import { Skeleton } from "@/components/ui/skeleton";
import { Star } from "lucide-react";
import type { Partnership, Stage, Category } from "@shared/schema";

export default function HallOfFame() {
  const { t, lang } = useLang();
  const { data: partnerships, isLoading } = useQuery<Partnership[]>({
    queryKey: ["/api/partnerships"],
  });
  const [selected, setSelected] = useState<Partnership | null>(null);

  const famers = (partnerships ?? []).filter((p) => p.hallOfFame === 1);

  return (
    <Layout>
      <section className="border-b border-border bg-[hsl(214,68%,15%)] dark:bg-[hsl(218,71%,5%)] text-white">
        <div className="mx-auto max-w-6xl px-4 py-14">
          <div className="flex items-center gap-3">
            <Star className="h-7 w-7 fill-[hsl(var(--gold))] text-[hsl(var(--gold))]" />
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">{t("hofTitle")}</h1>
          </div>
          <p className="mt-3 max-w-2xl text-sm md:text-base text-[hsl(210,40%,80%)]">{t("hofBody")}</p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12">
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[...Array(2)].map((_, i) => (
              <Skeleton key={i} className="h-56 rounded-xl" />
            ))}
          </div>
        ) : famers.length === 0 ? (
          <p className="py-20 text-center text-muted-foreground" data-testid="text-hof-empty">{t("hofEmpty")}</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {famers.map((p) => {
              const name = lang === "cn" && p.nameCn ? p.nameCn : p.nameEn;
              const altName = lang === "cn" ? p.nameEn : p.nameCn;
              const desc = lang === "cn" ? p.descriptionCn || p.descriptionEn : p.descriptionEn || p.descriptionCn;
              return (
                <button
                  key={p.id}
                  onClick={() => setSelected(p)}
                  data-testid={`card-hof-${p.id}`}
                  className="relative text-left rounded-xl border-2 border-[hsl(var(--gold))]/40 bg-card p-6 transition-all hover:border-[hsl(var(--gold))] hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-ring overflow-hidden"
                >
                  <div className="absolute top-0 right-0 h-24 w-24 -translate-y-1/2 translate-x-1/2 rounded-full bg-[hsl(var(--gold))]/10" />
                  <Star className="absolute top-4 right-4 h-5 w-5 fill-[hsl(var(--gold))] text-[hsl(var(--gold))]" />
                  <div className="flex items-start gap-4">
                    <PartnerLogo p={p} size="lg" />
                    <div className="min-w-0 pr-8">
                      <h3 className="font-extrabold text-lg leading-snug">{name}</h3>
                      {altName && <p className="text-sm text-muted-foreground">{altName}</p>}
                    </div>
                  </div>
                  {desc && <p className="mt-4 text-sm text-muted-foreground leading-relaxed">{desc}</p>}
                  <div className="mt-5 flex flex-wrap items-center gap-2">
                    <StageBadge stage={p.stage as Stage} />
                    <CategoryBadge category={p.category as Category} />
                    <span className="ml-auto"><LevelDots level={p.collabLevel} showLabel /></span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <PartnershipDetailDialog p={selected} open={!!selected} onOpenChange={(o) => !o && setSelected(null)} />
    </Layout>
  );
}
