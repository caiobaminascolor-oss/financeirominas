import { createFileRoute } from "@tanstack/react-router";
import { Wallet } from "lucide-react";
import { ModulePage } from "@/components/ModulePage";

export const Route = createFileRoute("/_authenticated/financeiro")({
  head: () => ({
    meta: [
      { title: "Financeiro — MINASCOLOR CONTROL" },
      { name: "description", content: "Caixa, contas a pagar e a receber e fluxo de caixa projetado." },
      { property: "og:title", content: "Financeiro — MINASCOLOR CONTROL" },
      { property: "og:description", content: "Caixa, contas a pagar e a receber e fluxo de caixa projetado." },
    ],
  }),
  component: FinanceiroPage,
});

function FinanceiroPage() {
  return (
    <ModulePage
      title="Financeiro"
      description="Caixa, contas a pagar e a receber e fluxo de caixa projetado."
      icon={Wallet}
      emptyTitle="Sem lançamentos financeiros"
      emptyDescription="As projeções de 7/15/30/60/90 dias e os cenários pessimista, base e otimista só são exibidos com premissas visíveis e dados reais."
      hints={["Importe contas a pagar e a receber com vencimentos", "Importe o extrato de caixa e as despesas do período"]}
    />
  );
}
