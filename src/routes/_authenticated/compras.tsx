import { createFileRoute } from "@tanstack/react-router";
import { Truck } from "lucide-react";
import { ModulePage } from "@/components/ModulePage";

export const Route = createFileRoute("/_authenticated/compras")({
  head: () => ({
    meta: [
      { title: "Compras — MINASCOLOR CONTROL" },
      { name: "description", content: "Sugestão de compra cruzando estoque, giro, demanda, prazo, margem e caixa." },
      { property: "og:title", content: "Compras — MINASCOLOR CONTROL" },
      { property: "og:description", content: "Sugestão de compra cruzando estoque, giro, demanda, prazo, margem e caixa." },
    ],
  }),
  component: ComprasPage,
});

function ComprasPage() {
  return (
    <ModulePage
      title="Compras"
      description="Sugestão de compra cruzando estoque, giro, demanda, prazo, margem e caixa."
      icon={Truck}
      emptyTitle="Nenhuma compra registrada"
      emptyDescription="As classificações comprar agora / em breve / sob demanda / não comprar sempre vêm com justificativa em dados."
      hints={["Importe compras, prazos de fornecedor e posição de estoque"]}
    />
  );
}
