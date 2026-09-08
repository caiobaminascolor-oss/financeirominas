import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/layout/PageHeader";
import { InsufficientData, TableSkeleton } from "@/components/InsufficientData";
import { MetricStrip } from "@/components/MetricStrip";
import { DataTable } from "@/components/DataTable";
import { ClassBadge, type Tone } from "@/components/ClassBadge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSales } from "@/lib/analytics";
import { useCustomers } from "@/lib/data";
import { brl, dt, daysBetween, num } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/clientes")({
  head: () => ({
    meta: [
      { title: "Clientes — MINASCOLOR CONTROL" },
      { name: "description", content: "Base de clientes classificada por recência, frequência e valor, com oportunidades de recompra." },
      { property: "og:title", content: "Clientes — MINASCOLOR CONTROL" },
      { property: "og:description", content: "Novo, recorrente, VIP, em risco ou inativo — calculado a partir do histórico real de compras." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ClientesPage,
});

type Classe = { label: string; tone: Tone; reason: string };

function classify(c: {
  compras: number;
  faturamento: number;
  ultimaCompra: string | null;
  vipCut: number;
}): Classe {
  const dias = c.ultimaCompra ? daysBetween(c.ultimaCompra) : null;
  if (c.compras === 0)
    return { label: "Sem compras", tone: "neutro", reason: "Cadastrado, mas sem nenhuma venda registrada." };
  if (dias !== null && dias > 180)
    return { label: "Inativo", tone: "vermelho", reason: `Sem comprar há ${dias} dias.` };
  if (dias !== null && dias > 90)
    return { label: "Em risco", tone: "laranja", reason: `Última compra há ${dias} dias — recompra atrasada.` };
  if (c.faturamento >= c.vipCut && c.compras >= 3)
    return { label: "VIP", tone: "verde", reason: "Está entre os 20% que mais faturam e compra com frequência." };
  if (c.compras >= 3)
    return { label: "Recorrente", tone: "verde", reason: `${c.compras} compras registradas no período.` };
  return { label: "Novo", tone: "amarelo", reason: "Uma ou duas compras — relacionamento ainda em formação." };
}

function ClientesPage() {
  const customers = useCustomers();
  const sales = useSales(365);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("todos");

  const loading = customers.isLoading || sales.isLoading;

  const rows = useMemo(() => {
    const agg = new Map<string, { compras: number; faturamento: number; lucro: number; last: string | null }>();
    for (const s of sales.data ?? []) {
      if (!s.customer_id || s.status === "cancelada") continue;
      const cur = agg.get(s.customer_id) ?? { compras: 0, faturamento: 0, lucro: 0, last: null };
      cur.compras += 1;
      cur.faturamento += s.total;
      cur.lucro += s.gross_profit;
      if (!cur.last || s.sold_at > cur.last) cur.last = s.sold_at;
      agg.set(s.customer_id, cur);
    }

    const faturamentos = [...agg.values()].map((a) => a.faturamento).sort((a, b) => b - a);
    const vipCut = faturamentos.length > 0
      ? (faturamentos[Math.max(0, Math.floor(faturamentos.length * 0.2) - 1)] ?? 0)
      : Number.POSITIVE_INFINITY;

    return (customers.data ?? []).map((c) => {
      const a = agg.get(c.id);
      const compras = a?.compras ?? 0;
      const faturamento = a?.faturamento ?? 0;
      const lucro = a?.lucro ?? 0;
      const ultimaCompra = a?.last ?? c.last_purchase_at;
      return {
        ...c,
        compras,
        faturamento,
        lucro,
        ticket: compras > 0 ? faturamento / compras : null,
        margem: faturamento > 0 ? (lucro / faturamento) * 100 : null,
        ultimaCompra,
        diasSemComprar: ultimaCompra ? daysBetween(ultimaCompra) : null,
        klass: classify({ compras, faturamento, ultimaCompra, vipCut }),
      };
    });
  }, [customers.data, sales.data]);

  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        if (filter !== "todos" && r.klass.label !== filter) return false;
        if (search && !`${r.name} ${r.city ?? ""} ${r.doc ?? ""}`.toLowerCase().includes(search.toLowerCase()))
          return false;
        return true;
      }),
    [rows, search, filter],
  );

  const emRisco = rows.filter((r) => r.klass.label === "Em risco");
  const inativos = rows.filter((r) => r.klass.label === "Inativo");

  if (loading) return <Shell><TableSkeleton /></Shell>;

  if ((customers.data ?? []).length === 0)
    return (
      <Shell>
        <InsufficientData
          what="Não há clientes cadastrados. A classificação por recência, frequência e valor depende da base de clientes ligada ao histórico de vendas."
          hints={[
            "Importe a base de clientes com nome, documento, cidade e contato",
            "Importe as vendas vinculadas ao cliente para calcular recompra e ticket",
          ]}
        />
      </Shell>
    );

  return (
    <Shell>
      <MetricStrip
        metrics={[
          { label: "Clientes na base", value: num(rows.length) },
          { label: "Clientes com compra (12m)", value: num(rows.filter((r) => r.compras > 0).length) },
          {
            label: "Em risco de perda",
            value: num(emRisco.length),
            tone: emRisco.length > 0 ? "warning" : undefined,
            hint: `${brl(emRisco.reduce((s, r) => s + r.faturamento, 0))} de faturamento em risco`,
          },
          {
            label: "Inativos (+180 dias)",
            value: num(inativos.length),
            tone: inativos.length > 0 ? "danger" : undefined,
            hint: `${brl(inativos.reduce((s, r) => s + r.faturamento, 0))} já faturados no passado`,
          },
        ]}
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar cliente, documento ou cidade"
          className="max-w-xs"
        />
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todas as classificações</SelectItem>
            <SelectItem value="VIP">VIP</SelectItem>
            <SelectItem value="Recorrente">Recorrente</SelectItem>
            <SelectItem value="Novo">Novo</SelectItem>
            <SelectItem value="Em risco">Em risco</SelectItem>
            <SelectItem value="Inativo">Inativo</SelectItem>
            <SelectItem value="Sem compras">Sem compras</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <DataTable
        rows={[...filtered].sort((a, b) => b.faturamento - a.faturamento)}
        getKey={(r) => r.id}
        columns={[
          { key: "nome", header: "Cliente", cell: (r) => (
            <div>
              <p className="font-medium">{r.name}</p>
              <p className="text-xs text-muted-foreground">{r.city ?? "cidade não informada"}</p>
            </div>
          ) },
          { key: "compras", header: "Compras (12m)", align: "right", cell: (r) => num(r.compras) },
          { key: "fat", header: "Faturamento", align: "right", cell: (r) => brl(r.faturamento) },
          { key: "lucro", header: "Lucro bruto", align: "right", cell: (r) => brl(r.lucro) },
          { key: "marg", header: "Margem", align: "right", cell: (r) => (r.margem === null ? "—" : `${num(r.margem, 1)}%`) },
          { key: "tick", header: "Ticket médio", align: "right", cell: (r) => (r.ticket === null ? "—" : brl(r.ticket)) },
          { key: "ult", header: "Última compra", cell: (r) => (r.ultimaCompra ? `${dt(r.ultimaCompra)} (${r.diasSemComprar} d)` : "—") },
          { key: "cls", header: "Classificação", cell: (r) => <ClassBadge tone={r.klass.tone} label={r.klass.label} title={r.klass.reason} /> },
          { key: "acao", header: "Leitura", cell: (r) => <span className="text-xs text-muted-foreground">{r.klass.reason}</span> },
        ]}
      />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <PageHeader
        title="Clientes"
        description="Classificação por recência, frequência e valor — quem sustenta o faturamento, quem está esfriando e quem já foi perdido."
      />
      {children}
    </div>
  );
}
