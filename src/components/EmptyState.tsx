import { Link } from "@tanstack/react-router";
import { Upload, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export function EmptyState({
  icon: Icon = Upload,
  title,
  description,
  hints,
}: {
  icon?: LucideIcon;
  title: string;
  description: string;
  hints?: string[];
}) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center">
      <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted">
        <Icon className="size-5 text-muted-foreground" />
      </div>
      <h3 className="mt-4 text-base font-semibold">{title}</h3>
      <p className="mx-auto mt-1 max-w-xl text-sm text-muted-foreground">{description}</p>
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
