import { StatusPill, type KpiStatus } from "@/components/StatusPill";

export type Kpi = {
  label: string;
  value: string;
  target?: string;
  previous?: string;
  variation?: string;
  status: KpiStatus;
  hint?: string;
};

export function KpiCard({ kpi }: { kpi: Kpi }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-xs">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {kpi.label}
        </p>
        <StatusPill status={kpi.status} />
      </div>
      <p className="tabular mt-3 text-2xl font-bold">{kpi.value}</p>
      <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-border pt-3 text-[11px]">
        <div>
          <dt className="text-muted-foreground">Meta</dt>
          <dd className="tabular font-medium">{kpi.target ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Per. anterior</dt>
          <dd className="tabular font-medium">{kpi.previous ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Variação</dt>
          <dd className="tabular font-medium">{kpi.variation ?? "—"}</dd>
        </div>
      </dl>
    </div>
  );
}
