import { useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/PageHeader";
import { InsufficientData, TableSkeleton } from "@/components/InsufficientData";
import { DataTable } from "@/components/DataTable";
import { ClassBadge } from "@/components/ClassBadge";
import { MetricStrip } from "@/components/MetricStrip";
import { supabase } from "@/integrations/supabase/client";
import { brl, dt, num, pct } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/metas")({
  head: () => ({
    meta: [
      { title: "Metas — MINASCOLOR CONTROL" },
      { name: "description", content: "Metas mensal, semanal e diária por vendedor e categoria, com ritmo necessário." },
      { property: "og:title", content: "Metas — MINASCOLOR CONTROL" },
      { property: "og:description", content: "Meta acumulada, realizado, % atingido, valor restante e ritmo necessário." },
    ],
  }),
  component: MetasPage,
});

type TargetRow = {
  id: string;
  period_type: string;
  period_start: string;
  period_end: string;
  scope: string;
  metric: string;
  target_value: number;
  salesperson_id: string | null;
  category_id: string | null;
  salespeople: { name: string } | null;
  categories: { name: string } | null;
};

type SaleLite = {
  sold_at: string;
  total: number;
  gross_profit: number;
  salesperson_id: string | null;
  status: string;
};

function useTargets() {
  return useQuery({
    queryKey: ["targets"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("targets")
        .select(
          "id, period_type, period_start, period_end, scope, metric, target_value, salesperson_id, category_id, salespeople(name), categories(name)",
        )
        .order("period_start", { ascending: false })
        .limit(300);
      if (error) throw error;
      return (data ?? []) as unknown as TargetRow[];
    },
  });
}

function useSalesForTargets() {
  return useQuery({
    queryKey: ["sales", "targets"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("sold_at, total, gross_profit, salesperson_id, status")
        .limit(5000);
      if (error) throw error;
      return (data ?? []) as unknown as SaleLite[];
    },
  });
}

type Computed = TargetRow & {
  realized: number;
  achievedPct: number;
  remaining: number;
  daysTotal: number;
  daysElapsed: number;
  daysLeft: number;
  requiredPace: number | null;
  currentPace: number;
  projection: number;
  willHit: boolean;
};

function MetasPage() {
  const targets = useTargets();
  const sales = useSalesForTargets();
  const loading = targets.isLoading || sales.isLoading;

  const rows = useMemo<Computed[]>(() => {
    const list = targets.data ?? [];
    const allSales = (sales.data ?? []).filter((s) => s.status !== "cancelada");
    const now = new Date();

    return list.map((t) => {
      const start = new Date(t.period_start);
      const end = new Date(t.period_end);
      const inScope = allSales.filter((s) => {
        const d = new Date(s.sold_at);
        if (d < start || d > end) return false;
        if (t.salesperson_id && s.salesperson_id !== t.salesperson_id) return false;
        return true;
      });
      const realized = inScope.reduce(
        (acc, s) => acc + (t.metric === "lucro" ? s.gross_profit : t.metric === "vendas" ? 1 : s.total),
        0,
      );
      const daysTotal = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1);
      const daysElapsed = Math.min(
        daysTotal,
        Math.max(0, Math.round((now.getTime() - start.getTime()) / 86_400_000) + 1),
      );
      const daysLeft = Math.max(0, daysTotal - daysElapsed);
      const remaining = Math.max(0, t.target_value - realized);
      const currentPace = daysElapsed > 0 ? realized / daysElapsed : 0;
      const projection = currentPace * daysTotal;
      return {
        ...t,
        realized,
        achievedPct: t.target_value > 0 ? (realized / t.target_value) * 100 : 0,
        remaining,
        daysTotal,
        daysElapsed,
        daysLeft,
        requiredPace: daysLeft > 0 ? remaining / daysLeft : null,
        currentPace,
        projection,
        willHit: projection >= t.target_value,
      };
    });
  }, [targets.data, sales.data]);

  const totals = useMemo(() => {
    const active = rows.filter((r) => r.daysLeft > 0);
    return {
      total: rows.length,
      active: active.length,
      atRisk: rows.filter((r) => !r.willHit && r.daysLeft > 0).length,
      hit: rows.filter((r) => r.achievedPct >= 100).length,
    };
  }, [rows]);

  return (
    <div>
      <PageHeader
        title="Metas"
        description="Meta acumulada, realizado, % atingido, valor restante, dias restantes e ritmo necessário — tudo calculado sobre vendas reais."
      />

      {loading ? (
        <TableSkeleton />
      ) : rows.length === 0 ? (
        <InsufficientData
          what="Nenhuma meta cadastrada. Sem meta não existe % de atingimento, ritmo necessário nem projeção — e nada disso será estimado."
          hints={[
            "Cadastre metas por período (mensal, semanal ou diária)",
            "Defina o escopo: loja, vendedor ou categoria",
            "Informe a métrica: faturamento, lucro ou nº de vendas",
          ]}
        />
      ) : (
        <>
          <MetricStrip
            metrics={[
              { label: "Metas cadastradas", value: num(totals.total) },
              { label: "Em andamento", value: num(totals.active) },
              { label: "Já atingidas", value: num(totals.hit), tone: "success" },
              { label: "Em risco no ritmo atual", value: num(totals.atRisk), tone: totals.atRisk ? "danger" : undefined },
            ]}
          />

          <DataTable
            rows={rows}
            getKey={(r) => r.id}
            columns={[
              {
                key: "scope",
                header: "Meta",
                cell: (r) => (
                  <div>
                    <p className="font-medium">
                      {r.salespeople?.name ?? r.categories?.name ?? "Loja"} · {r.metric}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {r.period_type} · {dt(r.period_start)} a {dt(r.period_end)}
                    </p>
                  </div>
                ),
              },
              {
                key: "target",
                header: "Meta",
                align: "right",
                cell: (r) => (r.metric === "vendas" ? num(r.target_value) : brl(r.target_value)),
              },
              {
                key: "real",
                header: "Realizado",
                align: "right",
                cell: (r) => (r.metric === "vendas" ? num(r.realized) : brl(r.realized)),
              },
              { key: "pctm", header: "% atingido", align: "right", cell: (r) => pct(r.achievedPct) },
              {
                key: "rest",
                header: "Falta",
                align: "right",
                cell: (r) => (r.metric === "vendas" ? num(r.remaining) : brl(r.remaining)),
              },
              { key: "days", header: "Dias restantes", align: "right", cell: (r) => num(r.daysLeft) },
              {
                key: "pace",
                header: "Ritmo necessário/dia",
                align: "right",
                cell: (r) =>
                  r.requiredPace === null
                    ? "Período encerrado"
                    : r.metric === "vendas"
                      ? num(r.requiredPace, 1)
                      : brl(r.requiredPace),
              },
              {
                key: "verdict",
                header: "Leitura",
                cell: (r) => (
                  <div className="min-w-56">
                    <ClassBadge
                      tone={r.achievedPct >= 100 ? "verde" : r.willHit ? "amarelo" : "vermelho"}
                      label={r.achievedPct >= 100 ? "Atingida" : r.willHit ? "No ritmo" : "Fora do ritmo"}
                    />
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {r.achievedPct >= 100
                        ? "Meta já atingida no período."
                        : r.willHit
                          ? `No ritmo atual (${r.metric === "vendas" ? num(r.currentPace, 1) : brl(r.currentPace)}/dia) a meta será atingida.`
                          : `No ritmo atual (${r.metric === "vendas" ? num(r.currentPace, 1) : brl(r.currentPace)}/dia) a meta NÃO será atingida — projeção de ${r.metric === "vendas" ? num(r.projection) : brl(r.projection)}.`}
                    </p>
                  </div>
                ),
              },
            ]}
          />
        </>
      )}
    </div>
  );
}
