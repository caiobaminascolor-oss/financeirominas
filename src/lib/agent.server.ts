import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";

type Client = SupabaseClient<Database>;
type Role = Database["public"]["Enums"]["app_role"];
export type AgentMessage = { id: string; role: string; content: string | null; created_at: string; tool_calls: Json | null; tool_results: Json | null };
export type AgentConversation = { id: string; title: string | null; last_message_at: string | null; archived: boolean };
export type AgentAction = { id: string; action_type: string; status: string; payload: Json; result: Json | null; created_at: string };
export type AgentTurn = { conversationId: string; message: AgentMessage; action?: AgentAction };

type ToolResult = { tool: string; sufficient: boolean; inconsistent?: boolean; accessDenied?: boolean; period?: string; data: Json; missing?: string[] };
type UserContext = { userId: string; storeId: string | null; roles: Role[]; canSeeFinance: boolean };

const FINANCE_ROLES: Role[] = ["ADMIN", "GERENTE", "FINANCEIRO"];
const STOCK_WRITE_ROLES: Role[] = ["ADMIN", "GERENTE", "ESTOQUE"];
const MODEL = "google/gemini-3-flash-preview";
const DAY = 86_400_000;

const SYSTEM_PROMPT = `Você é o Gerente Virtual + Controller da MINASCOLOR CONTROL. Sua função é transformar dados em decisões.
REGRAS INVIOLÁVEIS:
- Nunca invente números. Todo número citado deve estar literalmente presente nos RESULTADOS DAS FERRAMENTAS.
- Comece sempre pela conclusão.
- Diferencie FATURAMENTO, LUCRO, CAIXA, MARGEM, MARKUP, CMV, RECEBIMENTO e ESTOQUE.
- Se o usuário confundir conceitos, diga "Você está errado neste ponto" e explique objetivamente.
- Quando sufficient=false, responda com a expressão literal "DADOS INSUFICIENTES" e diga o que falta.
- Quando inconsistent=true, responda com a expressão literal "INCONSISTÊNCIA DETECTADA" e explique o conflito.
- Identifique DADO REAL, ESTIMATIVA, PROJEÇÃO e HIPÓTESE. Nunca apresente projeção como fato.
- Para problemas, use: O QUE / POR QUE / IMPACTO / O QUE FAZER / O QUE NÃO FAZER / PRIORIDADE (P1 a P4).
- Prioridades: caixa, margem, estoque, produtividade, faturamento, lucro, crescimento.
- Seja direto, crítico, imparcial e estratégico. Não tente agradar.
- Não afirme ter alterado dados. Alterações só ocorrem após confirmação humana fora da IA.`;

function isoDaysAgo(days: number) {
  return new Date(Date.now() - days * DAY).toISOString();
}
function total(rows: Array<Record<string, unknown>>, key: string) {
  return rows.reduce((sum, row) => sum + Number(row[key] ?? 0), 0);
}
function safeTitle(text: string) {
  return text.trim().replace(/\s+/g, " ").slice(0, 72) || "Nova conversa";
}
async function getContext(client: Client, userId: string): Promise<UserContext> {
  const [{ data: profile }, { data: roleRows }] = await Promise.all([
    client.from("profiles").select("store_id").eq("id", userId).maybeSingle(),
    client.from("user_roles").select("role").eq("user_id", userId),
  ]);
  const roles = (roleRows ?? []).map((row) => row.role);
  return { userId, storeId: profile?.store_id ?? null, roles, canSeeFinance: roles.some((role) => FINANCE_ROLES.includes(role)) };
}
function scoped(query: any, storeId: string | null) {
  return storeId ? query.eq("store_id", storeId) : query;
}
function denied(tool: string): ToolResult {
  return { tool, sufficient: false, accessDenied: true, data: {}, missing: ["Permissão financeira: ADMIN, GERENTE ou FINANCEIRO"] };
}

async function getSales(client: Client, ctx: UserContext, days = 30): Promise<ToolResult> {
  const since = isoDaysAgo(days);
  const { data, error } = await scoped(client.from("sales").select("id,sale_number,sold_at,total,cost_total,gross_profit,margin_pct,discount_amount,status,payment_method,customer_id,salesperson_id").gte("sold_at", since).order("sold_at", { ascending: false }).limit(500), ctx.storeId);
  if (error) throw error;
  const rows = (data ?? []).filter((row) => row.status.toLowerCase() !== "cancelada");
  const revenue = total(rows, "total");
  const profit = total(rows, "gross_profit");
  return { tool: "get_sales", sufficient: rows.length > 0, period: `${days} dias`, missing: rows.length ? undefined : ["Vendas no período"], data: { count: rows.length, revenue, cost: total(rows, "cost_total"), grossProfit: profit, marginPct: revenue > 0 ? profit / revenue * 100 : null, averageTicket: rows.length ? revenue / rows.length : null, discount: total(rows, "discount_amount"), rows: rows.slice(0, 50) } };
}
async function getSaleDetails(client: Client, ctx: UserContext, query: string): Promise<ToolResult> {
  const number = query.match(/(?:venda|pedido)\s*(?:n[º°o.]*)?\s*([\w-]+)/i)?.[1];
  let request = client.from("sales").select("id,sale_number,sold_at,total,cost_total,gross_profit,margin_pct,discount_amount,status,payment_method,customers(name),salespeople(name),sale_items(quantity,unit_price,unit_cost,discount_amount,total,products(name,sku))").limit(10);
  if (number) request = request.ilike("sale_number", `%${number}%`);
  const { data, error } = await scoped(request, ctx.storeId);
  if (error) throw error;
  return { tool: "get_sale_details", sufficient: (data ?? []).length > 0, missing: data?.length ? undefined : ["Número ou venda correspondente"], data: { rows: data ?? [] } };
}
async function getProducts(client: Client, ctx: UserContext, query: string): Promise<ToolResult> {
  const brand = query.match(/marca\s+([\p{L}\d][\p{L}\d .-]{1,30})/iu)?.[1]?.replace(/\s+(?:e|com|que|agora).*$/i, "");
  let request = client.from("products").select("id,sku,name,brand,unit,cost_price,sale_price,min_stock,max_stock,active,categories(name),suppliers(name,lead_time_days)").limit(100);
  if (brand) request = request.ilike("brand", `%${brand}%`);
  const { data, error } = await scoped(request, ctx.storeId);
  if (error) throw error;
  return { tool: "get_products", sufficient: (data ?? []).length > 0, missing: data?.length ? undefined : ["Produtos cadastrados"], data: { count: data?.length ?? 0, rows: data ?? [], appliedFilters: { brand: brand ?? null } } };
}
async function getInventory(client: Client, ctx: UserContext): Promise<ToolResult> {
  const { data, error } = await scoped(client.from("inventory").select("id,product_id,quantity,reserved_quantity,avg_cost,location,last_movement_at,products(name,sku,brand,min_stock,max_stock,sale_price)").limit(500), ctx.storeId);
  if (error) throw error;
  const rows = data ?? [];
  return { tool: "get_inventory", sufficient: rows.length > 0, missing: rows.length ? undefined : ["Posição de estoque"], inconsistent: rows.some((row) => Number(row.quantity) < 0), data: { count: rows.length, totalCapital: rows.reduce((s, row) => s + Number(row.quantity) * Number(row.avg_cost), 0), negativeCount: rows.filter((row) => Number(row.quantity) < 0).length, rows: rows.slice(0, 100) } };
}
async function getInventoryMovements(client: Client, ctx: UserContext, days = 90): Promise<ToolResult> {
  const { data, error } = await scoped(client.from("inventory_movements").select("id,product_id,movement_type,quantity,unit_cost,occurred_at,notes,products(name,sku)").gte("occurred_at", isoDaysAgo(days)).order("occurred_at", { ascending: false }).limit(300), ctx.storeId);
  if (error) throw error;
  return { tool: "get_inventory_movements", sufficient: (data ?? []).length > 0, period: `${days} dias`, missing: data?.length ? undefined : ["Movimentações de estoque"], data: { count: data?.length ?? 0, rows: data ?? [] } };
}
async function getStockTurnover(client: Client, ctx: UserContext): Promise<ToolResult> {
  const [inventory, items] = await Promise.all([
    scoped(client.from("inventory").select("product_id,quantity,avg_cost,products(name,sku,min_stock,max_stock)"), ctx.storeId),
    client.from("sale_items").select("product_id,quantity,total,sales!inner(sold_at,status,store_id)").gte("sales.sold_at", isoDaysAgo(365)).limit(3000),
  ]);
  if (inventory.error) throw inventory.error;
  if (items.error) throw items.error;
  const sales = (items.data ?? []).filter((item) => !ctx.storeId || item.sales?.store_id === ctx.storeId).filter((item) => item.sales?.status.toLowerCase() !== "cancelada");
  const sold = new Map<string, number>();
  for (const item of sales) if (item.product_id) sold.set(item.product_id, (sold.get(item.product_id) ?? 0) + Number(item.quantity));
  const rows = (inventory.data ?? []).map((row) => { const qty = Number(row.quantity); const annual = sold.get(row.product_id) ?? 0; const daily = annual / 365; return { productId: row.product_id, product: row.products?.name, sku: row.products?.sku, quantity: qty, sold365: annual, turnover: qty > 0 ? annual / qty : null, coverageDays: daily > 0 ? qty / daily : null, capital: qty * Number(row.avg_cost) }; }).sort((a,b) => b.capital - a.capital);
  return { tool: "get_stock_turnover", sufficient: rows.length > 0 && sales.length > 0, missing: rows.length ? (sales.length ? undefined : ["Histórico de vendas dos produtos"]) : ["Estoque cadastrado"], data: { count: rows.length, rows: rows.slice(0, 100) } };
}
async function getFinance(client: Client, ctx: UserContext): Promise<ToolResult[]> {
  if (!ctx.canSeeFinance) return [denied("get_accounts_payable"), denied("get_accounts_receivable"), denied("get_cash_flow"), denied("get_expenses")];
  const [ap, ar, cash, expenses] = await Promise.all([
    scoped(client.from("accounts_payable").select("id,description,amount,due_date,paid_at,paid_amount,status,suppliers(name)").order("due_date").limit(500), ctx.storeId),
    scoped(client.from("accounts_receivable").select("id,description,amount,due_date,received_at,received_amount,status,customers(name)").order("due_date").limit(500), ctx.storeId),
    scoped(client.from("cash_transactions").select("id,transaction_date,direction,amount,category,description,payment_method").order("transaction_date", { ascending: false }).limit(1000), ctx.storeId),
    scoped(client.from("expenses").select("id,expense_date,category,description,amount,recurring").gte("expense_date", isoDaysAgo(90).slice(0,10)).limit(1000), ctx.storeId),
  ]);
  for (const result of [ap, ar, cash, expenses]) if (result.error) throw result.error;
  const payableRows = ap.data ?? [], receivableRows = ar.data ?? [], cashRows = cash.data ?? [], expenseRows = expenses.data ?? [];
  const balance = cashRows.reduce((s, row) => s + (row.direction.toLowerCase().includes("entrada") ? Number(row.amount) : -Number(row.amount)), 0);
  const horizons = [7,15,30,60,90].map((days) => { const until = new Date(Date.now() + days * DAY).toISOString().slice(0,10); const incoming = receivableRows.filter((r) => !r.received_at && r.due_date <= until).reduce((s,r) => s + Number(r.amount) - Number(r.received_amount ?? 0), 0); const outgoing = payableRows.filter((r) => !r.paid_at && r.due_date <= until).reduce((s,r) => s + Number(r.amount) - Number(r.paid_amount ?? 0), 0); return { days, startingBalance: balance, incoming, outgoing, pessimistic: balance + incoming * .75 - outgoing, base: balance + incoming - outgoing, optimistic: balance + incoming * 1.1 - outgoing }; });
  return [
    { tool: "get_accounts_payable", sufficient: payableRows.length > 0, data: { openTotal: payableRows.filter(r=>!r.paid_at).reduce((s,r)=>s+Number(r.amount)-Number(r.paid_amount??0),0), rows: payableRows.slice(0,100) }, missing: payableRows.length ? undefined : ["Contas a pagar"] },
    { tool: "get_accounts_receivable", sufficient: receivableRows.length > 0, data: { openTotal: receivableRows.filter(r=>!r.received_at).reduce((s,r)=>s+Number(r.amount)-Number(r.received_amount??0),0), rows: receivableRows.slice(0,100) }, missing: receivableRows.length ? undefined : ["Contas a receber"] },
    { tool: "get_cash_flow", sufficient: cashRows.length > 0, data: { currentBalance: balance, projections: horizons, assumptions: { pessimistic: "75% dos recebimentos previstos", base: "100% dos recebimentos previstos", optimistic: "110% dos recebimentos previstos", formula: "saldo inicial + entradas - saídas" }, rows: cashRows.slice(0,100) }, missing: cashRows.length ? undefined : ["Lançamentos de caixa"] },
    { tool: "get_expenses", sufficient: expenseRows.length > 0, period: "90 dias", data: { total: total(expenseRows, "amount"), rows: expenseRows.slice(0,100) }, missing: expenseRows.length ? undefined : ["Despesas"] },
  ];
}
async function getEntityList(client: Client, ctx: UserContext, tool: string): Promise<ToolResult> {
  const map: Record<string, { table: "customers"|"quotes"|"salespeople"|"targets"|"purchases"|"suppliers"|"discounts"|"alerts"; select: string }> = {
    get_customers: { table: "customers", select: "id,name,city,segment,status,first_purchase_at,last_purchase_at" },
    get_quotes: { table: "quotes", select: "id,quote_number,issued_at,valid_until,total,status,converted_sale_id,customers(name),salespeople(name)" },
    get_salespeople: { table: "salespeople", select: "id,name,commission_rate,active" },
    get_targets: { table: "targets", select: "id,period_type,period_start,period_end,scope,metric,target_value,salesperson_id,category_id" },
    get_purchases: { table: "purchases", select: "id,purchase_number,ordered_at,received_at,total,status,suppliers(name)" },
    get_suppliers: { table: "suppliers", select: "id,name,lead_time_days,payment_terms,active" },
    get_discounts: { table: "discounts", select: "id,discount_pct,discount_amount,below_cost,notes,created_at,products(name,sku),salespeople(name)" },
    get_alerts: { table: "alerts", select: "id,priority,category,title,message,status,created_at,resolved_at" },
  };
  if (["get_purchases","get_discounts"].includes(tool) && !ctx.roles.some((role) => ["ADMIN","GERENTE","FINANCEIRO","ESTOQUE"].includes(role))) return denied(tool);
  const spec = map[tool];
  const { data, error } = await scoped(client.from(spec.table).select(spec.select).limit(300), ctx.storeId);
  if (error) throw error;
  return { tool, sufficient: (data ?? []).length > 0, missing: data?.length ? undefined : [`Dados de ${tool.replace("get_", "").replaceAll("_", " ")}`], data: { count: data?.length ?? 0, rows: data ?? [] } };
}
function chooseTools(message: string, report?: string) {
  if (report) return ["get_sales","get_stock_turnover","get_finance","get_targets","get_alerts","get_quotes","get_discounts"];
  const q = message.toLowerCase();
  const tools = new Set<string>();
  if (/venda|fatur|lucro|margem|cmv|ticket|receita|compar/.test(q)) tools.add("get_sales");
  if (/detalhe|pedido|nota/.test(q)) tools.add("get_sale_details");
  if (/produto|marca|preço/.test(q)) tools.add("get_products");
  if (/estoque|ruptura|capital parado|excesso|cobertura|giro/.test(q)) { tools.add("get_inventory"); tools.add("get_stock_turnover"); }
  if (/movimenta/.test(q)) tools.add("get_inventory_movements");
  if (/caixa|pagar|receber|despesa|dívida|finance|projeção|recebimento/.test(q)) tools.add("get_finance");
  if (/cliente|recompra|inativ|vip|cross|upsell/.test(q)) tools.add("get_customers");
  if (/orçamento|pipeline|conversão/.test(q)) tools.add("get_quotes");
  if (/vendedor|equipe|performance|produtividade|comissão/.test(q)) tools.add("get_salespeople");
  if (/meta|ritmo|ating/.test(q)) tools.add("get_targets");
  if (/compra|fornecedor|repor|reposição/.test(q)) { tools.add("get_purchases"); tools.add("get_suppliers"); tools.add("get_stock_turnover"); }
  if (/desconto|abaixo do custo/.test(q)) tools.add("get_discounts");
  if (/alerta|anomalia|problema|prioridade|risco/.test(q)) { tools.add("get_alerts"); tools.add("get_inventory"); tools.add("get_sales"); }
  if (!tools.size) { tools.add("get_sales"); tools.add("get_inventory"); tools.add("get_alerts"); }
  return [...tools];
}
async function executeTools(client: Client, ctx: UserContext, names: string[], message: string): Promise<ToolResult[]> {
  const results: ToolResult[] = [];
  for (const name of names) {
    if (name === "get_sales") results.push(await getSales(client, ctx, 30));
    else if (name === "get_sale_details") results.push(await getSaleDetails(client, ctx, message));
    else if (name === "get_products") results.push(await getProducts(client, ctx, message));
    else if (name === "get_inventory") results.push(await getInventory(client, ctx));
    else if (name === "get_inventory_movements") results.push(await getInventoryMovements(client, ctx));
    else if (name === "get_stock_turnover") results.push(await getStockTurnover(client, ctx));
    else if (name === "get_finance") results.push(...await getFinance(client, ctx));
    else results.push(await getEntityList(client, ctx, name));
  }
  return results;
}
function reportInstruction(report?: string) {
  if (report === "daily") return "Produza FECHAMENTO DO DIA e termine obrigatoriamente com o título '3 PRIORIDADES DE AMANHÃ' e exatamente 3 prioridades.";
  if (report === "weekly") return "Produza RELATÓRIO SEMANAL e termine obrigatoriamente com o título 'PLANO DA PRÓXIMA SEMANA'.";
  if (report === "monthly") return "Produza RELATÓRIO MENSAL, inclua RESUMO EXECUTIVO de no máximo 10 linhas e termine com '10 DECISÕES MAIS IMPORTANTES DO PRÓXIMO MÊS'.";
  return "Responda à pergunta do usuário usando exclusivamente os resultados abaixo.";
}
async function callAI(question: string, history: AgentMessage[], results: ToolResult[], report?: string) {
  const key = process.env["LOVABLE_API_KEY"];
  const insufficient = results.length === 0 || results.every((result) => !result.sufficient);
  const inconsistent = results.some((result) => result.inconsistent);
  if (!key) return deterministicAnswer(results, insufficient, inconsistent);
  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: MODEL, temperature: 0.15, messages: [
    { role: "system", content: SYSTEM_PROMPT },
    ...history.slice(-8).map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content ?? "" })),
    { role: "user", content: `${reportInstruction(report)}\n\nPERGUNTA: ${question}\n\nRESULTADOS DAS FERRAMENTAS (única fonte numérica):\n${JSON.stringify(results)}\n\nVEREDITO DO CONTROLADOR: insufficient=${insufficient}; inconsistent=${inconsistent}.` },
  ] }) });
  if (!response.ok) throw new Error("O Gerente Virtual não conseguiu concluir a análise agora.");
  const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }>; usage?: { total_tokens?: number } };
  let content = payload.choices?.[0]?.message?.content?.trim() || deterministicAnswer(results, insufficient, inconsistent);
  if (insufficient && !content.includes("DADOS INSUFICIENTES")) content = `DADOS INSUFICIENTES\n\n${content}`;
  if (inconsistent && !content.includes("INCONSISTÊNCIA DETECTADA")) content = `INCONSISTÊNCIA DETECTADA\n\n${content}`;
  return { content, tokens: payload.usage?.total_tokens ?? null };
}
function deterministicAnswer(results: ToolResult[], insufficient: boolean, inconsistent: boolean) {
  const missing = [...new Set(results.flatMap((result) => result.missing ?? []))];
  const prefix = inconsistent ? "INCONSISTÊNCIA DETECTADA" : insufficient ? "DADOS INSUFICIENTES" : "Conclusão: os dados foram consultados, mas a análise automática está temporariamente indisponível.";
  return { content: `${prefix}${missing.length ? `\n\nFalta: ${missing.join("; ")}.` : ""}`, tokens: null };
}
function parseStockAction(message: string) {
  const match = message.match(/(?:atualiz\w*|ajust\w*|altere?)\s+(?:o\s+)?estoque\s+(?:do\s+produto\s+)?(.+?)\s+(?:para|em)\s+(-?\d+(?:[.,]\d+)?)/i);
  return match ? { productSearch: match[1].trim(), quantity: Number(match[2].replace(",", ".")) } : null;
}

export async function listConversations(client: Client, userId: string) {
  const { data, error } = await client.from("agent_conversations").select("id,title,last_message_at,archived").eq("user_id", userId).eq("archived", false).order("last_message_at", { ascending: false, nullsFirst: false }).limit(50);
  if (error) throw error;
  return (data ?? []) as AgentConversation[];
}
export async function getConversation(client: Client, userId: string, conversationId: string) {
  const { data: conversation, error } = await client.from("agent_conversations").select("id,title,last_message_at,archived").eq("id", conversationId).eq("user_id", userId).maybeSingle();
  if (error) throw error;
  if (!conversation) throw new Error("Conversa não encontrada.");
  const [{ data: messages, error: me }, { data: actions, error: ae }] = await Promise.all([
    client.from("agent_messages").select("id,role,content,created_at,tool_calls,tool_results").eq("conversation_id", conversationId).order("created_at"),
    client.from("agent_actions").select("id,action_type,status,payload,result,created_at").eq("conversation_id", conversationId).order("created_at", { ascending: false }),
  ]);
  if (me) throw me; if (ae) throw ae;
  return { conversation: conversation as AgentConversation, messages: (messages ?? []) as AgentMessage[], actions: (actions ?? []) as AgentAction[] };
}
export async function sendMessage(client: Client, userId: string, input: { conversationId?: string; message: string; report?: string }): Promise<AgentTurn> {
  const ctx = await getContext(client, userId);
  let conversationId = input.conversationId;
  if (conversationId) {
    const { data } = await client.from("agent_conversations").select("id").eq("id", conversationId).eq("user_id", userId).maybeSingle();
    if (!data) throw new Error("Conversa não encontrada.");
  } else {
    const { data, error } = await client.from("agent_conversations").insert({ user_id: userId, store_id: ctx.storeId, title: safeTitle(input.report ? ({daily:"Fechamento do Dia",weekly:"Relatório Semanal",monthly:"Relatório Mensal"}[input.report] ?? input.message) : input.message), created_by: userId, last_message_at: new Date().toISOString() }).select("id").single();
    if (error) throw error; conversationId = data.id;
  }
  const { data: userMessage, error: userError } = await client.from("agent_messages").insert({ conversation_id: conversationId, role: "user", content: input.message, created_by: userId }).select("id").single();
  if (userError) throw userError;
  const { data: history } = await client.from("agent_messages").select("id,role,content,created_at,tool_calls,tool_results").eq("conversation_id", conversationId).order("created_at", { ascending: false }).limit(10);
  const tools = chooseTools(input.message, input.report);
  const results = await executeTools(client, ctx, tools, input.message);
  const answer = await callAI(input.message, ((history ?? []) as AgentMessage[]).reverse(), results, input.report);
  const { data: assistant, error: assistantError } = await client.from("agent_messages").insert({ conversation_id: conversationId, role: "assistant", content: answer.content, model: MODEL, tokens: answer.tokens, tool_calls: tools as Json, tool_results: results as unknown as Json, created_by: userId }).select("id,role,content,created_at,tool_calls,tool_results").single();
  if (assistantError) throw assistantError;
  await client.from("agent_conversations").update({ last_message_at: new Date().toISOString() }).eq("id", conversationId);
  let action: AgentAction | undefined;
  const parsed = parseStockAction(input.message);
  if (parsed) {
    if (!ctx.roles.some((role) => STOCK_WRITE_ROLES.includes(role))) throw new Error("Seu papel não permite alterar estoque.");
    const { data: products } = await scoped(client.from("products").select("id,name,sku").or(`name.ilike.%${parsed.productSearch}%,sku.ilike.%${parsed.productSearch}%`).limit(2), ctx.storeId);
    if (products?.length === 1) {
      const product = products[0];
      const { data: current } = await scoped(client.from("inventory").select("id,quantity").eq("product_id", product.id).limit(2), ctx.storeId);
      if (current?.length === 1) {
        const { data: created, error } = await client.from("agent_actions").insert({ conversation_id: conversationId, message_id: userMessage.id, action_type: "UPDATE_INVENTORY", status: "PENDENTE", payload: { inventoryId: current[0].id, productId: product.id, productName: product.name, sku: product.sku, previousQuantity: current[0].quantity, newQuantity: parsed.quantity }, created_by: userId }).select("id,action_type,status,payload,result,created_at").single();
        if (error) throw error; action = created as AgentAction;
      }
    }
  }
  return { conversationId, message: assistant as AgentMessage, ...(action ? { action } : {}) };
}
export async function applyAction(client: Client, userId: string, actionId: string, approve: boolean) {
  const ctx = await getContext(client, userId);
  const { data: action, error } = await client.from("agent_actions").select("id,action_type,status,payload,conversation_id").eq("id", actionId).maybeSingle();
  if (error) throw error; if (!action || action.status !== "PENDENTE") throw new Error("Ação não está pendente.");
  if (!approve) { const { error: rejectError } = await client.from("agent_actions").update({ status: "REJEITADA", result: { rejected: true }, applied_at: new Date().toISOString(), applied_by: userId }).eq("id", actionId); if (rejectError) throw rejectError; return { status: "REJEITADA" }; }
  if (action.action_type !== "UPDATE_INVENTORY" || !ctx.roles.some((role) => STOCK_WRITE_ROLES.includes(role))) throw new Error("Ação não permitida para seu papel.");
  const payload = action.payload as { inventoryId?: string; newQuantity?: number; previousQuantity?: number; productName?: string };
  if (!payload.inventoryId || typeof payload.newQuantity !== "number") throw new Error("Ação inválida.");
  const { data: current } = await scoped(client.from("inventory").select("id,quantity").eq("id", payload.inventoryId).maybeSingle(), ctx.storeId);
  if (!current || Number(current.quantity) !== Number(payload.previousQuantity)) throw new Error("INCONSISTÊNCIA DETECTADA: o estoque mudou desde a proposta. Gere uma nova ação.");
  const { error: updateError } = await client.from("inventory").update({ quantity: payload.newQuantity, created_by: userId }).eq("id", payload.inventoryId);
  if (updateError) throw updateError;
  const result = { previousQuantity: current.quantity, newQuantity: payload.newQuantity, productName: payload.productName };
  const { error: actionError } = await client.from("agent_actions").update({ status: "APLICADA", result, applied_at: new Date().toISOString(), applied_by: userId }).eq("id", actionId);
  if (actionError) throw actionError;
  return { status: "APLICADA", result };
}
export async function archiveConversation(client: Client, userId: string, conversationId: string) {
  const { error } = await client.from("agent_conversations").update({ archived: true }).eq("id", conversationId).eq("user_id", userId);
  if (error) throw error;
  return { ok: true };
}
