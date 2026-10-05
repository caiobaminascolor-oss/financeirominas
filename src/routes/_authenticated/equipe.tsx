import { useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/layout/PageHeader";
import { InsufficientData, TableSkeleton } from "@/components/InsufficientData";
import { MetricStrip } from "@/components/MetricStrip";
import { DataTable } from "@/components/DataTable";
import { ClassBadge } from "@/components/ClassBadge";
import { buildRanking, useSales } from "@/lib/analytics";
import { useCommissions, useQuotes, useSalespeople, useTargets } from "@/lib/data";
import { brl, num, pct } from "@/lib/format";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/equipe")({
  head: () => ({
    meta: [
      { title: "Equipe — MINASCOLOR CONTROL" },
      { name: "description", content: "Performance da equipe por faturamento, margem, ticket, descontos, conversão, metas e comissão." },
      { property: "og:title", content: "Equipe — MINASCOLOR CONTROL" },
      { property: "og:description", content: "Avaliação multi-critério de vendedores, apurada somente por dados reais." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: EquipePage,
});

function EquipePage() {
  const { canSeeFinance } = useAuth();
  const sales = useSales(365);
  const people = useSalespeople();
  const quotes = useQuotes();
  const targets = useTargets();
  const commissions = useCommissions();

  const loading = sales.isLoading || people.isLoading || quotes.isLoading || targets.isLoading || commissions.isLoading;

  const rows = useMemo(() => {
    const ranking = buildRanking((sales.data ?? []).filter((s) => s.status !== "cancelada"));
    const byName = new Map(ranking.map((r) => [r.name, r]));

    return (people.data ?? []).map((p) => {
      const r = byName.get(p.name);
      const pQuotes = (quotes.data ?? []).filter((q) => q.salesperson_id === p.id);
      const converted = pQuotes.filter((q) => q.converted_sale_id || q.status === "convertido").length;
      const conversion = pQuotes.length > 0 ? (converted / pQuotes.length) * 100 : null;
      const pTargets = (targets.data ?? []).filter((t) => t.salesperson_id === p.id && t.metric === "faturamento");
      const target = pTargets.reduce((s, t) => s + t.target_value, 0);
      const achieved = target > 0 ? ((r?.revenue ?? 0) / target) * 100 : null;
      const commission = (commissions.data ?? [])
        .filter((c) => c.salesperson_id === p.id)
        .reduce((s, c) => s + c.amount, 0);
      return {
        id: p.id,
        name: p.name,
        active: p.active,
        revenue: r?.revenue ?? 0,
        count: r?.count ?? 0,
        ticket: r?.ticket ?? 0,
        profit: r?.profit ?? 0,
        marginPct: r?.marginPct ?? null,
        discountPct: r?.discountPct ?? null,
        score: r?.score ?? 0,
        position: r?.position ?? null,
        quotes: pQuotes.length,
        conversion,
        achieved,
        commission,
      };
    }).sort((a, b) => b.score - a.score);
  }, [sales.data, people.data, quotes.data, targets.data, commissions.data]);

  if (loading) return <Shell><TableSkeleton /></Shell>;

  if ((people.data ?? []).length === 0 || (sales.data ?? []).length === 0)
    return (
      <Shell>
        <InsufficientData
          what="Não há vendedores com histórico de vendas suficiente. A avaliação exige equipe cadastrada e vendas vinculadas ao vendedor."
          hints={[
            "Cadastre os vendedores e suas taxas de comissão",
            "Importe vendas e orçamentos vinculados a cada vendedor",
            "Cadastre metas individuais para calcular o atingimento",
          ]}
        />
      </Shell>
    );

  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
  const totalProfit = rows.reduce((s, r) => s + r.profit, 0);
  const totalCommissions = rows.reduce((s, r) => s + r.commission, 0);

  return (
    <Shell>
      <MetricStrip
        metrics={[
          { label: "Vendedores ativos", value: num(rows.filter((r) => r.active).length) },
          { label: "Faturamento da equipe", value: brl(totalRevenue) },
          ...(canSeeFinance
            ? [
                { label: "Lucro bruto da equipe", value: brl(totalProfit) },
                { label: "Comissões apuradas", value: brl(totalCommissions) },
              ]
            : []),
        ]}
      />
      <p className="mb-3 text-sm text-muted-foreground">
        Nota combina faturamento (20%), vendas (15%), ticket (15%), margem (20%), lucro (20%) e desconto médio invertido (10%). Sem julgamento pessoal.
      </p>
      <DataTable
        rows={rows}
        getKey={(r) => r.id}
        columns={[
          { key: "pos", header: "#", cell: (r) => r.position ?? "—" },
          { key: "name", header: "Vendedor", cell: (r) => <div><p className="font-medium">{r.name}</p><p className="text-xs text-muted-foreground">{r.active ? "Ativo" : "Inativo"}</p></div> },
          { key: "fat", header: "Faturamento", align: "right", cell: (r) => brl(r.revenue) },
          { key: "qtd", header: "Vendas", align: "right", cell: (r) => num(r.count) },
          { key: "ticket", header: "Ticket médio", align: "right", cell: (r) => brl(r.ticket) },
          ...(canSeeFinance ? [
            { key: "marg", header: "Margem", align: "right" as const, cell: (r: typeof rows[number]) => pct(r.marginPct) },
            { key: "luc", header: "Lucro bruto", align: "right" as const, cell: (r: typeof rows[number]) => brl(r.profit) },
          ] : []),
          { key: "desc", header: "Desconto médio", align: "right", cell: (r) => pct(r.discountPct) },
          { key: "conv", header: "Conv. orçamento", align: "right", cell: (r) => r.conversion === null ? "—" : pct(r.conversion) },
          { key: "meta", header: "% da meta", align: "right", cell: (r) => r.achieved === null ? "DADOS INSUFICIENTES" : pct(r.achieved) },
          ...(canSeeFinance ? [
            { key: "com", header: "Comissão", align: "right" as const, cell: (r: typeof rows[number]) => brl(r.commission) },
          ] : []),
          { key: "nota", header: "Nota", align: "right", cell: (r) => <ClassBadge tone={r.score >= 70 ? "verde" : r.score >= 45 ? "amarelo" : "laranja"} label={num(r.score, 1)} /> },
        ]}
      />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div><PageHeader title="Equipe" description="Performance multi-critério apurada somente por dados, sem avaliação subjetiva." />{children}</div>;
}
