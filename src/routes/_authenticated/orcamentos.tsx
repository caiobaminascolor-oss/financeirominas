import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/layout/PageHeader";
import { InsufficientData, TableSkeleton } from "@/components/InsufficientData";
import { MetricStrip } from "@/components/MetricStrip";
import { DataTable } from "@/components/DataTable";
import { ClassBadge, type Tone } from "@/components/ClassBadge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuotes } from "@/lib/data";
import { brl, dt, daysBetween, num, pct } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/orcamentos")({
  head: () => ({
    meta: [
      { title: "Orçamentos — MINASCOLOR CONTROL" },
      { name: "description", content: "Pipeline de orçamentos, valor em aberto, orçamentos parados e taxa de conversão em venda." },
      { property: "og:title", content: "Orçamentos — MINASCOLOR CONTROL" },
      { property: "og:description", content: "Conversão de orçamento em venda por status, vendedor e tempo parado." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OrcamentosPage,
});

const TONE_BY_STATUS: Record<string, Tone> = {
  convertido: "verde",
  aprovado: "verde",
  "em negociação": "amarelo",
  aberto: "amarelo",
  perdido: "vermelho",
  expirado: "vermelho",
};

function OrcamentosPage() {
  const quotes = useQuotes();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("todos");

  const rows = useMemo(
    () =>
      (quotes.data ?? []).map((q) => {
        const dias = daysBetween(q.issued_at);
        const expirado =
          q.valid_until !== null && q.valid_until < new Date().toISOString().slice(0, 10) &&
          !q.converted_sale_id;
        const aberto = !q.converted_sale_id && !["perdido", "convertido"].includes(q.status);
        return { ...q, dias, expirado, aberto, parado: aberto && dias > 15 };
      }),
    [quotes.data],
  );

  const statuses = useMemo(() => Array.from(new Set(rows.map((r) => r.status))), [rows]);

  const filtered = rows.filter((r) => {
    if (status !== "todos" && r.status !== status) return false;
    if (search && !`${r.quote_number ?? ""} ${r.customers?.name ?? ""} ${r.salespeople?.name ?? ""}`.toLowerCase().includes(search.toLowerCase()))
      return false;
    return true;
  });

  const convertidos = rows.filter((r) => r.converted_sale_id || r.status === "convertido");
  const conversao = rows.length > 0 ? (convertidos.length / rows.length) * 100 : null;
  const emAberto = rows.filter((r) => r.aberto);
  const parados = rows.filter((r) => r.parado);

  const porVendedor = useMemo(() => {
    const map = new Map<string, { nome: string; total: number; conv: number; valor: number; valorConv: number }>();
    for (const r of rows) {
      const nome = r.salespeople?.name ?? "Sem vendedor";
      const cur = map.get(nome) ?? { nome, total: 0, conv: 0, valor: 0, valorConv: 0 };
      cur.total += 1;
      cur.valor += r.total;
      if (r.converted_sale_id || r.status === "convertido") {
        cur.conv += 1;
        cur.valorConv += r.total;
      }
      map.set(nome, cur);
    }
    return [...map.values()].sort((a, b) => b.valor - a.valor);
  }, [rows]);

  if (quotes.isLoading) return <Shell><TableSkeleton /></Shell>;

  if (rows.length === 0)
    return (
      <Shell>
        <InsufficientData
          what="Nenhum orçamento na base. Sem orçamentos não é possível medir conversão nem identificar propostas paradas."
          hints={[
            "Importe orçamentos com número, cliente, vendedor, data, validade e valor",
            "Vincule o orçamento à venda quando ele for convertido",
          ]}
        />
      </Shell>
    );

  return (
    <Shell>
      <MetricStrip
        metrics={[
          { label: "Orçamentos na base", value: num(rows.length) },
          { label: "Taxa de conversão", value: pct(conversao), tone: conversao !== null && conversao < 25 ? "warning" : "success" },
          { label: "Valor em aberto", value: brl(emAberto.reduce((s, r) => s + r.total, 0)), hint: `${num(emAberto.length)} propostas` },
          {
            label: "Parados há mais de 15 dias",
            value: num(parados.length),
            tone: parados.length > 0 ? "danger" : undefined,
            hint: `${brl(parados.reduce((s, r) => s + r.total, 0))} sem desfecho`,
          },
        ]}
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar número, cliente ou vendedor"
          className="max-w-xs"
        />
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os status</SelectItem>
            {statuses.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <DataTable
        rows={[...filtered].sort((a, b) => b.issued_at.localeCompare(a.issued_at))}
        getKey={(r) => r.id}
        columns={[
          { key: "num", header: "Orçamento", cell: (r) => r.quote_number ?? r.id.slice(0, 8) },
          { key: "cli", header: "Cliente", cell: (r) => r.customers?.name ?? "—" },
          { key: "vend", header: "Vendedor", cell: (r) => r.salespeople?.name ?? "—" },
          { key: "data", header: "Emissão", cell: (r) => `${dt(r.issued_at)} (${r.dias} d)` },
          { key: "val", header: "Validade", cell: (r) => dt(r.valid_until) },
          { key: "tot", header: "Valor", align: "right", cell: (r) => brl(r.total) },
          { key: "st", header: "Status", cell: (r) => <ClassBadge tone={TONE_BY_STATUS[r.status] ?? "neutro"} label={r.status} /> },
          {
            key: "sit",
            header: "Situação",
            cell: (r) =>
              r.expirado ? (
                <ClassBadge tone="vermelho" label="Expirado" title="Validade vencida sem conversão." />
              ) : r.parado ? (
                <ClassBadge tone="laranja" label="Parado" title={`Sem desfecho há ${r.dias} dias.`} />
              ) : (
                <span className="text-xs text-muted-foreground">—</span>
              ),
          },
        ]}
      />

      <h2 className="mt-8 mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Conversão por vendedor
      </h2>
      <DataTable
        rows={porVendedor}
        getKey={(r) => r.nome}
        columns={[
          { key: "n", header: "Vendedor", cell: (r) => r.nome },
          { key: "t", header: "Orçamentos", align: "right", cell: (r) => num(r.total) },
          { key: "c", header: "Convertidos", align: "right", cell: (r) => num(r.conv) },
          { key: "tx", header: "Conversão", align: "right", cell: (r) => pct(r.total > 0 ? (r.conv / r.total) * 100 : null) },
          { key: "v", header: "Valor orçado", align: "right", cell: (r) => brl(r.valor) },
          { key: "vc", header: "Valor convertido", align: "right", cell: (r) => brl(r.valorConv) },
        ]}
      />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <PageHeader
        title="Orçamentos"
        description="Pipeline completo: valor em aberto, propostas paradas, expiradas e conversão real em venda por vendedor."
      />
      {children}
    </div>
  );
}
