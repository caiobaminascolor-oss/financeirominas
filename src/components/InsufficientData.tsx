import { Link } from "@tanstack/react-router";
import { DatabaseZap } from "lucide-react";
import { Button } from "@/components/ui/button";

export function InsufficientData({
  what,
  hints,
}: {
  /** O que falta para o módulo funcionar. */
  what: string;
  hints?: string[];
}) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center">
      <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-danger/10">
        <DatabaseZap className="size-5 text-danger" />
      </div>
      <h3 className="mt-4 font-display text-base font-bold tracking-wide">DADOS INSUFICIENTES</h3>
      <p className="mx-auto mt-1 max-w-xl text-sm text-muted-foreground">{what}</p>
      {hints && hints.length > 0 && (
        <ul className="mx-auto mt-4 max-w-xl space-y-1 text-left text-sm text-muted-foreground">
          {hints.map((h) => (
            <li key={h} className="flex gap-2">
              <span className="text-accent">•</span>
              <span>{h}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-6">
        <Button asChild>
          <Link to="/importacoes">Importar dados</Link>
        </Button>
      </div>
    </div>
  );
}

export function TableSkeleton() {
  return (
    <div className="space-y-2">
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="h-10 animate-pulse rounded-md bg-muted" />
      ))}
    </div>
  );
}
