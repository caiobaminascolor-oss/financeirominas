import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Archive, Bot, CalendarDays, Check, ChevronLeft, FileBarChart, Loader2, Menu, MessageSquarePlus, Send, ShieldCheck, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { archiveAgentConversation, decideAgentAction, getAgentConversation, listAgentConversations, sendAgentMessage } from "@/lib/agent.functions";
import type { AgentAction, AgentConversation, AgentMessage } from "@/lib/agent.server";

export const Route = createFileRoute("/_authenticated/agente")({
  head: () => ({
    meta: [
      { title: "Agente Controller — MINASCOLOR CONTROL" },
      { name: "description", content: "Gerente Virtual conectado aos dados reais por consultas estruturadas e auditáveis." },
      { property: "og:title", content: "Agente Controller — MINASCOLOR CONTROL" },
      { property: "og:description", content: "Gerente Virtual conectado aos dados reais por consultas estruturadas e auditáveis." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AgentePage,
});

type ReportType = "daily" | "weekly" | "monthly";

function AgentePage() {
  const listFn = useServerFn(listAgentConversations);
  const getFn = useServerFn(getAgentConversation);
  const sendFn = useServerFn(sendAgentMessage);
  const decideFn = useServerFn(decideAgentAction);
  const archiveFn = useServerFn(archiveAgentConversation);
  const [conversations, setConversations] = useState<AgentConversation[]>([]);
  const [conversationId, setConversationId] = useState<string>();
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [actions, setActions] = useState<AgentAction[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const refreshList = useCallback(async () => {
    const rows = await listFn();
    setConversations(rows);
    return rows;
  }, [listFn]);

  const openConversation = useCallback(async (id: string) => {
    setLoadingHistory(true);
    try {
      const result = await getFn({ data: { conversationId: id } });
      setConversationId(id);
      setMessages(result.messages);
      setActions(result.actions);
      setSidebarOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível abrir a conversa.");
    } finally {
      setLoadingHistory(false);
    }
  }, [getFn]);

  useEffect(() => {
    refreshList().then((rows) => {
      const first = rows[0];
      if (first) {
        void openConversation(first.id);
      } else {
        setLoadingHistory(false);
      }
    }).catch(() => setLoadingHistory(false));
  }, [refreshList, openConversation]);

  useEffect(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), [messages, actions, loading]);

  const startNew = () => {
    setConversationId(undefined);
    setMessages([]);
    setActions([]);
    setSidebarOpen(false);
    setLoadingHistory(false);
  };

  async function submit(message: string, report?: ReportType) {
    const clean = message.trim();
    if (!clean || loading) return;
    const optimistic: AgentMessage = { id: `temp-${Date.now()}`, role: "user", content: clean, created_at: new Date().toISOString(), tool_calls: null, tool_results: null };
    setMessages((current) => [...current, optimistic]);
    setText("");
    setLoading(true);
    try {
      const result = await sendFn({ data: { ...(conversationId ? { conversationId } : {}), message: clean, ...(report ? { report } : {}) } });
      setConversationId(result.conversationId);
      setMessages((current) => [...current.filter((item) => item.id !== optimistic.id), optimistic, result.message]);
      const createdAction = result.action;
      if (createdAction) setActions((current) => [createdAction, ...current]);
      await refreshList();
    } catch (error) {
      setMessages((current) => current.filter((item) => item.id !== optimistic.id));
      toast.error(error instanceof Error ? error.message : "O agente não conseguiu concluir a análise.");
    } finally {
      setLoading(false);
    }
  }

  async function decide(actionId: string, approve: boolean) {
    try {
      const result = await decideFn({ data: { actionId, approve } });
      setActions((current) => current.map((action) => action.id === actionId ? { ...action, status: result.status, result: "result" in result ? result.result : action.result } : action));
      toast.success(approve ? "Alteração aplicada e registrada na auditoria." : "Alteração rejeitada.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível concluir a ação.");
    }
  }

  async function archive(id: string) {
    await archiveFn({ data: { conversationId: id } });
    startNew();
    await refreshList();
    toast.success("Conversa arquivada.");
  }

  const pendingActions = actions.filter((action) => action.status === "PENDENTE");

  return (
    <div className="flex min-h-[calc(100vh-8rem)] flex-col">
      <PageHeader
        title="Agente Controller"
        description="Gerente Virtual conectado aos dados reais por consultas estruturadas e auditáveis."
        actions={<Button variant="outline" size="sm" className="lg:hidden" onClick={() => setSidebarOpen(true)}><Menu /> Conversas</Button>}
      />

      <div className="relative grid min-h-0 flex-1 overflow-hidden rounded-md border border-border bg-card lg:grid-cols-[260px_minmax(0,1fr)]">
        {sidebarOpen && <div className="fixed inset-0 z-40 bg-foreground/20 lg:hidden" onClick={() => setSidebarOpen(false)} />}
        <aside className={cn("absolute inset-y-0 left-0 z-50 flex w-[280px] flex-col border-r border-border bg-card transition-transform lg:static lg:w-auto lg:translate-x-0", sidebarOpen ? "translate-x-0" : "-translate-x-full")}>
          <div className="flex items-center gap-2 border-b border-border p-3">
            <Button className="flex-1" size="sm" onClick={startNew}><MessageSquarePlus /> Nova conversa</Button>
            <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Fechar conversas" onClick={() => setSidebarOpen(false)}><ChevronLeft /></Button>
          </div>
          <ScrollArea className="min-h-0 flex-1">
            <div className="space-y-1 p-2">
              {conversations.length === 0 && <p className="px-3 py-8 text-center text-xs text-muted-foreground">Nenhuma conversa ainda.</p>}
              {conversations.map((conversation) => (
                <div key={conversation.id} className={cn("group flex items-center rounded-md", conversation.id === conversationId && "bg-muted")}>
                  <button onClick={() => openConversation(conversation.id)} className="min-w-0 flex-1 px-3 py-2.5 text-left text-sm">
                    <span className="block truncate font-medium">{conversation.title || "Nova conversa"}</span>
                    <span className="mt-0.5 block text-[11px] text-muted-foreground">{conversation.last_message_at ? new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(conversation.last_message_at)) : "Sem mensagens"}</span>
                  </button>
                  <Button variant="ghost" size="icon" className="mr-1 size-8 opacity-0 group-hover:opacity-100" aria-label="Arquivar conversa" onClick={() => archive(conversation.id)}><Archive /></Button>
                </div>
              ))}
            </div>
          </ScrollArea>
        </aside>

        <section className="flex min-w-0 flex-col bg-background">
          <div className="flex flex-wrap gap-2 border-b border-border p-3">
            <ReportButton icon={CalendarDays} label="Fechamento do Dia" disabled={loading} onClick={() => submit("Gere o fechamento gerencial de hoje com base nos dados reais disponíveis.", "daily")} />
            <ReportButton icon={FileBarChart} label="Relatório Semanal" disabled={loading} onClick={() => submit("Gere o relatório gerencial desta semana com base nos dados reais disponíveis.", "weekly")} />
            <ReportButton icon={Sparkles} label="Relatório Mensal" disabled={loading} onClick={() => submit("Gere o relatório gerencial deste mês com base nos dados reais disponíveis.", "monthly")} />
          </div>

          <ScrollArea className="h-[52vh] min-h-[360px] flex-1">
            <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
              {loadingHistory ? (
                <div className="flex h-56 items-center justify-center"><Loader2 className="size-5 animate-spin text-primary" /></div>
              ) : messages.length === 0 ? (
                <Welcome onPrompt={submit} />
              ) : (
                <div className="space-y-5">
                  {messages.map((message) => <MessageBubble key={message.id} message={message} />)}
                  {pendingActions.map((action) => <ActionCard key={action.id} action={action} onDecide={decide} />)}
                  {loading && <div className="flex items-center gap-3 text-sm text-muted-foreground"><span className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-primary"><Bot className="size-4" /></span><Loader2 className="size-4 animate-spin" /> Consultando dados e analisando...</div>}
                  <div ref={endRef} />
                </div>
              )}
            </div>
          </ScrollArea>

          <form className="border-t border-border bg-card p-3 sm:p-4" onSubmit={(event: FormEvent) => { event.preventDefault(); submit(text); }}>
            <div className="mx-auto flex max-w-4xl items-end gap-2">
              <Textarea value={text} onChange={(event) => setText(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); submit(text); } }} placeholder="Pergunte sobre vendas, margem, caixa, estoque, metas ou peça uma ação..." className="max-h-40 min-h-11 resize-none bg-background" disabled={loading} />
              <Button type="submit" size="icon" className="size-11 shrink-0" aria-label="Enviar mensagem" disabled={loading || !text.trim()}>{loading ? <Loader2 className="animate-spin" /> : <Send />}</Button>
            </div>
            <p className="mx-auto mt-2 max-w-4xl text-center text-[11px] text-muted-foreground">Números vêm de consultas controladas. Alterações exigem sua confirmação.</p>
          </form>
        </section>
      </div>
    </div>
  );
}

function ReportButton({ icon: Icon, label, disabled, onClick }: { icon: typeof CalendarDays; label: string; disabled: boolean; onClick: () => void }) {
  return <Button variant="outline" size="sm" disabled={disabled} onClick={onClick}><Icon /> {label}</Button>;
}

function Welcome({ onPrompt }: { onPrompt: (text: string) => void }) {
  const prompts = ["Quais são os 5 problemas mais urgentes agora?", "Como estão faturamento, lucro e margem nos últimos 30 dias?", "Mostre os produtos com maior capital parado.", "Há risco de caixa nos próximos 30 dias?"];
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center py-8 text-center">
      <span className="flex size-12 items-center justify-center rounded-md bg-primary text-primary-foreground"><Bot className="size-6" /></span>
      <h2 className="mt-4 font-display text-xl font-bold">O que precisa ser decidido hoje?</h2>
      <p className="mt-2 max-w-lg text-sm text-muted-foreground">Eu consulto os dados autorizados da empresa antes de responder. Se a base não sustentar uma conclusão, direi exatamente o que falta.</p>
      <div className="mt-6 grid w-full gap-2 sm:grid-cols-2">
        {prompts.map((prompt) => <Button key={prompt} variant="outline" className="h-auto justify-start whitespace-normal py-3 text-left" onClick={() => onPrompt(prompt)}>{prompt}</Button>)}
      </div>
      <div className="mt-6 flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck className="size-4 text-success" /> Consultas com permissão por papel e histórico auditável</div>
    </div>
  );
}

function MessageBubble({ message }: { message: AgentMessage }) {
  const assistant = message.role === "assistant";
  const tools = Array.isArray(message.tool_calls) ? message.tool_calls.filter((item): item is string => typeof item === "string") : [];
  return (
    <article className={cn("flex gap-3", !assistant && "justify-end")}>
      {assistant && <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><Bot className="size-4" /></span>}
      <div className={cn("max-w-[88%] rounded-md px-4 py-3 text-sm leading-6", assistant ? "border border-border bg-card text-foreground" : "bg-primary text-primary-foreground")}>
        <div className="whitespace-pre-wrap">{message.content}</div>
        {assistant && tools.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5 border-t border-border pt-2">{tools.map((tool) => <span key={tool} className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">{tool}</span>)}</div>}
      </div>
    </article>
  );
}

function ActionCard({ action, onDecide }: { action: AgentAction; onDecide: (id: string, approve: boolean) => void }) {
  const payload = action.payload && typeof action.payload === "object" && !Array.isArray(action.payload) ? action.payload as Record<string, unknown> : {};
  return (
    <div className="ml-11 border-l-4 border-warning bg-warning/10 p-4">
      <div className="flex items-center gap-2 text-sm font-bold"><ShieldCheck className="size-4 text-warning" /> Confirmação obrigatória</div>
      <p className="mt-2 text-sm">Atualizar estoque de <strong>{String(payload["productName"] ?? "produto")}</strong>: <strong>{String(payload["previousQuantity"] ?? "—")}</strong> → <strong>{String(payload["newQuantity"] ?? "—")}</strong>.</p>
      <p className="mt-1 text-xs text-muted-foreground">A alteração só será aplicada depois da confirmação e ficará registrada na auditoria.</p>
      <div className="mt-3 flex gap-2"><Button size="sm" onClick={() => onDecide(action.id, true)}><Check /> Confirmar</Button><Button size="sm" variant="outline" onClick={() => onDecide(action.id, false)}><X /> Rejeitar</Button></div>
    </div>
  );
}
