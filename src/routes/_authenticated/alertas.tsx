import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/layout/PageHeader";
import { InsufficientData, TableSkeleton } from "@/components/InsufficientData";
import { MetricStrip } from "@/components/MetricStrip";
import { DataTable } from "@/components/DataTable";
import { ClassBadge, type Tone } from "@/components/ClassBadge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { classifyStock, useProductAnalytics, useSales } from "@/lib/analytics";
import { buildCashProjection, useAlerts, useDiscounts, useExpenses, usePayables, useQuotes, useReceivables, useTargets } from "@/lib/data";
import { brl, daysBetween, num } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/alertas")({
  head: () => ({ meta: [
    { title: "Alertas — MINASCOLOR CONTROL" },
    { name: "description", content: "Central de alertas gerenciais P1 a P4 com causa, impacto, ação, responsável e prazo." },
    { property: "og:title", content: "Alertas — MINASCOLOR CONTROL" },
    { property: "og:description", content: "Ruptura, capital parado, margem, descontos, caixa, inadimplência, clientes, orçamentos e metas." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: AlertasPage,
});

type Priority = "P1" | "P2" | "P3" | "P4";
type ManagerAlert = {
  id: string;
  priority: Priority;
  category: string;
  title: string;
  problem: string;
  cause: string;
  impact: string;
  solution: string;
  owner: string;
  deadline: string;
  source: "Calculado" | "Registrado";
};

const PRIORITY: Record<Priority, { label: string; tone: Tone }> = {
  P1: { label: "P1 URGENTE", tone: "vermelho" },
  P2: { label: "P2 IMPORTANTE", tone: "laranja" },
  P3: { label: "P3 MELHORIA", tone: "amarelo" },
  P4: { label: "P4 OPORTUNIDADE", tone: "verde" },
};

function AlertasPage() {
  const inventory = useProductAnalytics();
  const sales30 = useSales(30);
  const sales90 = useSales(90);
  const discounts = useDiscounts();
  const ap = usePayables();
  const ar = useReceivables();
  const expenses = useExpenses();
  const quotes = useQuotes();
  const targets = useTargets();
  const stored = useAlerts();
  const [filter, setFilter] = useState("todos");

  const loading = inventory.loading || sales30.isLoading || sales90.isLoading || discounts.isLoading || ap.isLoading || ar.isLoading || expenses.isLoading || quotes.isLoading || targets.isLoading || stored.isLoading;

  const alerts = useMemo<ManagerAlert[]>(() => {
    const out: ManagerAlert[] = [];
    const add = (a: ManagerAlert) => out.push(a);
    const todayIso = new Date().toISOString().slice(0, 10);

    const stock = inventory.rows.map((r) => ({ ...r, cls: classifyStock(r) }));
    const rupture = stock.filter((r) => r.cls.label === "Risco de ruptura");
    if (rupture.length) add({ id: "ruptura", priority: "P1", category: "Estoque", title: `${rupture.length} SKU(s) com risco de ruptura`, problem: "Produtos com demanda recente estão sem estoque ou com cobertura insuficiente.", cause: rupture.slice(0,3).map((r) => r.name).join(", "), impact: "Perda de vendas e clientes por indisponibilidade.", solution: "Validar pedidos em aberto e priorizar reposição pelo prazo do fornecedor.", owner: "Estoque / Compras", deadline: "Hoje", source: "Calculado" });

    const stopped = stock.filter((r) => r.cls.label === "Dinheiro parado");
    const stoppedValue = stopped.reduce((s,r) => s + r.stockValue, 0);
    if (stopped.length) add({ id: "parado", priority: "P2", category: "Estoque", title: `${brl(stoppedValue)} em capital parado`, problem: `${stopped.length} SKU(s) sem giro relevante.`, cause: "Estoque com venda nula em 12 meses ou sem venda há mais de 180 dias.", impact: "Caixa imobilizado e risco de perda/obsolescência.", solution: "Suspender novas compras e criar plano de giro sem vender abaixo do custo.", owner: "Gerência / Comercial", deadline: "7 dias", source: "Calculado" });

    const belowCost = (discounts.data ?? []).filter((d) => d.below_cost);
    if (belowCost.length) add({ id: "below-cost", priority: "P1", category: "Margem", title: `${belowCost.length} venda(s) abaixo do custo`, problem: "Há descontos que produziram venda abaixo do custo.", cause: "Preço líquido inferior ao custo registrado.", impact: `Desconto envolvido: ${brl(belowCost.reduce((s,d) => s + d.discount_amount, 0))}; destruição direta de margem.`, solution: "Bloquear recorrência, revisar autorização e custo dos produtos afetados.", owner: "Gerência", deadline: "Hoje", source: "Calculado" });

    const excessiveDiscount = (discounts.data ?? []).filter((d) => d.discount_pct >= 15 && !d.below_cost);
    if (excessiveDiscount.length) add({ id: "discount", priority: "P2", category: "Desconto", title: `${excessiveDiscount.length} desconto(s) de 15% ou mais`, problem: "Descontos elevados pressionam a margem mesmo sem vender abaixo do custo.", cause: "Concessões comerciais acima do limiar de 15%.", impact: `Receita cedida: ${brl(excessiveDiscount.reduce((s,d) => s + d.discount_amount, 0))}.`, solution: "Revisar justificativas e estabelecer alçada de aprovação.", owner: "Gerência comercial", deadline: "3 dias", source: "Calculado" });

    const projection = buildCashProjection([], ap.data ?? [], ar.data ?? []);
    const h30 = projection.horizons.find((h) => h.days === 30);
    if ((ap.data ?? []).length && (ar.data ?? []).length && (h30?.base ?? 0) < 0) add({ id: "cash", priority: "P1", category: "Caixa", title: `Déficit projetado de ${brl(Math.abs(h30?.base ?? 0))} em 30 dias`, problem: "Compromissos vencendo superam recebimentos previstos no período (sem saldo inicial disponível nesta leitura).", cause: "Descasamento entre vencimentos a pagar e a receber.", impact: "Risco de atraso, juros e interrupção de compras.", solution: "Preservar caixa, cobrar vencidos e negociar prazos antes de novas compras.", owner: "Financeiro", deadline: "Hoje", source: "Calculado" });

    const overdueAr = (ar.data ?? []).filter((r) => !r.received_at && r.due_date < todayIso);
    if (overdueAr.length) add({ id: "default", priority: "P1", category: "Inadimplência", title: `${brl(overdueAr.reduce((s,r) => s + r.amount, 0))} vencidos a receber`, problem: `${overdueAr.length} título(s) vencido(s) sem recebimento.`, cause: "Contas passaram do vencimento sem baixa.", impact: "Pressão direta no caixa e aumento do risco de perda.", solution: "Priorizar cobrança por valor e atraso; suspender novo crédito conforme política.", owner: "Financeiro / Cobrança", deadline: "Hoje", source: "Calculado" });

    const recentExpenses = (expenses.data ?? []).filter((e) => daysBetween(e.expense_date) <= 30).reduce((s,e) => s + e.amount, 0);
    const priorExpenses = (expenses.data ?? []).filter((e) => { const d = daysBetween(e.expense_date); return d > 30 && d <= 60; }).reduce((s,e) => s + e.amount, 0);
    if (priorExpenses > 0 && recentExpenses > priorExpenses * 1.15) add({ id: "expenses", priority: "P2", category: "Despesas", title: `Despesas subiram ${num(((recentExpenses / priorExpenses) - 1) * 100, 1)}%`, problem: "As despesas dos últimos 30 dias cresceram mais de 15% contra os 30 dias anteriores.", cause: "Aumento agregado nas despesas lançadas; abrir por categoria para confirmar origem.", impact: "Redução do lucro operacional e pressão no caixa.", solution: "Revisar categorias que mais cresceram e cortar itens sem retorno.", owner: "Financeiro / Gerência", deadline: "5 dias", source: "Calculado" });

    const s30 = (sales30.data ?? []).filter((s) => s.status !== "cancelada");
    const s90 = (sales90.data ?? []).filter((s) => s.status !== "cancelada");
    const margin30 = s30.reduce((s,r) => s + r.total, 0) > 0 ? s30.reduce((s,r) => s + r.gross_profit, 0) / s30.reduce((s,r) => s + r.total, 0) : null;
    const older60 = s90.filter((s) => daysBetween(s.sold_at) > 30);
    const marginPrior = older60.reduce((s,r) => s + r.total, 0) > 0 ? older60.reduce((s,r) => s + r.gross_profit, 0) / older60.reduce((s,r) => s + r.total, 0) : null;
    if (margin30 !== null && marginPrior !== null && margin30 < marginPrior - 0.02) add({ id: "margin", priority: "P2", category: "Margem", title: `Margem caiu ${num((marginPrior - margin30) * 100, 1)} p.p.`, problem: "Margem bruta dos últimos 30 dias caiu mais de 2 pontos percentuais.", cause: "Mudança no mix, custo ou descontos; exige abertura por produto e vendedor.", impact: "Mais faturamento pode gerar menos lucro bruto.", solution: "Revisar mix, preços, custos e descontos que mais contribuíram para a queda.", owner: "Gerência comercial", deadline: "3 dias", source: "Calculado" });

    const staleQuotes = (quotes.data ?? []).filter((q) => !q.converted_sale_id && !["perdido", "convertido"].includes(q.status) && daysBetween(q.issued_at) > 15);
    if (staleQuotes.length) add({ id: "quotes", priority: "P3", category: "Orçamentos", title: `${staleQuotes.length} orçamento(s) parado(s)`, problem: `Há ${brl(staleQuotes.reduce((s,q) => s + q.total, 0))} sem desfecho há mais de 15 dias.`, cause: "Follow-up ausente ou status não atualizado.", impact: "Receita potencial esfriando no funil.", solution: "Contatar clientes, registrar objeção e atualizar o status.", owner: "Equipe comercial", deadline: "2 dias", source: "Calculado" });

    const now = new Date();
    const riskyTargets = (targets.data ?? []).filter((t) => new Date(t.period_start) <= now && new Date(t.period_end) >= now).filter((t) => {
      const elapsed = Math.max(0, now.getTime() - new Date(t.period_start).getTime());
      const total = Math.max(1, new Date(t.period_end).getTime() - new Date(t.period_start).getTime());
      const expectedPct = elapsed / total;
      const realized = s90.filter((s) => (!t.salesperson_id || s.salesperson_id === t.salesperson_id) && s.sold_at.slice(0,10) >= t.period_start && s.sold_at.slice(0,10) <= t.period_end).reduce((sum,s) => sum + (t.metric === "lucro" ? s.gross_profit : t.metric === "vendas" ? 1 : s.total), 0);
      return t.target_value > 0 && realized / t.target_value + 0.1 < expectedPct;
    });
    if (riskyTargets.length) add({ id: "targets", priority: "P2", category: "Metas", title: `${riskyTargets.length} meta(s) em risco`, problem: "O realizado está mais de 10 pontos percentuais abaixo do avanço do período.", cause: "Ritmo atual insuficiente para o tempo restante.", impact: "Alta probabilidade de encerramento abaixo da meta.", solution: "Recalcular ritmo diário e atacar clientes/produtos com melhor margem e conversão.", owner: "Gerência comercial", deadline: "Hoje", source: "Calculado" });

    for (const a of stored.data ?? []) if (a.status !== "resolvido" && !a.resolved_at) add({ id: `stored-${a.id}`, priority: a.priority, category: a.category ?? "Geral", title: a.title, problem: a.message ?? "Alerta registrado sem detalhamento.", cause: "Registrado na central de alertas.", impact: "Verificar contexto do registro.", solution: "Analisar e atribuir responsável antes de resolver.", owner: "Gerência", deadline: a.priority === "P1" ? "Hoje" : "7 dias", source: "Registrado" });

    return out.sort((a,b) => a.priority.localeCompare(b.priority));
  }, [inventory.rows, sales30.data, sales90.data, discounts.data, ap.data, ar.data, expenses.data, quotes.data, targets.data, stored.data]);

  const filtered = filter === "todos" ? alerts : alerts.filter((a) => a.priority === filter);
  if (loading) return <Shell><TableSkeleton /></Shell>;
  const hasAnySource = inventory.hasProducts || (sales90.data ?? []).length > 0 || (ap.data ?? []).length > 0 || (ar.data ?? []).length > 0 || (quotes.data ?? []).length > 0 || (targets.data ?? []).length > 0;
  if (!hasAnySource) return <Shell><InsufficientData what="Não há dados operacionais suficientes para calcular alertas. Nenhum alerta será inventado." hints={["Importe estoque, vendas, descontos, contas, despesas, clientes, orçamentos e metas", "Alertas surgem somente quando uma regra encontra evidência nos dados"]} /></Shell>;

  return <Shell>
    <MetricStrip metrics={(["P1","P2","P3","P4"] as Priority[]).map((p) => ({ label: PRIORITY[p].label, value: num(alerts.filter((a) => a.priority === p).length), tone: p === "P1" ? "danger" as const : p === "P2" ? "warning" as const : undefined }))} />
    <div className="mb-4"><Select value={filter} onValueChange={setFilter}><SelectTrigger className="w-56"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Todas as prioridades</SelectItem><SelectItem value="P1">P1 Urgente</SelectItem><SelectItem value="P2">P2 Importante</SelectItem><SelectItem value="P3">P3 Melhoria</SelectItem><SelectItem value="P4">P4 Oportunidade</SelectItem></SelectContent></Select></div>
    {alerts.length === 0 ? <div className="rounded-xl border border-border bg-card p-8 text-center"><p className="font-semibold">Nenhum desvio detectado</p><p className="mt-1 text-sm text-muted-foreground">As regras não encontraram problemas nos dados atualmente disponíveis.</p></div> : <DataTable rows={filtered} getKey={(r) => r.id} columns={[
      { key: "p", header: "Prioridade", cell: (r) => <ClassBadge tone={PRIORITY[r.priority].tone} label={PRIORITY[r.priority].label} /> },
      { key: "t", header: "O que está acontecendo", cell: (r) => <div className="min-w-64"><p className="font-medium">{r.title}</p><p className="text-xs text-muted-foreground">{r.problem}</p></div> },
      { key: "c", header: "Por quê", cell: (r) => <span className="text-xs text-muted-foreground">{r.cause}</span> },
      { key: "i", header: "Impacto", cell: (r) => <span className="text-xs text-muted-foreground">{r.impact}</span> },
      { key: "s", header: "O que fazer", cell: (r) => <span className="text-xs text-muted-foreground">{r.solution}</span> },
      { key: "r", header: "Responsável / prazo", cell: (r) => <div className="text-xs"><p>{r.owner}</p><p className="text-muted-foreground">{r.deadline} · {r.source}</p></div> },
    ]} />}
  </Shell>;
}

function Shell({ children }: { children: React.ReactNode }) { return <div><PageHeader title="Alertas" description="Problemas e oportunidades classificados de P1 a P4, sempre com causa, impacto, ação, responsável e prazo." />{children}</div>; }
