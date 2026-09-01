import { createFileRoute } from "@tanstack/react-router";
import { PackageX } from "lucide-react";
import { ModulePage } from "@/components/ModulePage";

export const Route = createFileRoute("/_authenticated/produtos-parados")({
  head: () => ({
    meta: [
      { title: "Produtos Parados — MINASCOLOR CONTROL" },
      { name: "description", content: "Capital parado = estoque × custo, com ranking e filtros de 30 a 365 dias." },
      { property: "og:title", content: "Produtos Parados — MINASCOLOR CONTROL" },
      { property: "og:description", content: "Capital parado = estoque × custo, com ranking e filtros de 30 a 365 dias." },
    ],
  }),
  component: ProdutosParadosPage,
});

function ProdutosParadosPage() {
  return (
    <ModulePage
      title="Produtos Parados"
      description="Capital parado = estoque × custo, com ranking e filtros de 30 a 365 dias."
      icon={PackageX}
      emptyTitle="Sem dados para apurar capital parado"
      emptyDescription="É necessário estoque atual e data da última venda de cada produto."
      hints={["Importe estoque e vendas históricas por produto"]}
    />
  );
}
