import { createFileRoute } from "@tanstack/react-router";
import { BarChart3 } from "lucide-react";
import { ModulePage } from "@/components/ModulePage";

export const Route = createFileRoute("/_authenticated/relatorios")({
  head: () => ({
    meta: [
      { title: "Relatórios — MINASCOLOR CONTROL" },
      { name: "description", content: "Fechamento do dia, relatório semanal e mensal e análises salvas." },
      { property: "og:title", content: "Relatórios — MINASCOLOR CONTROL" },
      { property: "og:description", content: "Fechamento do dia, relatório semanal e mensal e análises salvas." },
    ],
  }),
  component: RelatoriosPage,
});

function RelatoriosPage() {
  return (
    <ModulePage
      title="Relatórios"
      description="Fechamento do dia, relatório semanal e mensal e análises salvas."
      icon={BarChart3}
      emptyTitle="Nenhum relatório gerado"
      emptyDescription="Os relatórios estruturados são produzidos pelo Agente Controller a partir de dados reais do período."
    />
  );
}
