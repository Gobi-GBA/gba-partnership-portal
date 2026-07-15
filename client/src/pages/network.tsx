import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLang } from "@/lib/i18n";
import { Layout, PartnershipDetailDialog } from "@/components/shared";
import { NetworkGraph, NetworkLegend } from "@/components/network-graph";
import { Skeleton } from "@/components/ui/skeleton";
import type { Partnership } from "@shared/schema";

export default function Network() {
  const { t } = useLang();
  const { data: partnerships, isLoading } = useQuery<Partnership[]>({
    queryKey: ["/api/partnerships"],
  });
  const [selected, setSelected] = useState<Partnership | null>(null);

  return (
    <Layout>
      <section className="mx-auto max-w-6xl px-4 py-10">
        <h1 className="text-xl md:text-2xl font-extrabold tracking-tight">{t("networkTitle")}</h1>
        <p className="mt-2 text-sm text-muted-foreground max-w-2xl">{t("networkBody")}</p>

        <div className="mt-5">
          <NetworkLegend />
        </div>

        {isLoading || !partnerships ? (
          <Skeleton className="mt-6 h-[620px] w-full rounded-xl" />
        ) : (
          <div className="mt-6">
            <NetworkGraph partnerships={partnerships} onSelect={setSelected} />
          </div>
        )}
      </section>

      <PartnershipDetailDialog p={selected} open={!!selected} onOpenChange={(o) => !o && setSelected(null)} />
    </Layout>
  );
}
