import { cn } from "@/lib/utils";

export type Tone = "verde" | "amarelo" | "laranja" | "vermelho" | "neutro";

const TONES: Record<Tone, string> = {
  verde: "bg-success/10 text-success",
  amarelo: "bg-warning/15 text-warning",
  laranja: "bg-accent/15 text-accent",
  vermelho: "bg-danger/10 text-danger",
  neutro: "bg-muted text-muted-foreground",
};

const DOTS: Record<Tone, string> = {
  verde: "bg-success",
  amarelo: "bg-warning",
  laranja: "bg-accent",
  vermelho: "bg-danger",
  neutro: "bg-muted-foreground",
};

export function ClassBadge({
  tone,
  label,
  className,
  title,
}: {
  tone: Tone;
  label: string;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title ?? ""}
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        TONES[tone],
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", DOTS[tone])} />
      {label}
    </span>
  );
}
