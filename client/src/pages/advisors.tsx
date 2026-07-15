import { Layout } from "@/components/shared";
import { useLang } from "@/lib/i18n";
import { Badge } from "@/components/ui/badge";
import { Users } from "lucide-react";

export default function Advisors() {
  const { t } = useLang();
  return (
    <Layout>
      <div className="mx-auto max-w-2xl px-4 py-20 text-center" data-testid="page-advisors">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-secondary">
          <Users className="h-8 w-8 text-[hsl(var(--gold))]" />
        </div>
        <h1 className="text-xl font-bold tracking-tight" data-testid="text-advisors-title">
          {t("advisorsTitle")}
        </h1>
        <Badge
          variant="outline"
          className="mt-3 border-[hsl(var(--gold))]/40 bg-[hsl(var(--gold))]/10 text-[hsl(var(--gold))] text-[11px] font-semibold uppercase tracking-wide"
          data-testid="badge-coming-soon"
        >
          {t("comingSoon")}
        </Badge>
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground" data-testid="text-advisors-blurb">
          {t("advisorsBlurb")}
        </p>
      </div>
    </Layout>
  );
}
