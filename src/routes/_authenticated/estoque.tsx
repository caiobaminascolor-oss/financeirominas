import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/layout/PageHeader";
import { InsufficientData, TableSkeleton } from "@/components/InsufficientData";
import { MetricStrip } from "@/components/MetricStrip";
import { DataTable } from "@/components/DataTable";
import { ClassBadge } from "@/components/ClassBadge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { abcCurve, classifyStock, useProductAnalytics, type AbcCriterion } from "@/lib/analytics";
import { brl, dt, num, pct } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/estoque")({
  head: () => ({
    meta: [
      { title: "Estoque — MINASCOLOR CONTROL" },
      { name: "description", content: "Giro, cobertura, capital investido, risco de ruptura e curva ABC por produto." },
      { property: "og:title", content: "Estoque — MINASCOLOR CONTROL" },
      { property: "og:description", content: "Classificação de estoque por giro e cobertura, com curva ABC multi-critério." },
    ],
  }),
  component: EstoquePage,
});

const ABC_LABELS: Record<AbcCriterion, string> = {
  faturamento: "Faturamento (12 meses)",
  margem: "Margem / lucro bruto",
  giro: "Giro (unidades vendidas)",
  capital: "Capital investido em estoque",
};

function EstoquePage() {
  const { rows, loading, hasProducts, hasInventory } = useProductAnalytics();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [abc, setAbc] = useState<AbcCriterion>("faturamento");

  const enriched = useMemo(
    () => rows.map((r) => ({ ...r, klass: classifyStock(r) })),
    [rows],
  );

  const filtered = useMemo(
    () =>
      enriched.filter((r) => {
        if (statusFilter !== "todos" && r.klass.label !== statusFilter) return false;
        if (search) {
          const q = search.toLowerCase();
          if (!`${r.sku ?? ""} ${r.name} ${r.category} ${r.supplier}`.toLowerCase().includes(q)) return false;
        }
        return true;
      }),
    [enriched, search, statusFilter],
  );

  const totals = useMemo(() => {
    const capital = enriched.reduce((s, r) => s + r.stockValue, 0);
    const parado = enriched
      .filter((r) => r.klass.label === "Dinheiro parado")
      .reduce((s, r) => s + r.stockValue, 0);
    const ruptura = enriched.filter((r) => r.klass.label === "Risco de ruptura").length;
    const totalQty365 = enriched.reduce((s, r) => s + r.qty365, 0);
    const totalQty = enriched.reduce((s, r) => s + r.quantity, 0);
    return {
      capital,
      parado,
      ruptura,
      skus: enriched.length,
      giro: totalQty > 0 ? totalQty365 / totalQty : null,
    };
  }, [enriched]);

  const abcRows = useMemo(() => abcCurve(rows, abc), [rows, abc]);

  const statuses = useMemo(
    () => Array.from(new Set(enriched.map((r) => r.klass.label))),
    [enriched],
  );

  if (loading) return <Shell><TableSkeleton /></Shell>;

  if (!hasProducts || !hasInventory)
    return (
      <Shell>
        <InsufficientData
          what="Não há cadastro de produtos e/ou posição de estoque na base. Giro, cobertura, capital investido e curva ABC exigem estoque atual e histórico de vendas."
          hints={[
            "Importe os produtos com código, custo, preço de venda, categoria e fornecedor",
            "Importe a posição de estoque com quantidade e custo médio",
            "Importe pelo menos 12 meses de vendas com itens para calcular giro e cobertura",
          ]}
        />
      </Shell>
    );

  return (
    <Shell>
      <MetricStrip
        metrics={[
          { label: "Capital investido em estoque", value: brl(totals.capital) },
          { label: "Capital em dinheiro parado", value: brl(totals.parado), tone: totals.parado > 0 ? "danger" : undefined },
          { label: "SKUs em risco de ruptura", value: num(totals.ruptura), tone: totals.ruptura > 0 ? "danger" : undefined },
          { label: "Giro médio (12 meses)", value: totals.giro === null ? "—" : `${num(totals.giro, 2)}x` },
        ]}
      />

      <Tabs defaultValue="posicao">
        <TabsList>
          <TabsTrigger value="posicao">Posição de estoque</TabsTrigger>
          <TabsTrigger value="abc">Curva ABC</TabsTrigger>
        </TabsList>

        <TabsContent value="posicao" className="mt-4">
          <div className="mb-4 flex flex-wrap gap-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar produto, código, categoria ou fornecedor"
              className="max-w-xs"
            />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[200px]" aria-label="Status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os status</SelectItem>
                {statuses.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DataTable
            rows={filtered}
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
              { key: "qty", header: "Qtd", align: "right", cell: (r) => num(r.quantity, 2) },
              { key: "cost", header: "Custo", align: "right", cell: (r) => brl(r.avgCost) },
              { key: "price", header: "Preço venda", align: "right", cell: (r) => brl(r.salePrice) },
              { key: "value", header: "Valor estoque", align: "right", cell: (r) => brl(r.stockValue) },
              { key: "last", header: "Última venda", cell: (r) => dt(r.lastSaleAt) },
              { key: "v30", header: "V. 30d", align: "right", cell: (r) => num(r.qty30, 2) },
              { key: "v90", header: "V. 90d", align: "right", cell: (r) => num(r.qty90, 2) },
              { key: "v365", header: "V. 12m", align: "right", cell: (r) => num(r.qty365, 2) },
              { key: "turn", header: "Giro", align: "right", cell: (r) => (r.turnover === null ? "—" : `${num(r.turnover, 2)}x`) },
              {
                key: "cover",
                header: "Cobertura",
                align: "right",
                cell: (r) => (r.coverageDays === null ? "—" : `${num(r.coverageDays)} d`),
              },
              {
                key: "minmax",
                header: "Mín / Máx",
                align: "right",
                cell: (r) => `${num(r.minStock, 0)} / ${r.maxStock === null ? "—" : num(r.maxStock, 0)}`,
              },
              {
                key: "status",
                header: "Status",
                cell: (r) => <ClassBadge tone={r.klass.tone} label={r.klass.label} title={r.klass.reason} />,
              },
            ]}
          />
        </TabsContent>

        <TabsContent value="abc" className="mt-4">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Select value={abc} onValueChange={(v) => setAbc(v as AbcCriterion)}>
              <SelectTrigger className="w-[280px]" aria-label="Critério da curva ABC">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(ABC_LABELS) as AbcCriterion[]).map((k) => (
                  <SelectItem key={k} value={k}>
                    {ABC_LABELS[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              Classe A até 80% acumulado, B até 95%, C o restante.
            </p>
          </div>

          {abcRows.length === 0 ? (
            <InsufficientData what={`Não há valores positivos de ${ABC_LABELS[abc].toLowerCase()} para montar a curva ABC.`} />
          ) : (
            <DataTable
              rows={abcRows}
              getKey={(r) => r.row.productId}
              columns={[
                {
                  key: "cls",
                  header: "Classe",
                  cell: (r) => (
                    <ClassBadge tone={r.cls === "A" ? "verde" : r.cls === "B" ? "amarelo" : "laranja"} label={r.cls} />
                  ),
                },
                { key: "sku", header: "Código", cell: (r) => r.row.sku ?? "—" },
                { key: "name", header: "Produto", cell: (r) => r.row.name },
                { key: "cat", header: "Categoria", cell: (r) => r.row.category },
                {
                  key: "val",
                  header: ABC_LABELS[abc],
                  align: "right",
                  cell: (r) => (abc === "giro" ? num(r.value, 2) : brl(r.value)),
                },
                { key: "share", header: "% do total", align: "right", cell: (r) => pct(r.sharePct) },
                { key: "acc", header: "% acumulado", align: "right", cell: (r) => pct(r.accPct) },
              ]}
            />
          )}
        </TabsContent>
      </Tabs>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <PageHeader
        title="Estoque"
        description="Giro, cobertura, capital investido e risco de ruptura por produto, com curva ABC por faturamento, margem, giro e capital."
      />
      {children}
    </div>
  );
}
