import { createFileRoute } from "@tanstack/react-router";
import { Building2 } from "lucide-react";
import { ModulePage } from "@/components/ModulePage";

export const Route = createFileRoute("/_authenticated/fornecedores")({
  head: () => ({
    meta: [
      { title: "Fornecedores — MINASCOLOR CONTROL" },
      { name: "description", content: "Fornecedores, prazos de entrega, condições e desempenho de custo." },
      { property: "og:title", content: "Fornecedores — MINASCOLOR CONTROL" },
      { property: "og:description", content: "Fornecedores, prazos de entrega, condições e desempenho de custo." },
    ],
  }),
  component: FornecedoresPage,
});

function FornecedoresPage() {
  return (
    <ModulePage
      title="Fornecedores"
      description="Fornecedores, prazos de entrega, condições e desempenho de custo."
      icon={Building2}
      emptyTitle="Nenhum fornecedor cadastrado"
      emptyDescription="Cadastre ou importe fornecedores para cruzar prazo de entrega com sugestão de compra."
    />
  );
}
