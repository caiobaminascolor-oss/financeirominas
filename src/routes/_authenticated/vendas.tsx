import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/layout/PageHeader";
import { InsufficientData, TableSkeleton } from "@/components/InsufficientData";
import { MetricStrip } from "@/components/MetricStrip";
import { DataTable, type Column } from "@/components/DataTable";
import { ClassBadge } from "@/components/ClassBadge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSales, type SaleRow } from "@/lib/analytics";
import { brl, dt, num, pct, safeDiv } from "@/lib/format";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/vendas")({
  head: () => ({
    meta: [
      { title: "Vendas — MINASCOLOR CONTROL" },
      { name: "description", content: "Vendas do período, margem por venda e ranking de vendedores multi-critério." },
      { property: "og:title", content: "Vendas — MINASCOLOR CONTROL" },
      { property: "og:description", content: "Faturamento, ticket médio, margem, lucro e desconto por venda e por vendedor." },
    ],
  }),
  component: VendasPage,
});

const PERIODS = [
  { value: "30", label: "Últimos 30 dias" },
  { value: "90", label: "Últimos 90 dias" },
  { value: "180", label: "Últimos 180 dias" },
  { value: "365", label: "Últimos 12 meses" },
];

function VendasPage() {
  const [days, setDays] = useState("90");
  const [search, setSearch] = useState("");
  const [seller, setSeller] = useState("todos");
  const [payment, setPayment] = useState("todos");
  const { canSeeFinance } = useAuth();
  const { data, isLoading } = useSales(Number(days));

  const sales = data ?? [];

  const sellers = useMemo(
    () => Array.from(new Set(sales.map((s) => s.salespeople?.name).filter(Boolean) as string[])),
    [sales],
  );
  const payments = useMemo(
    () => Array.from(new Set(sales.map((s) => s.payment_method).filter(Boolean) as string[])),
    [sales],
  );

  const filtered = useMemo(
    () =>
      sales.filter((s) => {
        if (seller !== "todos" && s.salespeople?.name !== seller) return false;
        if (payment !== "todos" && s.payment_method !== payment) return false;
        if (search) {
          const q = search.toLowerCase();
          const hay = `${s.sale_number ?? ""} ${s.customers?.name ?? ""} ${s.salespeople?.name ?? ""}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      }),
    [sales, seller, payment, search],
  );

  const totals = useMemo(() => {
    const revenue = filtered.reduce((s, r) => s + r.total, 0);
    const cost = filtered.reduce((s, r) => s + r.cost_total, 0);
    const discount = filtered.reduce((s, r) => s + r.discount_amount, 0);
    const profit = filtered.reduce((s, r) => s + r.gross_profit, 0);
    return {
      revenue,
      cost,
      discount,
      profit,
      count: filtered.length,
      ticket: safeDiv(revenue, filtered.length),
      marginPct: revenue > 0 ? (profit / revenue) * 100 : null,
      discountPct: revenue + discount > 0 ? (discount / (revenue + discount)) * 100 : null,
    };
  }, [filtered]);

  const ranking = useMemo(() => buildRanking(filtered), [filtered]);

  const columns: Column<SaleRow>[] = [
    { key: "num", header: "Venda", cell: (r) => r.sale_number ?? r.id.slice(0, 8) },
    { key: "date", header: "Data", cell: (r) => dt(r.sold_at) },
    { key: "customer", header: "Cliente", cell: (r) => r.customers?.name ?? "—" },
    { key: "seller", header: "Vendedor", cell: (r) => r.salespeople?.name ?? "—" },
    { key: "pay", header: "Pagamento", cell: (r) => r.payment_method ?? "—" },
    { key: "total", header: "Faturamento", align: "right", cell: (r) => brl(r.total) },
    { key: "disc", header: "Desconto", align: "right", cell: (r) => brl(r.discount_amount) },
    ...(canSeeFinance
      ? ([
          { key: "cost", header: "CMV", align: "right", cell: (r: SaleRow) => brl(r.cost_total) },
          { key: "profit", header: "Lucro bruto", align: "right", cell: (r: SaleRow) => brl(r.gross_profit) },
        ] as Column<SaleRow>[])
      : []),
    {
      key: "margin",
      header: "Margem",
      align: "right",
      cell: (r) => {
        const m = r.margin_pct ?? (r.total > 0 ? (r.gross_profit / r.total) * 100 : null);
        if (m === null) return "—";
        return (
          <span className={m < 0 ? "font-semibold text-danger" : ""}>{pct(m)}</span>
        );
      },
    },
    { key: "status", header: "Status", cell: (r) => r.status },
  ];

  return (
    <div>
      <PageHeader
        title="Vendas"
        description="Faturamento não é lucro: cada venda é apurada com CMV, desconto concedido e margem real."
      />

      <div className="mb-6 flex flex-wrap gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por venda, cliente ou vendedor"
          className="max-w-xs"
        />
        <Select value={days} onValueChange={setDays}>
          <SelectTrigger className="w-[180px]" aria-label="Período">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PERIODS.map((p) => (
              <SelectItem key={p.value} value={p.value}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={seller} onValueChange={setSeller}>
          <SelectTrigger className="w-[180px]" aria-label="Vendedor">
            <SelectValue placeholder="Vendedor" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os vendedores</SelectItem>
            {sellers.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={payment} onValueChange={setPayment}>
          <SelectTrigger className="w-[180px]" aria-label="Forma de pagamento">
            <SelectValue placeholder="Pagamento" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todas as formas</SelectItem>
            {payments.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <TableSkeleton />
      ) : sales.length === 0 ? (
        <InsufficientData
          what="Nenhuma venda registrada no período. Sem vendas reais não há faturamento, margem, lucro nem ranking de vendedores para apurar."
          hints={[
            "Importe as vendas com data, cliente, vendedor e forma de pagamento",
            "Importe os itens de venda com quantidade, preço e custo unitário (sem custo não existe margem)",
          ]}
        />
      ) : (
        <>
          <MetricStrip
            metrics={[
              { label: "Faturamento", value: brl(totals.revenue) },
              { label: "Nº de vendas", value: num(totals.count) },
              { label: "Ticket médio", value: brl(totals.ticket ?? undefined) },
              { label: "Desconto concedido", value: brl(totals.discount), hint: `${pct(totals.discountPct)} do valor bruto` },
              ...(canSeeFinance
                ? [
                    { label: "CMV", value: brl(totals.cost) },
                    { label: "Lucro bruto", value: brl(totals.profit) },
                    {
                      label: "Margem bruta",
                      value: pct(totals.marginPct),
                      tone: (totals.marginPct !== null && totals.marginPct < 0 ? "danger" : undefined) as
                        | "danger"
                        | undefined,
                    },
                  ]
                : []),
            ]}
          />

          <Tabs defaultValue="lista">
            <TabsList>
              <TabsTrigger value="lista">Vendas</TabsTrigger>
              <TabsTrigger value="ranking">Ranking de vendedores</TabsTrigger>
            </TabsList>
            <TabsContent value="lista" className="mt-4">
              <DataTable columns={columns} rows={filtered} getKey={(r) => r.id} />
            </TabsContent>
            <TabsContent value="ranking" className="mt-4">
              <p className="mb-3 text-sm text-muted-foreground">
                O ranking combina faturamento, quantidade de vendas, ticket médio, margem, lucro e
                desconto médio — nunca apenas faturamento. Cada critério é normalizado de 0 a 100 e o
                desconto entra invertido (quanto maior o desconto, menor a nota).
              </p>
              <DataTable
                rows={ranking}
                getKey={(r) => r.name}
                columns={[
                  { key: "pos", header: "#", cell: (r) => r.position },
                  { key: "name", header: "Vendedor", cell: (r) => r.name },
                  { key: "rev", header: "Faturamento", align: "right", cell: (r) => brl(r.revenue) },
                  { key: "count", header: "Vendas", align: "right", cell: (r) => num(r.count) },
                  { key: "ticket", header: "Ticket médio", align: "right", cell: (r) => brl(r.ticket) },
                  { key: "margin", header: "Margem", align: "right", cell: (r) => pct(r.marginPct) },
                  { key: "profit", header: "Lucro", align: "right", cell: (r) => brl(r.profit) },
                  { key: "disc", header: "Desconto médio", align: "right", cell: (r) => pct(r.discountPct) },
                  {
                    key: "score",
                    header: "Nota multi-critério",
                    align: "right",
                    cell: (r) => (
                      <span className="inline-flex items-center gap-2">
                        {num(r.score, 1)}
                        <ClassBadge
                          tone={r.score >= 70 ? "verde" : r.score >= 50 ? "amarelo" : r.score >= 30 ? "laranja" : "vermelho"}
                          label={r.score >= 70 ? "Alta" : r.score >= 50 ? "Normal" : r.score >= 30 ? "Desenvolver" : "Baixa"}
                        />
                      </span>
                    ),
                  },
                ]}
              />
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}

export type SellerRank = {
  position: number;
  name: string;
  revenue: number;
  count: number;
  ticket: number;
  profit: number;
  marginPct: number | null;
  discountPct: number | null;
  score: number;
};

export function buildRanking(sales: SaleRow[]): SellerRank[] {
  const map = new Map<string, { revenue: number; count: number; profit: number; discount: number }>();
  for (const s of sales) {
    const name = s.salespeople?.name ?? "Sem vendedor";
    const cur = map.get(name) ?? { revenue: 0, count: 0, profit: 0, discount: 0 };
    cur.revenue += s.total;
    cur.count += 1;
    cur.profit += s.gross_profit;
    cur.discount += s.discount_amount;
    map.set(name, cur);
  }

  const base = Array.from(map.entries()).map(([name, v]) => ({
    name,
    revenue: v.revenue,
    count: v.count,
    ticket: v.count ? v.revenue / v.count : 0,
    profit: v.profit,
    marginPct: v.revenue > 0 ? (v.profit / v.revenue) * 100 : null,
    discountPct: v.revenue + v.discount > 0 ? (v.discount / (v.revenue + v.discount)) * 100 : null,
  }));

  const norm = (values: number[], value: number, invert = false) => {
    const max = Math.max(...values);
    const min = Math.min(...values);
    if (max === min) return 50;
    const n = ((value - min) / (max - min)) * 100;
    return invert ? 100 - n : n;
  };

  const revs = base.map((b) => b.revenue);
  const counts = base.map((b) => b.count);
  const tickets = base.map((b) => b.ticket);
  const margins = base.map((b) => b.marginPct ?? 0);
  const profits = base.map((b) => b.profit);
  const discounts = base.map((b) => b.discountPct ?? 0);

  return base
    .map((b) => ({
      ...b,
      score:
        norm(revs, b.revenue) * 0.2 +
        norm(counts, b.count) * 0.15 +
        norm(tickets, b.ticket) * 0.15 +
        norm(margins, b.marginPct ?? 0) * 0.2 +
        norm(profits, b.profit) * 0.2 +
        norm(discounts, b.discountPct ?? 0, true) * 0.1,
    }))
    .sort((a, b) => b.score - a.score)
    .map((b, i) => ({ ...b, position: i + 1 }));
}
