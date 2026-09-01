import { createFileRoute } from "@tanstack/react-router";
import { FileText } from "lucide-react";
import { ModulePage } from "@/components/ModulePage";

export const Route = createFileRoute("/_authenticated/orcamentos")({
  head: () => ({
    meta: [
      { title: "Orçamentos — MINASCOLOR CONTROL" },
      { name: "description", content: "Pipeline de orçamentos e taxa de conversão em venda." },
      { property: "og:title", content: "Orçamentos — MINASCOLOR CONTROL" },
      { property: "og:description", content: "Pipeline de orçamentos e taxa de conversão em venda." },
    ],
  }),
  component: OrcamentosPage,
});

function OrcamentosPage() {
  return (
    <ModulePage
      title="Orçamentos"
      description="Pipeline de orçamentos e taxa de conversão em venda."
      icon={FileText}
      emptyTitle="Nenhum orçamento na base"
      emptyDescription="Status acompanhados: aberto, em negociação, aprovado, convertido, perdido e expirado."
      hints={["Importe orçamentos com cliente, vendedor, validade e itens"]}
    />
  );
}
