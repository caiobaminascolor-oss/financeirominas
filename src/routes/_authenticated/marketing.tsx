import { createFileRoute } from "@tanstack/react-router";
import { Megaphone } from "lucide-react";
import { ModulePage } from "@/components/ModulePage";

export const Route = createFileRoute("/_authenticated/marketing")({
  head: () => ({
    meta: [
      { title: "Marketing — MINASCOLOR CONTROL" },
      { name: "description", content: "Funil de leads → orçamentos → vendas → margem → lucro, com CAC, ROI e ROAS." },
      { property: "og:title", content: "Marketing — MINASCOLOR CONTROL" },
      { property: "og:description", content: "Funil de leads → orçamentos → vendas → margem → lucro, com CAC, ROI e ROAS." },
    ],
  }),
  component: MarketingPage,
});

function MarketingPage() {
  return (
    <ModulePage
      title="Marketing"
      description="Funil de leads → orçamentos → vendas → margem → lucro, com CAC, ROI e ROAS."
      icon={Megaphone}
      emptyTitle="Sem dados de marketing"
      emptyDescription="Investimento por canal e origem dos leads são necessários para calcular CAC, ROI e ROAS."
    />
  );
}
