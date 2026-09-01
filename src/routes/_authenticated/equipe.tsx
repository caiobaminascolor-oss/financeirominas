import { createFileRoute } from "@tanstack/react-router";
import { UserCog } from "lucide-react";
import { ModulePage } from "@/components/ModulePage";

export const Route = createFileRoute("/_authenticated/equipe")({
  head: () => ({
    meta: [
      { title: "Equipe — MINASCOLOR CONTROL" },
      { name: "description", content: "Performance da equipe apurada somente por dados, sem julgamento pessoal." },
      { property: "og:title", content: "Equipe — MINASCOLOR CONTROL" },
      { property: "og:description", content: "Performance da equipe apurada somente por dados, sem julgamento pessoal." },
    ],
  }),
  component: EquipePage,
});

function EquipePage() {
  return (
    <ModulePage
      title="Equipe"
      description="Performance da equipe apurada somente por dados, sem julgamento pessoal."
      icon={UserCog}
      emptyTitle="Nenhum vendedor com histórico"
      emptyDescription="A avaliação usa faturamento, margem, ticket médio, desconto concedido, conversão de orçamentos e atingimento de meta."
    />
  );
}
