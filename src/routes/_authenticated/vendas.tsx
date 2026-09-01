import { createFileRoute } from "@tanstack/react-router";
import { ShoppingCart } from "lucide-react";
import { ModulePage } from "@/components/ModulePage";

export const Route = createFileRoute("/_authenticated/vendas")({
  head: () => ({
    meta: [
      { title: "Vendas — MINASCOLOR CONTROL" },
      { name: "description", content: "Vendas do período, itens, margem por venda e ranking de vendedores multi-critério." },
      { property: "og:title", content: "Vendas — MINASCOLOR CONTROL" },
      { property: "og:description", content: "Vendas do período, itens, margem por venda e ranking de vendedores multi-critério." },
    ],
  }),
  component: VendasPage,
});

function VendasPage() {
  return (
    <ModulePage
      title="Vendas"
      description="Vendas do período, itens, margem por venda e ranking de vendedores multi-critério."
      icon={ShoppingCart}
      emptyTitle="Nenhuma venda registrada"
      emptyDescription="O ranking de vendedores usa faturamento, quantidade, ticket médio, margem, lucro, desconto médio e % da meta — nunca apenas faturamento."
      hints={["Importe o relatório de vendas com itens, quantidade, preço e custo unitário"]}
    />
  );
}
