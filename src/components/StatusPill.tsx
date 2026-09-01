import { cn } from "@/lib/utils";

export type KpiStatus = "bom" | "atencao" | "problema" | "sem-dados";

const MAP: Record<KpiStatus, { label: string; dot: string; text: string; bg: string }> = {
  bom: { label: "BOM", dot: "bg-success", text: "text-success", bg: "bg-success/10" },
  atencao: { label: "ATENÇÃO", dot: "bg-warning", text: "text-warning", bg: "bg-warning/15" },
  problema: { label: "PROBLEMA", dot: "bg-danger", text: "text-danger", bg: "bg-danger/10" },
  "sem-dados": {
    label: "SEM DADOS",
    dot: "bg-muted-foreground",
    text: "text-muted-foreground",
    bg: "bg-muted",
  },
};

export function StatusPill({ status, className }: { status: KpiStatus; className?: string }) {
  const s = MAP[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide",
        s.bg,
        s.text,
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", s.dot)} />
      {s.label}
    </span>
  );
}
