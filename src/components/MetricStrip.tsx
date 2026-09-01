import { cn } from "@/lib/utils";

export type Metric = { label: string; value: string; hint?: string | undefined; tone?: "danger" | "success" | "warning" | undefined };

export function MetricStrip({ metrics, className }: { metrics: Metric[]; className?: string }) {
  return (
    <div
      className={cn(
        "mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
        className,
      )}
    >
      {metrics.map((m) => (
        <div key={m.label} className="rounded-xl border border-border bg-card p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {m.label}
          </p>
          <p
            className={cn(
              "tabular mt-1.5 text-xl font-bold",
              m.tone === "danger" && "text-danger",
              m.tone === "success" && "text-success",
              m.tone === "warning" && "text-warning",
            )}
          >
            {m.value}
          </p>
          {m.hint && <p className="mt-1 text-[11px] text-muted-foreground">{m.hint}</p>}
        </div>
      ))}
    </div>
  );
}
