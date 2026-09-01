import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, type AppRole } from "@/hooks/use-auth";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ROLES: AppRole[] = ["ADMIN", "GERENTE", "VENDEDOR", "FINANCEIRO", "ESTOQUE"];

export const Route = createFileRoute("/_authenticated/configuracoes")({
  head: () => ({
    meta: [
      { title: "Configurações — MINASCOLOR CONTROL" },
      {
        name: "description",
        content: "Usuários, papéis de acesso e parâmetros do MINASCOLOR CONTROL.",
      },
      { property: "og:title", content: "Configurações — MINASCOLOR CONTROL" },
      {
        property: "og:description",
        content: "Gestão de papéis ADMIN, GERENTE, VENDEDOR, FINANCEIRO e ESTOQUE.",
      },
    ],
  }),
  component: ConfiguracoesPage,
});

function ConfiguracoesPage() {
  const { hasRole, user } = useAuth();
  const isAdmin = hasRole("ADMIN");
  const qc = useQueryClient();

  const { data: people } = useQuery({
    queryKey: ["team"],
    queryFn: async () => {
      const [{ data: profiles }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("id, full_name, email, active"),
        supabase.from("user_roles").select("user_id, role"),
      ]);
      return (profiles ?? []).map((p) => ({
        ...p,
        roles: (roles ?? []).filter((r) => r.user_id === p.id).map((r) => r.role as AppRole),
      }));
    },
  });

  const setRole = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: AppRole }) => {
      const { error: delErr } = await supabase.from("user_roles").delete().eq("user_id", userId);
      if (delErr) throw delErr;
      const { error } = await supabase.from("user_roles").insert({ user_id: userId, role });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Papel atualizado. A alteração ficou registrada na auditoria.");
      void qc.invalidateQueries({ queryKey: ["team"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div>
      <PageHeader
        title="Configurações"
        description="Usuários e papéis de acesso. Toda alteração de papel é registrada na trilha de auditoria com autor, valor anterior e novo."
      />

      <div className="rounded-xl border border-border bg-card">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold">Equipe e permissões</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            ADMIN: acesso total · GERENTE: gestão e financeiro · FINANCEIRO: caixa e contas ·
            ESTOQUE: produtos e estoque · VENDEDOR: operação comercial, sem dados financeiros
            sensíveis.
          </p>
        </div>
        <ul className="divide-y divide-border">
          {(people ?? []).map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {p.full_name || p.email}
                  {p.id === user?.id && (
                    <span className="ml-2 text-xs text-muted-foreground">(você)</span>
                  )}
                </p>
                <p className="truncate text-xs text-muted-foreground">{p.email}</p>
              </div>
              <div className="flex items-center gap-2">
                {p.roles.length === 0 && <Badge variant="outline">Sem papel</Badge>}
                {p.roles.map((r) => (
                  <Badge key={r} variant="secondary">
                    {r}
                  </Badge>
                ))}
              </div>
              {isAdmin && (
                <Select
                  value={p.roles[0] ?? ""}
                  onValueChange={(role) =>
                    setRole.mutate({ userId: p.id, role: role as AppRole })
                  }
                >
                  <SelectTrigger className="w-40" aria-label={`Papel de ${p.full_name ?? p.email}`}>
                    <SelectValue placeholder="Definir papel" />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </li>
          ))}
          {(people ?? []).length === 0 && (
            <li className="px-5 py-8 text-center text-sm text-muted-foreground">
              Nenhum usuário carregado.
            </li>
          )}
        </ul>
      </div>

      <div className="mt-6 rounded-xl border border-dashed border-border bg-card p-5">
        <h2 className="text-sm font-semibold">Integrações futuras</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          A arquitetura está preparada para ERP, Autcom, Citel, webhooks, N8N, Google Sheets e
          WhatsApp. Nenhuma integração é simulada aqui — elas serão conectadas quando as
          credenciais reais existirem.
        </p>
      </div>
    </div>
  );
}
