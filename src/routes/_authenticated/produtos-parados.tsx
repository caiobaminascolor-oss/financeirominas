import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/layout/PageHeader";
import { InsufficientData, TableSkeleton } from "@/components/InsufficientData";
import { MetricStrip } from "@/components/MetricStrip";
import { DataTable } from "@/components/DataTable";
import { ClassBadge } from "@/components/ClassBadge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useProductAnalytics } from "@/lib/analytics";
import { brl, dt, num, pct } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/produtos-parados")({
  head: () => ({
    meta: [
      { title: "Produtos Parados — MINASCOLOR CONTROL" },
      { name: "description", content: "Capital parado = estoque × custo, com ranking e filtros de 30 a 365 dias." },
      { property: "og:title", content: "Produtos Parados — MINASCOLOR CONTROL" },
      { property: "og:description", content: "Ranking de capital imobilizado em produtos sem venda." },
    ],
  }),
  component: ProdutosParadosPage,
});

const FILTERS = ["30", "60", "90", "180", "365"];

function ProdutosParadosPage() {
  const { rows, loading, hasProducts, hasInventory } = useProductAnalytics();
  const [days, setDays] = useState("90");

  const parados = useMemo(() => {
    const limit = Number(days);
    return rows
      .filter((r) => r.quantity > 0 && (r.daysWithoutSale === null || r.daysWithoutSale >= limit))
      .map((r) => ({ ...r, capital: r.stockValue }))
      .sort((a, b) => b.capital - a.capital);
  }, [rows, days]);

  const capitalTotal = rows.reduce((s, r) => s + r.stockValue, 0);
  const capitalParado = parados.reduce((s, r) => s + r.capital, 0);

  return (
    <div>
      <PageHeader
        title="Produtos Parados"
        description="Capital parado = quantidade em estoque × custo médio. Estoque parado é caixa preso, não patrimônio."
      />

      {loading ? (
        <TableSkeleton />
      ) : !hasProducts || !hasInventory ? (
        <InsufficientData
          what="Sem produtos e posição de estoque não há como apurar capital parado."
          hints={["Importe produtos com custo", "Importe a posição de estoque", "Importe vendas para saber a data da última venda de cada item"]}
        />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">Sem venda há pelo menos</span>
            <Select value={days} onValueChange={setDays}>
              <SelectTrigger className="w-[140px]" aria-label="Dias sem venda">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FILTERS.map((f) => (
                  <SelectItem key={f} value={f}>
                    {f} dias
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <MetricStrip
            metrics={[
              { label: "Capital parado", value: brl(capitalParado), tone: capitalParado > 0 ? "danger" : undefined },
              { label: "% do capital em estoque", value: pct(capitalTotal > 0 ? (capitalParado / capitalTotal) * 100 : null) },
              { label: "SKUs parados", value: num(parados.length) },
              { label: "Capital total em estoque", value: brl(capitalTotal) },
            ]}
          />

          {parados.length === 0 ? (
            <InsufficientData what={`Nenhum produto com estoque e sem venda há ${days} dias ou mais no período analisado.`} />
          ) : (
            <DataTable
              rows={parados}
              getKey={(r) => r.productId}
              columns={[
                { key: "sku", header: "Código", cell: (r) => r.sku ?? "—" },
                {
                  key: "name",
                  header: "Produto",
                  cell: (r) => (
                    <div className="min-w-48">
                      <p className="font-medium">{r.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {r.category} · {r.supplier}
                      </p>
                    </div>
                  ),
                },
                { key: "qty", header: "Estoque", align: "right", cell: (r) => num(r.quantity, 2) },
                { key: "cost", header: "Custo unit.", align: "right", cell: (r) => brl(r.avgCost) },
                { key: "cap", header: "Capital parado", align: "right", cell: (r) => brl(r.capital) },
                { key: "last", header: "Última venda", cell: (r) => dt(r.lastSaleAt) },
                {
                  key: "dias",
                  header: "Dias sem venda",
                  align: "right",
                  cell: (r) => (r.daysWithoutSale === null ? "Sem venda em 12 meses" : num(r.daysWithoutSale)),
                },
                {
                  key: "sev",
                  header: "Severidade",
                  cell: (r) => {
                    const d = r.daysWithoutSale ?? 365;
                    const tone = d >= 365 ? "vermelho" : d >= 180 ? "laranja" : d >= 90 ? "amarelo" : "neutro";
                    const label = d >= 365 ? "Crítico" : d >= 180 ? "Alto" : d >= 90 ? "Médio" : "Baixo";
                    return <ClassBadge tone={tone} label={label} />;
                  },
                },
              ]}
            />
          )}
        </>
      )}
    </div>
  );
}
