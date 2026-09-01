import { createFileRoute } from "@tanstack/react-router";
import { Target } from "lucide-react";
import { ModulePage } from "@/components/ModulePage";

export const Route = createFileRoute("/_authenticated/metas")({
  head: () => ({
    meta: [
      { title: "Metas — MINASCOLOR CONTROL" },
      { name: "description", content: "Metas mensal, semanal, diária, por vendedor e por categoria, com ritmo necessário." },
      { property: "og:title", content: "Metas — MINASCOLOR CONTROL" },
      { property: "og:description", content: "Metas mensal, semanal, diária, por vendedor e por categoria, com ritmo necessário." },
    ],
  }),
  component: MetasPage,
});

function MetasPage() {
  return (
    <ModulePage
      title="Metas"
      description="Metas mensal, semanal, diária, por vendedor e por categoria, com ritmo necessário."
      icon={Target}
      emptyTitle="Nenhuma meta definida"
      emptyDescription="Sem meta cadastrada não há cálculo de ritmo necessário nem projeção de atingimento."
      hints={["Defina metas por período e escopo, ou importe a planilha de metas"]}
    />
  );
}
