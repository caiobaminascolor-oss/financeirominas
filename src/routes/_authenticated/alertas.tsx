import { createFileRoute } from "@tanstack/react-router";
import { Bell } from "lucide-react";
import { ModulePage } from "@/components/ModulePage";

export const Route = createFileRoute("/_authenticated/alertas")({
  head: () => ({
    meta: [
      { title: "Alertas — MINASCOLOR CONTROL" },
      { name: "description", content: "Central de alertas classificada de P1 (urgente) a P4 (oportunidade)." },
      { property: "og:title", content: "Alertas — MINASCOLOR CONTROL" },
      { property: "og:description", content: "Central de alertas classificada de P1 (urgente) a P4 (oportunidade)." },
    ],
  }),
  component: AlertasPage,
});

function AlertasPage() {
  return (
    <ModulePage
      title="Alertas"
      description="Central de alertas classificada de P1 (urgente) a P4 (oportunidade)."
      icon={Bell}
      emptyTitle="Nenhum alerta gerado"
      emptyDescription="Os alertas são gerados a partir dos dados: ruptura, dinheiro parado, venda abaixo do custo, desconto excessivo, contas vencidas e queda de margem."
    />
  );
}
