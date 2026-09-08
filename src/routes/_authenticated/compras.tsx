import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/layout/PageHeader";
import { InsufficientData, TableSkeleton } from "@/components/InsufficientData";
import { MetricStrip } from "@/components/MetricStrip";
import { DataTable } from "@/components/DataTable";
import { ClassBadge } from "@/components/ClassBadge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { classifyPurchase, useProductAnalytics } from "@/lib/analytics";
import { buildCashProjection, useCashTransactions, usePayables, useReceivables } from "@/lib/data";
import { brl, num } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/compras")({
  head: () => ({
    meta: [
      { title: "Compras — MINASCOLOR CONTROL" },
      { name: "description", content: "Sugestão de compra cruzando estoque, giro, demanda, prazo de fornecedor, margem e caixa." },
      { property: "og:title", content: "Compras — MINASCOLOR CONTROL" },
      { property: "og:description", content: "Comprar agora, em breve, sob demanda ou não comprar — sempre com justificativa em dados." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ComprasPage,
});

function ComprasPage() {
  const { rows, loading, hasProducts, hasInventory } = useProductAnalytics();
  const cash = useCashTransactions();
  const ap = usePayables();
  const ar = useReceivables();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("todos");

  const projection = useMemo(
    () => buildCashProjection(cash.data ?? [], ap.data ?? [], ar.data ?? []),
    [cash.data, ap.data, ar.data],
  );

  const h30 = projection.horizons.find((h) => h.days === 30);
  const cashKnown = projection.hasCash || projection.hasAp || projection.hasAr;
  const cashOk = cashKnown ? (h30?.pessimista ?? 0) > 0 : true;

  const enriched = useMemo(
    () =>
      rows.map((r) => {
        const klass = classifyPurchase(r, cashOk);
        const daily = r.qty90 / 90;
        const lead = r.leadTimeDays ?? 15;
        // Quantidade mínima = consumo no lead time + 30 dias de segurança - estoque atual.
        const alvo = daily * (lead + 30);
        const minQty = Math.max(0, Math.ceil(alvo - r.quantity));
        return { ...r, klass, daily, lead, minQty, capital: minQty * (r.avgCost || 0) };
      }),
    [rows, cashOk],
  );

  const filtered = useMemo(
    () =>
      enriched.filter((r) => {
        if (filter !== "todos" && r.klass.label !== filter) return false;
        if (search) {
          const q = search.toLowerCase();
          if (!`${r.sku ?? ""} ${r.name} ${r.supplier}`.toLowerCase().includes(q)) return false;
        }
        return true;
      }),
    [enriched, search, filter],
  );

  const comprarAgora = enriched.filter((r) => r.klass.label === "Comprar agora");
  const capitalNecessario = comprarAgora.reduce((s, r) => s + r.capital, 0);

  if (loading) return <Shell><TableSkeleton /></Shell>;

  if (!hasProducts || !hasInventory)
    return (
      <Shell>
        <InsufficientData
          what="Sem cadastro de produtos e posição de estoque não é possível calcular necessidade de compra: giro, cobertura e prazo de fornecedor dependem desses dados."
          hints={[
            "Importe produtos com custo, preço de venda e fornecedor",
            "Importe a posição de estoque atual",
            "Importe o histórico de vendas dos últimos 12 meses",
            "Cadastre o prazo de entrega (lead time) de cada fornecedor",
          ]}
        />
      </Shell>
    );

  return (
    <Shell>
      <MetricStrip
        metrics={[
          { label: "Itens para comprar agora", value: num(comprarAgora.length), tone: comprarAgora.length > 0 ? "warning" : undefined },
          { label: "Capital necessário (comprar agora)", value: brl(capitalNecessario) },
          {
            label: "Caixa projetado em 30 dias (pessimista)",
            value: cashKnown ? brl(h30?.pessimista ?? 0) : "DADOS INSUFICIENTES",
            tone: cashKnown && (h30?.pessimista ?? 0) <= 0 ? "danger" : undefined,
            hint: cashKnown
              ? "Cenário com 25% dos recebimentos em atraso"
              : "Importe caixa, contas a pagar e a receber para condicionar a compra ao caixa",
          },
          {
            label: "Itens que não devem ser comprados",
            value: num(enriched.filter((r) => r.klass.label === "Não comprar").length),
          },
        ]}
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar produto, código ou fornecedor"
          className="max-w-xs"
        />
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todas as recomendações</SelectItem>
            <SelectItem value="Comprar agora">Comprar agora</SelectItem>
            <SelectItem value="Comprar em breve">Comprar em breve</SelectItem>
            <SelectItem value="Sob demanda">Sob demanda</SelectItem>
            <SelectItem value="Não comprar">Não comprar</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <DataTable
        rows={filtered}
        getKey={(r) => r.productId}
        columns={[
          { key: "prod", header: "Produto", cell: (r) => (
            <div>
              <p className="font-medium">{r.name}</p>
              <p className="text-xs text-muted-foreground">{r.sku ?? "sem código"} · {r.supplier}</p>
            </div>
          ) },
          { key: "estoque", header: "Estoque", align: "right", cell: (r) => num(r.quantity, 2) },
          { key: "media", header: "Venda média/dia", align: "right", cell: (r) => num(r.daily, 2) },
          { key: "giro", header: "Giro (12m)", align: "right", cell: (r) => (r.turnover === null ? "—" : `${num(r.turnover, 1)}x`) },
          { key: "cob", header: "Cobertura", align: "right", cell: (r) => (r.coverageDays === null ? "—" : `${num(r.coverageDays)} d`) },
          { key: "lead", header: "Prazo forn.", align: "right", cell: (r) => `${r.lead} d${r.leadTimeDays === null ? "*" : ""}` },
          { key: "min", header: "Qtd. mínima", align: "right", cell: (r) => num(r.minQty) },
          { key: "custo", header: "Preço de compra", align: "right", cell: (r) => brl(r.avgCost) },
          { key: "cap", header: "Capital necessário", align: "right", cell: (r) => brl(r.capital) },
          { key: "marg", header: "Margem (12m)", align: "right", cell: (r) => (r.marginPct === null ? "—" : `${num(r.marginPct, 1)}%`) },
          { key: "rec", header: "Recomendação", cell: (r) => <ClassBadge tone={r.klass.tone} label={r.klass.label} title={r.klass.reason} /> },
          { key: "just", header: "Justificativa", cell: (r) => <span className="text-xs text-muted-foreground">{r.klass.reason}</span> },
        ]}
      />
      <p className="mt-3 text-xs text-muted-foreground">
        * Prazo de fornecedor não cadastrado — assumidos 15 dias como HIPÓTESE. Cadastre o lead time real para a recomendação usar DADO REAL.
      </p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <PageHeader
        title="Compras"
        description="Necessidade de compra cruzando estoque, venda média, giro, cobertura, prazo do fornecedor, margem e caixa projetado."
      />
      {children}
    </div>
  );
}
