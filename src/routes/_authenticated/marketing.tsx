import { useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/layout/PageHeader";
import { InsufficientData, TableSkeleton } from "@/components/InsufficientData";
import { MetricStrip } from "@/components/MetricStrip";
import { DataTable } from "@/components/DataTable";
import { useSales } from "@/lib/analytics";
import { useExpenses, useQuotes } from "@/lib/data";
import { brl, num, pct } from "@/lib/format";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/marketing")({
  head: () => ({ meta: [
    { title: "Marketing — MINASCOLOR CONTROL" },
    { name: "description", content: "Funil de leads, orçamentos e vendas com CAC, custo por lead, receita, lucro, ROI e ROAS." },
    { property: "og:title", content: "Marketing — MINASCOLOR CONTROL" },
    { property: "og:description", content: "Marketing avaliado por conversão, margem e lucro — nunca apenas por seguidores." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: MarketingPage,
});

function MarketingPage() {
  const { canSeeFinance } = useAuth();
  const sales = useSales(365);
  const quotes = useQuotes();
  const expenses = useExpenses();
  const loading = sales.isLoading || quotes.isLoading || expenses.isLoading;

  const data = useMemo(() => {
    const marketingExpenses = (expenses.data ?? []).filter((e) => /marketing|anúncio|anuncio|tráfego|trafego|ads|publicidade/i.test(`${e.category ?? ""} ${e.description ?? ""}`));
    const investment = marketingExpenses.reduce((s, e) => s + e.amount, 0);
    const quoteRows = quotes.data ?? [];
    const converted = quoteRows.filter((q) => q.converted_sale_id || q.status === "convertido");
    const saleRows = (sales.data ?? []).filter((s) => s.status !== "cancelada");
    const revenue = saleRows.reduce((s, r) => s + r.total, 0);
    const profit = saleRows.reduce((s, r) => s + r.gross_profit, 0);
    const uniqueCustomers = new Set(saleRows.map((s) => s.customer_id).filter(Boolean)).size;
    return { investment, marketingExpenses, quoteRows, converted, saleRows, revenue, profit, uniqueCustomers };
  }, [expenses.data, quotes.data, sales.data]);

  if (!canSeeFinance) return <Shell><div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">Seu perfil não tem permissão para ver investimento, margem e lucro de marketing.</div></Shell>;
  if (loading) return <Shell><TableSkeleton /></Shell>;

  const hasInvestment = data.marketingExpenses.length > 0;
  const hasLeads = false; // O schema atual não possui entidade/origem de lead.
  const conversion = data.quoteRows.length > 0 ? (data.converted.length / data.quoteRows.length) * 100 : null;
  const roi = hasInvestment ? ((data.profit - data.investment) / data.investment) * 100 : null;
  const roas = hasInvestment ? data.revenue / data.investment : null;
  const cac = hasInvestment && data.uniqueCustomers > 0 ? data.investment / data.uniqueCustomers : null;

  if (!hasInvestment && data.quoteRows.length === 0 && data.saleRows.length === 0) return <Shell><InsufficientData what="Não há investimento de marketing, leads, orçamentos nem vendas suficientes para montar o funil e calcular retorno." hints={["Importe despesas de marketing por canal", "Importe leads com origem/canal quando essa informação estiver disponível", "Vincule orçamentos e vendas para medir conversão, receita, margem e lucro"]} /></Shell>;

  return <Shell>
    <div className="mb-5 rounded-xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
      <strong className="text-foreground">DADOS INSUFICIENTES PARA O FUNIL COMPLETO:</strong> a base atual não registra leads nem origem/canal. CAC e custo por lead só aparecem quando há denominador real; seguidores não entram na avaliação.
    </div>
    <MetricStrip metrics={[
      { label: "Leads", value: hasLeads ? "0" : "DADOS INSUFICIENTES", hint: "Falta cadastro de leads e origem" },
      { label: "Orçamentos", value: num(data.quoteRows.length) },
      { label: "Conversão orçamento → venda", value: pct(conversion) },
      { label: "Vendas", value: num(data.saleRows.length) },
      { label: "Investimento em marketing", value: hasInvestment ? brl(data.investment) : "DADOS INSUFICIENTES", hint: "Despesas categorizadas como marketing/anúncios" },
      { label: "CAC", value: cac === null ? "DADOS INSUFICIENTES" : brl(cac), hint: "Investimento / clientes compradores (não atribuídos por canal)" },
      { label: "Custo por lead", value: "DADOS INSUFICIENTES", hint: "Falta quantidade real de leads" },
      { label: "Receita", value: brl(data.revenue) },
      { label: "Lucro bruto", value: brl(data.profit) },
      { label: "ROI", value: pct(roi), hint: "(Lucro bruto − investimento) / investimento" },
      { label: "ROAS", value: roas === null ? "DADOS INSUFICIENTES" : `${num(roas, 2)}x`, hint: "Receita / investimento" },
    ]} />
    <DataTable rows={[
      { etapa: "Marketing", qtd: null, valor: data.investment, observacao: hasInvestment ? "Investimento identificado nas despesas" : "Falta investimento por canal" },
      { etapa: "Leads", qtd: null, valor: null, observacao: "Falta cadastro e origem dos leads" },
      { etapa: "Orçamentos", qtd: data.quoteRows.length, valor: data.quoteRows.reduce((s,q) => s + q.total, 0), observacao: "Propostas registradas" },
      { etapa: "Vendas", qtd: data.saleRows.length, valor: data.revenue, observacao: `${data.converted.length} orçamentos vinculados como convertidos` },
      { etapa: "Margem / lucro", qtd: null, valor: data.profit, observacao: data.revenue > 0 ? `Margem bruta de ${pct((data.profit / data.revenue) * 100)}` : "Sem vendas" },
    ]} getKey={(r) => r.etapa} columns={[
      { key: "et", header: "Etapa", cell: (r) => <span className="font-medium">{r.etapa}</span> },
      { key: "q", header: "Quantidade", align: "right", cell: (r) => r.qtd === null ? "—" : num(r.qtd) },
      { key: "v", header: "Valor", align: "right", cell: (r) => r.valor === null ? "—" : brl(r.valor) },
      { key: "o", header: "Leitura", cell: (r) => <span className="text-xs text-muted-foreground">{r.observacao}</span> },
    ]} />
  </Shell>;
}

function Shell({ children }: { children: React.ReactNode }) { return <div><PageHeader title="Marketing" description="Marketing → Leads → Orçamentos → Vendas → Margem → Lucro. Resultado financeiro, nunca vaidade ou seguidores." />{children}</div>; }
