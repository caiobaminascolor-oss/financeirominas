import { createFileRoute } from "@tanstack/react-router";
import { Boxes } from "lucide-react";
import { ModulePage } from "@/components/ModulePage";

export const Route = createFileRoute("/_authenticated/estoque")({
  head: () => ({
    meta: [
      { title: "Estoque — MINASCOLOR CONTROL" },
      { name: "description", content: "Giro, cobertura, capital investido e risco de ruptura por produto." },
      { property: "og:title", content: "Estoque — MINASCOLOR CONTROL" },
      { property: "og:description", content: "Giro, cobertura, capital investido e risco de ruptura por produto." },
    ],
  }),
  component: EstoquePage,
});

function EstoquePage() {
  return (
    <ModulePage
      title="Estoque"
      description="Giro, cobertura, capital investido e risco de ruptura por produto."
      icon={Boxes}
      emptyTitle="Nenhuma posição de estoque"
      emptyDescription="As classificações (alto giro, atenção, excessivo, dinheiro parado, risco de ruptura) exigem estoque atual e vendas históricas."
      hints={["Importe a posição de estoque com quantidade e custo médio", "Importe pelo menos 12 meses de vendas para calcular giro"]}
    />
  );
}
