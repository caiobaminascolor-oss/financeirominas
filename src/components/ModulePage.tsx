import type { LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/EmptyState";

export function ModulePage({
  title,
  description,
  icon,
  emptyTitle,
  emptyDescription,
  hints,
}: {
  title: string;
  description: string;
  icon?: LucideIcon;
  emptyTitle: string;
  emptyDescription: string;
  hints?: string[];
}) {
  return (
    <div>
      <PageHeader title={title} description={description} />
      <EmptyState
        {...(icon ? { icon } : {})}
        title={emptyTitle}
        description={emptyDescription}
        {...(hints ? { hints } : {})}
      />
    </div>
  );
}
