import { createFileRoute } from "@tanstack/react-router";
import { Bot } from "lucide-react";
import { ModulePage } from "@/components/ModulePage";

export const Route = createFileRoute("/_authenticated/agente")({
  head: () => ({
    meta: [
      { title: "Agente Controller — MINASCOLOR CONTROL" },
      { name: "description", content: "Chat com o Gerente Virtual conectado aos dados reais via ferramentas estruturadas." },
      { property: "og:title", content: "Agente Controller — MINASCOLOR CONTROL" },
      { property: "og:description", content: "Chat com o Gerente Virtual conectado aos dados reais via ferramentas estruturadas." },
    ],
  }),
  component: AgentePage,
});

function AgentePage() {
  return (
    <ModulePage
      title="Agente Controller"
      description="Chat com o Gerente Virtual conectado aos dados reais via ferramentas estruturadas."
      icon={Bot}
      emptyTitle="Agente disponível na Fase 3"
      emptyDescription="O agente só responde números vindos de consultas ao banco. Como ainda não há dados importados, ele responderia DADOS INSUFICIENTES em qualquer pergunta numérica."
      hints={["Ferramentas de consulta (vendas, estoque, caixa, margens, metas) serão ligadas na Fase 3", "Memória de conversas, decisões e ações fica registrada com auditoria", "Fechamento do Dia, Relatório Semanal e Mensal saem do mesmo motor"]}
    />
  );
}
