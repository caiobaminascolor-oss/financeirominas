import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Bot, CheckCircle2, Lightbulb, ShieldAlert, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { KpiCard, type Kpi } from "@/components/KpiCard";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Visão Geral — MINASCOLOR CONTROL" },
      {
        name: "description",
        content:
          "Painel executivo com faturamento, margem, CMV, caixa, estoque e metas, com leitura automática do Gerente Virtual.",
      },
      { property: "og:title", content: "Visão Geral — MINASCOLOR CONTROL" },
      {
        property: "og:description",
        content: "Indicadores de gestão da loja com status BOM, ATENÇÃO e PROBLEMA.",
      },
    ],
  }),
  component: DashboardPage,
});

const KPI_LABELS = [
  "Faturamento",
  "Meta do período",
  "% da meta",
  "Margem bruta",
  "Lucro bruto",
  "Nº de vendas",
  "Ticket médio",
  "CMV",
  "Despesas",
  "Contas a pagar",
  "Contas a receber",
  "Itens em estoque",
  "Capital em estoque",
  "Giro de estoque",
  "Orçamentos em aberto",
];

function useHasData() {
  return useQuery({
    queryKey: ["dashboard", "has-data"],
    queryFn: async () => {
      const [sales, products, inventory] = await Promise.all([
        supabase.from("sales").select("id", { count: "exact", head: true }),
        supabase.from("products").select("id", { count: "exact", head: true }),
        supabase.from("inventory").select("id", { count: "exact", head: true }),
      ]);
      return {
        sales: sales.count ?? 0,
        products: products.count ?? 0,
        inventory: inventory.count ?? 0,
      };
    },
  });
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

function VirtualManagerCard({ empty }: { empty: boolean }) {
  const { profile, user } = useAuth();
  const name = (profile?.full_name || user?.email || "").split(" ")[0];

  const blocks = [
    { icon: ShieldAlert, label: "Problemas", tone: "text-danger" },
    { icon: AlertTriangle, label: "Atenção", tone: "text-warning" },
    { icon: CheckCircle2, label: "Resultados", tone: "text-success" },
    { icon: Lightbulb, label: "Oportunidades", tone: "text-accent" },
  ];

  return (
    <section className="mb-6 overflow-hidden rounded-xl border border-border bg-sidebar text-sidebar-foreground">
      <div className="flex flex-wrap items-start justify-between gap-4 p-5 sm:p-6">
        <div className="flex gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
            <Bot className="size-5" />
          </span>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-sidebar-foreground/55">
              Gerente Virtual · Controller
            </p>
            <h2 className="font-display text-lg font-bold text-sidebar-accent-foreground">
              {greeting()}
              {name ? `, ${name}` : ""}.
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-sidebar-foreground/75">
              {empty
                ? "DADOS INSUFICIENTES. Ainda não há vendas, produtos ou estoque na base. Sem dados reais eu não emito conclusão, projeção ou estimativa — importe os relatórios da loja para eu começar a análise."
                : "Resumo automático do período em preparação. Nenhum número exibido aqui é estimado: tudo vem das consultas estruturadas ao banco."}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="secondary">
            <Link to="/importacoes">
              <Upload className="mr-2 size-4" /> Importar dados
            </Link>
          </Button>
          <Button asChild>
            <Link to="/agente">Abrir agente</Link>
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-px border-t border-sidebar-border bg-sidebar-border lg:grid-cols-4">
        {blocks.map((b) => (
          <div key={b.label} className="bg-sidebar p-4">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-sidebar-foreground/60">
              <b.icon className={`size-4 ${b.tone}`} /> {b.label}
            </p>
            <p className="mt-2 text-sm text-sidebar-foreground/70">
              {empty ? "Sem dados" : "—"}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function DashboardPage() {
  const { data, isLoading } = useHasData();
  const { canSeeFinance } = useAuth();
  const empty = !data || (data.sales === 0 && data.products === 0 && data.inventory === 0);

  const financeLabels = ["Despesas", "Contas a pagar", "Contas a receber", "CMV", "Lucro bruto"];
  const kpis: Kpi[] = KPI_LABELS.filter(
    (label) => canSeeFinance || !financeLabels.includes(label),
  ).map((label) => ({
    label,
    value: "—",
    status: "sem-dados" as const,
  }));

  return (
    <div>
      <PageHeader
        title="Visão Geral"
        description="Indicadores do período com comparação de meta e período anterior. Faturamento, lucro, caixa, margem, markup, CMV, recebimento e estoque são tratados como grandezas distintas."
      />

      <VirtualManagerCard empty={empty} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {kpis.map((kpi) => (
          <KpiCard key={kpi.label} kpi={kpi} />
        ))}
      </div>

      {!isLoading && empty && (
        <div className="mt-6">
          <EmptyState
            title="Nenhum dado real na base ainda"
            description="Este painel não gera dados fictícios. Para popular os indicadores, importe os relatórios da loja em Importações."
            hints={[
              "Cadastro de produtos com código, custo, preço e categoria",
              "Vendas com itens, quantidade, preço e custo unitário",
              "Posição de estoque atual (quantidade e custo médio)",
              "Contas a pagar e a receber com vencimentos",
              "Metas por período, vendedor e categoria",
            ]}
          />
        </div>
      )}
    </div>
  );
}
