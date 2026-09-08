import { useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/layout/PageHeader";
import { InsufficientData, TableSkeleton } from "@/components/InsufficientData";
import { MetricStrip } from "@/components/MetricStrip";
import { DataTable } from "@/components/DataTable";
import { ClassBadge } from "@/components/ClassBadge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  buildCashProjection,
  useCashTransactions,
  useExpenses,
  usePayables,
  useReceivables,
} from "@/lib/data";
import { brl, dt, num } from "@/lib/format";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/financeiro")({
  head: () => ({
    meta: [
      { title: "Financeiro — MINASCOLOR CONTROL" },
      { name: "description", content: "Caixa, contas a pagar e a receber, despesas e fluxo de caixa projetado em 7/15/30/60/90 dias." },
      { property: "og:title", content: "Financeiro — MINASCOLOR CONTROL" },
      { property: "og:description", content: "Projeção de caixa com cenários pessimista, base e otimista e premissas visíveis." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FinanceiroPage,
});

function FinanceiroPage() {
  const { canSeeFinance } = useAuth();
  const cash = useCashTransactions();
  const ap = usePayables();
  const ar = useReceivables();
  const expenses = useExpenses();

  const loading = cash.isLoading || ap.isLoading || ar.isLoading || expenses.isLoading;

  const proj = useMemo(
    () => buildCashProjection(cash.data ?? [], ap.data ?? [], ar.data ?? []),
    [cash.data, ap.data, ar.data],
  );

  const todayIso = new Date().toISOString().slice(0, 10);
  const openAp = (ap.data ?? []).filter((p) => !p.paid_at);
  const openAr = (ar.data ?? []).filter((r) => !r.received_at);
  const despesaTotal = (expenses.data ?? []).reduce((s, e) => s + e.amount, 0);

  if (!canSeeFinance)
    return (
      <Shell>
        <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          Seu perfil não tem permissão para ver dados financeiros sensíveis. Solicite acesso a um administrador.
        </div>
      </Shell>
    );

  if (loading) return <Shell><TableSkeleton /></Shell>;

  if (!proj.hasCash && !proj.hasAp && !proj.hasAr)
    return (
      <Shell>
        <InsufficientData
          what="Não há lançamentos de caixa, contas a pagar nem contas a receber. Sem eles não é possível projetar fluxo de caixa nem apurar inadimplência."
          hints={[
            "Importe o extrato de caixa (entradas e saídas com data)",
            "Importe contas a pagar com fornecedor, valor e vencimento",
            "Importe contas a receber com cliente, valor e vencimento",
            "Importe as despesas fixas e variáveis do período",
          ]}
        />
      </Shell>
    );

  return (
    <Shell>
      <MetricStrip
        metrics={[
          { label: "Saldo de caixa atual", value: proj.hasCash ? brl(proj.saldoAtual) : "DADOS INSUFICIENTES", tone: proj.saldoAtual < 0 ? "danger" : undefined, hint: proj.hasCash ? "Soma de entradas e saídas lançadas" : "Importe o extrato de caixa" },
          { label: "Contas a receber em aberto", value: brl(openAr.reduce((s, r) => s + r.amount, 0)), hint: `${num(openAr.length)} títulos` },
          { label: "Contas a pagar em aberto", value: brl(openAp.reduce((s, p) => s + p.amount, 0)), hint: `${num(openAp.length)} títulos` },
          { label: "Vencidos (receber / pagar)", value: `${brl(proj.vencidoAReceber)} / ${brl(proj.vencidoAPagar)}`, tone: proj.vencidoAPagar > 0 || proj.vencidoAReceber > 0 ? "danger" : undefined },
        ]}
      />

      <Tabs defaultValue="projecao">
        <TabsList>
          <TabsTrigger value="projecao">Fluxo projetado</TabsTrigger>
          <TabsTrigger value="receber">A receber</TabsTrigger>
          <TabsTrigger value="pagar">A pagar</TabsTrigger>
          <TabsTrigger value="despesas">Despesas</TabsTrigger>
        </TabsList>

        <TabsContent value="projecao" className="mt-4">
          <div className="mb-4 rounded-xl border border-border bg-muted/40 p-4 text-xs text-muted-foreground">
            <strong className="text-foreground">Premissas (PROJEÇÃO, não dado real):</strong> parte do saldo de caixa
            lançado; considera todos os títulos em aberto pelo vencimento. Cenário BASE recebe 100% no prazo;
            PESSIMISTA recebe 75%; OTIMISTA recebe 110% (antecipações). Nenhum cenário reduz contas a pagar.
          </div>
          <DataTable
            rows={proj.horizons}
            getKey={(h) => String(h.days)}
            columns={[
              { key: "d", header: "Horizonte", cell: (h) => `${h.days} dias` },
              { key: "ar", header: "A receber", align: "right", cell: (h) => brl(h.aReceber) },
              { key: "ap", header: "A pagar", align: "right", cell: (h) => brl(h.aPagar) },
              { key: "pes", header: "Pessimista", align: "right", cell: (h) => <span className={h.pessimista < 0 ? "text-danger" : ""}>{brl(h.pessimista)}</span> },
              { key: "base", header: "Base", align: "right", cell: (h) => <span className={h.base < 0 ? "text-danger" : ""}>{brl(h.base)}</span> },
              { key: "oti", header: "Otimista", align: "right", cell: (h) => brl(h.otimista) },
              {
                key: "st",
                header: "Situação",
                cell: (h) =>
                  h.pessimista < 0 ? (
                    <ClassBadge tone="vermelho" label="Caixa negativo" title="No cenário pessimista o caixa fica negativo neste horizonte." />
                  ) : h.base < 0 ? (
                    <ClassBadge tone="laranja" label="Risco" title="No cenário base o caixa fica negativo." />
                  ) : (
                    <ClassBadge tone="verde" label="Suportado" title="Caixa positivo em todos os cenários deste horizonte." />
                  ),
              },
            ]}
          />
        </TabsContent>

        <TabsContent value="receber" className="mt-4">
          {openAr.length === 0 ? (
            <InsufficientData what="Nenhuma conta a receber em aberto na base." />
          ) : (
            <DataTable
              rows={[...openAr].sort((a, b) => a.due_date.localeCompare(b.due_date))}
              getKey={(r) => r.id}
              columns={[
                { key: "cli", header: "Cliente", cell: (r) => r.customers?.name ?? "—" },
                { key: "desc", header: "Descrição", cell: (r) => r.description ?? "—" },
                { key: "venc", header: "Vencimento", cell: (r) => dt(r.due_date) },
                { key: "val", header: "Valor", align: "right", cell: (r) => brl(r.amount) },
                {
                  key: "st",
                  header: "Situação",
                  cell: (r) =>
                    r.due_date < todayIso ? (
                      <ClassBadge tone="vermelho" label="Vencido" title="Título vencido e não recebido — inadimplência." />
                    ) : (
                      <ClassBadge tone="verde" label="A vencer" />
                    ),
                },
              ]}
            />
          )}
        </TabsContent>

        <TabsContent value="pagar" className="mt-4">
          {openAp.length === 0 ? (
            <InsufficientData what="Nenhuma conta a pagar em aberto na base." />
          ) : (
            <DataTable
              rows={[...openAp].sort((a, b) => a.due_date.localeCompare(b.due_date))}
              getKey={(p) => p.id}
              columns={[
                { key: "for", header: "Fornecedor", cell: (p) => p.suppliers?.name ?? "—" },
                { key: "desc", header: "Descrição", cell: (p) => p.description ?? p.category ?? "—" },
                { key: "venc", header: "Vencimento", cell: (p) => dt(p.due_date) },
                { key: "val", header: "Valor", align: "right", cell: (p) => brl(p.amount) },
                {
                  key: "st",
                  header: "Situação",
                  cell: (p) =>
                    p.due_date < todayIso ? (
                      <ClassBadge tone="vermelho" label="Vencido" title="Conta vencida e não paga." />
                    ) : (
                      <ClassBadge tone="verde" label="A vencer" />
                    ),
                },
              ]}
            />
          )}
        </TabsContent>

        <TabsContent value="despesas" className="mt-4">
          {(expenses.data ?? []).length === 0 ? (
            <InsufficientData
              what="Nenhuma despesa lançada. Sem despesas não é possível separar lucro bruto de lucro operacional."
              hints={["Importe despesas fixas e variáveis com data, categoria e valor"]}
            />
          ) : (
            <>
              <p className="mb-3 text-sm text-muted-foreground">
                Total lançado: <strong className="text-foreground">{brl(despesaTotal)}</strong>
              </p>
              <DataTable
                rows={[...(expenses.data ?? [])].sort((a, b) => b.expense_date.localeCompare(a.expense_date))}
                getKey={(e) => e.id}
                columns={[
                  { key: "data", header: "Data", cell: (e) => dt(e.expense_date) },
                  { key: "cat", header: "Categoria", cell: (e) => e.category ?? "—" },
                  { key: "desc", header: "Descrição", cell: (e) => e.description ?? "—" },
                  { key: "rec", header: "Recorrente", cell: (e) => (e.recurring ? "Sim" : "Não") },
                  { key: "val", header: "Valor", align: "right", cell: (e) => brl(e.amount) },
                ]}
              />
            </>
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
        title="Financeiro"
        description="Caixa não é lucro: aqui estão saldo, contas a pagar e a receber, despesas e a projeção de caixa com premissas explícitas."
      />
      {children}
    </div>
  );
}
