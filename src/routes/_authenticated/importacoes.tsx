import { createFileRoute } from "@tanstack/react-router";
import { Upload } from "lucide-react";
import { ModulePage } from "@/components/ModulePage";

export const Route = createFileRoute("/_authenticated/importacoes")({
  head: () => ({
    meta: [
      { title: "Importações — MINASCOLOR CONTROL" },
      { name: "description", content: "Upload de PDF, Excel, CSV e XLSX com histórico, erros, avisos e conciliação." },
      { property: "og:title", content: "Importações — MINASCOLOR CONTROL" },
      { property: "og:description", content: "Upload de PDF, Excel, CSV e XLSX com histórico, erros, avisos e conciliação." },
    ],
  }),
  component: ImportacoesPage,
});

function ImportacoesPage() {
  return (
    <ModulePage
      title="Importações"
      description="Upload de PDF, Excel, CSV e XLSX com histórico, erros, avisos e conciliação."
      icon={Upload}
      emptyTitle="Importação disponível na Fase 4"
      emptyDescription="O motor de extração e conciliação (estoque × vendas, produto duplicado, estoque negativo, divergência de custo) será construído na Fase 4."
      hints={["Formatos previstos: PDF, XLS, XLSX e CSV", "Entidades: produtos, vendas, estoque, compras, clientes, fornecedores, financeiro e orçamentos", "Cada importação registra status, linhas processadas, erros e avisos"]}
    />
  );
}
