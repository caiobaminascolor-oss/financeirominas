import { createFileRoute } from "@tanstack/react-router";
import { Users } from "lucide-react";
import { ModulePage } from "@/components/ModulePage";

export const Route = createFileRoute("/_authenticated/clientes")({
  head: () => ({
    meta: [
      { title: "Clientes — MINASCOLOR CONTROL" },
      { name: "description", content: "Base de clientes com classificação e oportunidades de recompra." },
      { property: "og:title", content: "Clientes — MINASCOLOR CONTROL" },
      { property: "og:description", content: "Base de clientes com classificação e oportunidades de recompra." },
    ],
  }),
  component: ClientesPage,
});

function ClientesPage() {
  return (
    <ModulePage
      title="Clientes"
      description="Base de clientes com classificação e oportunidades de recompra."
      icon={Users}
      emptyTitle="Nenhum cliente cadastrado"
      emptyDescription="A classificação (novo, recorrente, VIP, inativo, em risco) é calculada a partir do histórico real de compras."
      hints={["Importe a base de clientes e o histórico de vendas vinculado"]}
    />
  );
}
