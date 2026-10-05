import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/layout/PageHeader";
import { InsufficientData, TableSkeleton } from "@/components/InsufficientData";
import { MetricStrip } from "@/components/MetricStrip";
import { DataTable } from "@/components/DataTable";
import { ClassBadge } from "@/components/ClassBadge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDiscounts } from "@/lib/data";
import { brl, dt, num, pct } from "@/lib/format";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/descontos")({
  head: () => ({ meta: [
    { title: "Descontos — MINASCOLOR CONTROL" },
    { name: "description", content: "Descontos concedidos, impacto na margem, vendas abaixo do custo e aprovações." },
    { property: "og:title", content: "Descontos — MINASCOLOR CONTROL" },
    { property: "og:description", content: "Controle de descontos por vendedor e produto, com alertas de margem." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: DescontosPage,
});

function DescontosPage() {
  const { canSeeFinance } = useAuth();
  const discounts = useDiscounts();
  const [filter, setFilter] = useState("todos");
  const rows = useMemo(() => (discounts.data ?? []).filter((d) => {
    if (filter === "abaixo" && !d.below_cost) return false;
    if (filter === "sem-aprovacao" && d.approved_by) return false;
    return true;
  }), [discounts.data, filter]);

  if (!canSeeFinance) return <Shell><div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">Seu perfil não tem permissão para ver descontos e impacto financeiro.</div></Shell>;
  if (discounts.isLoading) return <Shell><TableSkeleton /></Shell>;
  if ((discounts.data ?? []).length === 0) return <Shell><InsufficientData what="Nenhum desconto detalhado na base. Sem o registro por item não é possível medir impacto na margem nem identificar venda abaixo do custo." hints={["Importe descontos vinculados à venda, produto e vendedor", "Informe percentual, valor, aprovação e se ficou abaixo do custo"]} /></Shell>;

  const all = discounts.data ?? [];
  const amount = all.reduce((s, d) => s + d.discount_amount, 0);
  const below = all.filter((d) => d.below_cost);
  const withoutApproval = all.filter((d) => !d.approved_by);

  return <Shell>
    <MetricStrip metrics={[
      { label: "Desconto concedido", value: brl(amount) },
      { label: "Registros de desconto", value: num(all.length) },
      { label: "Abaixo do custo", value: num(below.length), tone: below.length ? "danger" : undefined, hint: brl(below.reduce((s, d) => s + d.discount_amount, 0)) },
      { label: "Sem aprovação registrada", value: num(withoutApproval.length), tone: withoutApproval.length ? "warning" : undefined },
    ]} />
    <div className="mb-4">
      <Select value={filter} onValueChange={setFilter}><SelectTrigger className="w-56"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Todos os descontos</SelectItem><SelectItem value="abaixo">Abaixo do custo</SelectItem><SelectItem value="sem-aprovacao">Sem aprovação</SelectItem></SelectContent></Select>
    </div>
    <DataTable rows={[...rows].sort((a,b) => b.created_at.localeCompare(a.created_at))} getKey={(r) => r.id} columns={[
      { key: "data", header: "Data", cell: (r) => dt(r.created_at) },
      { key: "prod", header: "Produto", cell: (r) => <div><p>{r.products?.name ?? "—"}</p><p className="text-xs text-muted-foreground">{r.products?.sku ?? "sem código"}</p></div> },
      { key: "vend", header: "Vendedor", cell: (r) => r.salespeople?.name ?? "—" },
      { key: "pct", header: "% desconto", align: "right", cell: (r) => pct(r.discount_pct) },
      { key: "val", header: "Valor", align: "right", cell: (r) => brl(r.discount_amount) },
      { key: "custo", header: "Preço x custo", cell: (r) => r.below_cost ? <ClassBadge tone="vermelho" label="Abaixo do custo" title="A venda destruiu margem bruta." /> : <ClassBadge tone="verde" label="Acima do custo" /> },
      { key: "aprov", header: "Aprovação", cell: (r) => r.approved_by ? <ClassBadge tone="verde" label="Aprovado" /> : <ClassBadge tone="amarelo" label="Sem registro" /> },
      { key: "obs", header: "Observação", cell: (r) => <span className="text-xs text-muted-foreground">{r.notes ?? "—"}</span> },
    ]} />
  </Shell>;
}

function Shell({ children }: { children: React.ReactNode }) { return <div><PageHeader title="Descontos" description="Desconto não é apenas redução de faturamento: aqui é medido o impacto na margem e a venda abaixo do custo." />{children}</div>; }
