import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  ENTITIES,
  MAX_IMPORT_ROWS,
  canImport,
  normalizeHeader,
  summarize,
  validateRecords,
  type ImportEntity,
  type RawRecord,
  type ValidatedRow,
} from "./import-schema";
import { reconcile, type Finding } from "./reconciliation";

type Client = SupabaseClient<Database>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const FINANCE = ["ADMIN", "GERENTE", "FINANCEIRO"];

async function getContext(client: Client, userId: string) {
  const [{ data: profile }, { data: roleRows }] = await Promise.all([
    client.from("profiles").select("store_id").eq("id", userId).maybeSingle(),
    client.from("user_roles").select("role").eq("user_id", userId),
  ]);
  if (!profile) throw new Error("Perfil não encontrado.");
  const roles = (roleRows ?? []).map((r) => r.role as string);
  return { userId, storeId: profile?.store_id ?? null, roles, canSeeFinance: roles.some((r) => FINANCE.includes(r)) };
}
type Ctx = Awaited<ReturnType<typeof getContext>>;

const scoped = (q: Any, storeId: string | null) => (storeId ? q.eq("store_id", storeId) : q.is("store_id", null));
const key = (s: unknown) => (s == null ? "" : normalizeHeader(String(s)));
const digits = (s: unknown) => (s == null ? "" : String(s).replace(/\D/g, ""));
const round = (n: number) => Math.round(n * 100) / 100;

async function nameMap(client: Client, table: "customers" | "suppliers" | "salespeople" | "categories", ctx: Ctx) {
  const { data } = await scoped(client.from(table).select("id,name").limit(20000), ctx.storeId);
  return new Map<string, string>(((data ?? []) as Any[]).map((r) => [key(r.name), r.id]));
}

async function chunked<T>(items: T[], size: number, fn: (item: T) => Promise<void>) {
  for (let i = 0; i < items.length; i += size) await Promise.all(items.slice(i, i + size).map(fn));
}

function compact(obj: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== null && v !== undefined)) as Any;
}

type WriteResult = { inserted: number; updated: number; skipped: number };

class RowIssues {
  constructor(private rows: ValidatedRow[]) {}
  error(row: ValidatedRow, msg: string) { row.errors.push(msg); row.status = "ERRO"; }
  warn(row: ValidatedRow, msg: string) { row.warnings.push(msg); if (row.status === "OK") row.status = "AVISO"; }
  valid() { return this.rows.filter((r) => r.status !== "ERRO"); }
}

async function writeProducts(client: Client, ctx: Ctx, rows: ValidatedRow[], mode: string, issues: RowIssues, inventoryOnly: boolean): Promise<WriteResult> {
  const res: WriteResult = { inserted: 0, updated: 0, skipped: 0 };
  const { data: existing } = await scoped(client.from("products").select("id,sku").limit(20000), ctx.storeId);
  const bySku = new Map<string, string>(((existing ?? []) as Any[]).filter((p) => p.sku).map((p) => [key(p.sku), p.id]));
  const productIds = new Map<ValidatedRow, string>();

  if (!inventoryOnly) {
    const categories = await nameMap(client, "categories", ctx);
    const suppliers = await nameMap(client, "suppliers", ctx);
    const missingCats = [...new Set(issues.valid().map((r) => r.values["category"]).filter(Boolean).map(String))].filter((c) => !categories.has(key(c)));
    if (missingCats.length) {
      const { data } = await client.from("categories").insert(missingCats.map((name) => ({ name, store_id: ctx.storeId, created_by: ctx.userId }))).select("id,name");
      for (const c of data ?? []) categories.set(key(c.name), c.id);
    }
    const inserts: { row: ValidatedRow; payload: Any }[] = [];
    const updates: { row: ValidatedRow; id: string; payload: Any }[] = [];
    for (const row of issues.valid()) {
      const v = row.values;
      const supplier_id = v["supplier"] ? suppliers.get(key(v["supplier"])) : undefined;
      if (v["supplier"] && !supplier_id) issues.warn(row, `Fornecedor "${v["supplier"]}" não cadastrado — produto ficou sem fornecedor`);
      const payload = compact({
        sku: v["sku"], name: v["name"], brand: v["brand"], unit: v["unit"], barcode: v["barcode"],
        cost_price: v["cost_price"], sale_price: v["sale_price"], min_stock: v["min_stock"], max_stock: v["max_stock"],
        category_id: v["category"] ? categories.get(key(v["category"])) : undefined, supplier_id,
      });
      const id = bySku.get(key(v["sku"]));
      if (id) {
        if (mode === "insert") { issues.warn(row, "Produto já existe — ignorado (modo somente novos)"); res.skipped++; continue; }
        updates.push({ row, id, payload });
      } else inserts.push({ row, payload: { ...payload, store_id: ctx.storeId, created_by: ctx.userId } });
    }
    for (let i = 0; i < inserts.length; i += 500) {
      const batch = inserts.slice(i, i + 500);
      const { data, error } = await client.from("products").insert(batch.map((b) => b.payload)).select("id,sku");
      if (error) { batch.forEach((b) => issues.error(b.row, `Falha ao gravar: ${error.message}`)); continue; }
      const ids = new Map((data ?? []).map((p) => [key(p.sku), p.id]));
      batch.forEach((b) => { const id = ids.get(key(b.row.values["sku"])); if (id) { productIds.set(b.row, id); bySku.set(key(b.row.values["sku"]), id); } });
      res.inserted += batch.length;
    }
    await chunked(updates, 20, async (u) => {
      const { error } = await client.from("products").update(u.payload).eq("id", u.id);
      if (error) issues.error(u.row, `Falha ao atualizar: ${error.message}`);
      else { productIds.set(u.row, u.id); res.updated++; }
    });
  } else {
    for (const row of issues.valid()) {
      const id = bySku.get(key(row.values["sku"]));
      if (!id) issues.error(row, `Produto "${row.values["sku"]}" não cadastrado — importe produtos primeiro`);
      else productIds.set(row, id);
    }
  }

  // Inventory balances
  const withQty = issues.valid().filter((r) => typeof r.values["quantity"] === "number" && productIds.has(r));
  if (withQty.length) {
    const { data: inv } = await client.from("inventory").select("id,product_id").in("product_id", withQty.map((r) => productIds.get(r) ?? ""));
    const invByProduct = new Map((inv ?? []).map((i) => [i.product_id, i.id]));
    await chunked(withQty, 20, async (row) => {
      const product_id = productIds.get(row);
      if (!product_id) return;
      const payload = compact({ quantity: row.values["quantity"] as number, avg_cost: row.values["avg_cost"] ?? row.values["cost_price"], location: row.values["location"], last_movement_at: new Date().toISOString() });
      const invId = invByProduct.get(product_id);
      const { error } = invId
        ? await client.from("inventory").update(payload).eq("id", invId)
        : await client.from("inventory").insert({ ...payload, product_id, quantity: row.values["quantity"] as number, store_id: ctx.storeId, created_by: ctx.userId });
      if (error) issues.error(row, `Falha no saldo de estoque: ${error.message}`);
      else if (inventoryOnly) { if (invId) res.updated++; else res.inserted++; }
    });
  }
  return res;
}

async function writeParties(client: Client, ctx: Ctx, entity: "customers" | "suppliers", rows: ValidatedRow[], mode: string, issues: RowIssues): Promise<WriteResult> {
  const res: WriteResult = { inserted: 0, updated: 0, skipped: 0 };
  const docCol = entity === "customers" ? "doc" : "cnpj";
  const { data } = await scoped(client.from(entity).select(`id,name,${docCol}`).limit(20000), ctx.storeId);
  const byDoc = new Map<string, string>();
  const byName = new Map<string, string>();
  for (const r of (data ?? []) as Any[]) { if (digits(r[docCol])) byDoc.set(digits(r[docCol]), r.id); byName.set(key(r.name), r.id); }
  const inserts: { row: ValidatedRow; payload: Any }[] = [];
  await chunked(issues.valid(), 20, async (row) => {
    const v = row.values;
    const payload = compact(entity === "customers"
      ? { name: v["name"], doc: v["doc"], email: v["email"], phone: v["phone"], city: v["city"] }
      : { name: v["name"], cnpj: v["cnpj"], contact_name: v["contact_name"], email: v["email"], phone: v["phone"], lead_time_days: v["lead_time_days"], payment_terms: v["payment_terms"] });
    const id = (digits(v[docCol]) && byDoc.get(digits(v[docCol]))) || byName.get(key(v["name"]));
    if (!id) { inserts.push({ row, payload: { ...payload, store_id: ctx.storeId, created_by: ctx.userId } }); return; }
    if (mode === "insert") { issues.warn(row, "Já cadastrado — ignorado (modo somente novos)"); res.skipped++; return; }
    const { error } = await (client.from(entity) as Any).update(payload).eq("id", id);
    if (error) issues.error(row, `Falha ao atualizar: ${error.message}`); else res.updated++;
  });
  for (let i = 0; i < inserts.length; i += 500) {
    const batch = inserts.slice(i, i + 500);
    const { error } = await (client.from(entity) as Any).insert(batch.map((b) => b.payload));
    if (error) batch.forEach((b) => issues.error(b.row, `Falha ao gravar: ${error.message}`)); else res.inserted += batch.length;
  }
  return res;
}

function groupRows(rows: ValidatedRow[], field: string) {
  const groups = new Map<string, ValidatedRow[]>();
  for (const r of rows) { const k = String(r.values[field]); groups.set(k, [...(groups.get(k) ?? []), r]); }
  return groups;
}

async function productLookup(client: Client, ctx: Ctx) {
  const { data } = await scoped(client.from("products").select("id,sku,cost_price").limit(20000), ctx.storeId);
  return new Map<string, { id: string; cost: number }>(((data ?? []) as Any[]).filter((p) => p.sku).map((p) => [key(p.sku), { id: p.id, cost: Number(p.cost_price ?? 0) }]));
}

async function writeSales(client: Client, ctx: Ctx, rows: ValidatedRow[], issues: RowIssues): Promise<WriteResult> {
  const res: WriteResult = { inserted: 0, updated: 0, skipped: 0 };
  const [products, customers, sellers] = await Promise.all([productLookup(client, ctx), nameMap(client, "customers", ctx), nameMap(client, "salespeople", ctx)]);
  const { data: existing } = await scoped(client.from("sales").select("sale_number").not("sale_number", "is", null).limit(50000), ctx.storeId);
  const known = new Set(((existing ?? []) as Any[]).map((s) => key(s.sale_number)));
  const groups = groupRows(rows, "sale_number");
  for (const [number, lines] of groups) {
    if (lines.some((l) => l.status === "ERRO")) { lines.forEach((l) => l.status !== "ERRO" && issues.error(l, "Venda rejeitada: outra linha do mesmo documento tem erro")); continue; }
    if (known.has(key(number))) { lines.forEach((l) => issues.error(l, `Venda ${number} já importada`)); continue; }
    for (const l of lines) if (!products.get(key(l.values["sku"]))) issues.error(l, `Produto "${l.values["sku"]}" não cadastrado`);
    if (lines.some((l) => l.status === "ERRO")) { lines.forEach((l) => l.status !== "ERRO" && issues.error(l, "Venda rejeitada: produto inexistente em outra linha")); continue; }
    const head = lines[0].values;
    const customer_id = head["customer"] ? customers.get(key(head["customer"])) : undefined;
    const salesperson_id = head["salesperson"] ? sellers.get(key(head["salesperson"])) : undefined;
    if (head["customer"] && !customer_id) issues.warn(lines[0], `Cliente "${head["customer"]}" não cadastrado`);
    if (head["salesperson"] && !salesperson_id) issues.warn(lines[0], `Vendedor "${head["salesperson"]}" não cadastrado`);
    const items = lines.map((l) => {
      const p = products.get(key(l.values["sku"]));
      if (!p) throw new Error("Produto não encontrado");
      const quantity = l.values["quantity"] as number, unit_price = l.values["unit_price"] as number, discount_amount = (l.values["discount"] as number) ?? 0;
      const unit_cost = (l.values["unit_cost"] as number) ?? p.cost;
      if (l.values["unit_cost"] == null && !p.cost) issues.warn(l, "Custo desconhecido — margem desta linha não é confiável");
      const total = round(quantity * unit_price - discount_amount);
      return { product_id: p.id, quantity, unit_price, unit_cost, discount_amount, total, margin_pct: total > 0 ? round(((total - unit_cost * quantity) / total) * 100) : null };
    });
    const subtotal = round(items.reduce((s, i) => s + i.quantity * i.unit_price, 0));
    const total = round(items.reduce((s, i) => s + i.total, 0));
    const cost_total = round(items.reduce((s, i) => s + i.unit_cost * i.quantity, 0));
    const { error } = await client.rpc("import_document", { _entity: "sales", _header: compact({
      sale_number: number, sold_at: `${head["sold_at"]}T12:00:00Z`, customer_id, salesperson_id,
      payment_method: (head["payment_method"] as string) ?? null, status: head["status"] ? String(head["status"]).toLowerCase() : undefined,
      subtotal, discount_amount: round(subtotal - total), total, cost_total, gross_profit: round(total - cost_total),
      margin_pct: total > 0 ? round(((total - cost_total) / total) * 100) : null, store_id: ctx.storeId, created_by: ctx.userId,
    }), _items: items });
    if (error) { lines.forEach((l) => issues.error(l, `Falha ao gravar venda: ${error.message}`)); continue; }
    known.add(key(number));
    res.inserted++;
  }
  return res;
}

async function writePurchases(client: Client, ctx: Ctx, rows: ValidatedRow[], issues: RowIssues): Promise<WriteResult> {
  const res: WriteResult = { inserted: 0, updated: 0, skipped: 0 };
  const [products, suppliers] = await Promise.all([productLookup(client, ctx), nameMap(client, "suppliers", ctx)]);
  const { data: existing } = await scoped(client.from("purchases").select("purchase_number").not("purchase_number", "is", null).limit(50000), ctx.storeId);
  const known = new Set(((existing ?? []) as Any[]).map((s) => key(s.purchase_number)));
  for (const [number, lines] of groupRows(rows, "purchase_number")) {
    if (lines.some((l) => l.status === "ERRO")) { lines.forEach((l) => l.status !== "ERRO" && issues.error(l, "Compra rejeitada: outra linha do mesmo documento tem erro")); continue; }
    if (known.has(key(number))) { lines.forEach((l) => issues.error(l, `Compra ${number} já importada`)); continue; }
    const head = lines[0].values;
    const supplier_id = suppliers.get(key(head["supplier"]));
    if (!supplier_id) { lines.forEach((l) => issues.error(l, `Fornecedor "${head["supplier"]}" não cadastrado — importe fornecedores primeiro`)); continue; }
    for (const l of lines) if (!products.get(key(l.values["sku"]))) issues.error(l, `Produto "${l.values["sku"]}" não cadastrado`);
    if (lines.some((l) => l.status === "ERRO")) { lines.forEach((l) => l.status !== "ERRO" && issues.error(l, "Compra rejeitada: produto inexistente em outra linha")); continue; }
    const items = lines.map((l) => ({ product_id: products.get(key(l.values["sku"]))?.id ?? "", quantity: l.values["quantity"] as number, unit_cost: l.values["unit_cost"] as number, total: round((l.values["quantity"] as number) * (l.values["unit_cost"] as number)) }));
    const { error } = await client.rpc("import_document", { _entity: "purchases", _header: compact({
      purchase_number: number, supplier_id, ordered_at: `${head["ordered_at"]}T12:00:00Z`, received_at: head["received_at"] ? `${head["received_at"]}T12:00:00Z` : null,
      status: head["received_at"] ? "RECEBIDA" : "PENDENTE", total: round(items.reduce((s, i) => s + i.total, 0)), store_id: ctx.storeId, created_by: ctx.userId,
    }), _items: items });
    if (error) { lines.forEach((l) => issues.error(l, `Falha ao gravar compra: ${error.message}`)); continue; }
    known.add(key(number));
    res.inserted++;
  }
  return res;
}

async function writeFinance(client: Client, ctx: Ctx, entity: "accounts_payable" | "accounts_receivable" | "expenses", issues: RowIssues): Promise<WriteResult> {
  const res: WriteResult = { inserted: 0, updated: 0, skipped: 0 };
  const dateCol = entity === "expenses" ? "expense_date" : "due_date";
  const party = entity === "accounts_receivable" ? await nameMap(client, "customers", ctx) : await nameMap(client, "suppliers", ctx);
  const { data: existing } = await scoped((client.from(entity) as Any).select(`description,amount,${dateCol}`).limit(50000), ctx.storeId);
  const fp = (d: unknown, a: unknown, dt: unknown) => `${key(d)}|${Number(a).toFixed(2)}|${String(dt).slice(0, 10)}`;
  const known = new Set(((existing ?? []) as Any[]).map((r) => fp(r.description, r.amount, r[dateCol])));
  const payloads: { row: ValidatedRow; payload: Any }[] = [];
  for (const row of issues.valid()) {
    const v = row.values;
    const f = fp(v["description"], v["amount"], v[dateCol]);
    if (known.has(f)) { issues.warn(row, "Lançamento idêntico já existe — ignorado"); res.skipped++; continue; }
    known.add(f);
    const partyName = entity === "accounts_receivable" ? v["customer"] : v["supplier"];
    const partyId = partyName ? party.get(key(partyName)) : undefined;
    if (partyName && !partyId) issues.warn(row, `${entity === "accounts_receivable" ? "Cliente" : "Fornecedor"} "${partyName}" não cadastrado`);
    const base = { description: v["description"], amount: v["amount"], store_id: ctx.storeId, created_by: ctx.userId };
    const payload = entity === "accounts_payable"
      ? compact({ ...base, due_date: v["due_date"], supplier_id: partyId, document: v["document"], category: v["category"], paid_amount: v["paid_amount"], paid_at: v["paid_at"] ? `${v["paid_at"]}T12:00:00Z` : null, status: v["paid_at"] ? "PAGO" : undefined })
      : entity === "accounts_receivable"
        ? compact({ ...base, due_date: v["due_date"], customer_id: partyId, received_amount: v["received_amount"], received_at: v["received_at"] ? `${v["received_at"]}T12:00:00Z` : null, status: v["received_at"] ? "RECEBIDO" : undefined })
        : compact({ ...base, expense_date: v["expense_date"], category: v["category"], supplier_id: partyId });
    payloads.push({ row, payload });
  }
  for (let i = 0; i < payloads.length; i += 500) {
    const batch = payloads.slice(i, i + 500);
    const { error } = await (client.from(entity) as Any).insert(batch.map((b) => b.payload));
    if (error) batch.forEach((b) => issues.error(b.row, `Falha ao gravar: ${error.message}`)); else res.inserted += batch.length;
  }
  return res;
}

async function writeQuotes(client: Client, ctx: Ctx, mode: string, issues: RowIssues): Promise<WriteResult> {
  const res: WriteResult = { inserted: 0, updated: 0, skipped: 0 };
  const [customers, sellers] = await Promise.all([nameMap(client, "customers", ctx), nameMap(client, "salespeople", ctx)]);
  const { data: existing } = await scoped(client.from("quotes").select("id,quote_number").limit(50000), ctx.storeId);
  const byNumber = new Map(((existing ?? []) as Any[]).map((q) => [key(q.quote_number), q.id as string]));
  await chunked(issues.valid(), 20, async (row) => {
    const v = row.values;
    const customer_id = v["customer"] ? customers.get(key(v["customer"])) : undefined;
    const salesperson_id = v["salesperson"] ? sellers.get(key(v["salesperson"])) : undefined;
    if (v["customer"] && !customer_id) issues.warn(row, `Cliente "${v["customer"]}" não cadastrado`);
    if (v["salesperson"] && !salesperson_id) issues.warn(row, `Vendedor "${v["salesperson"]}" não cadastrado`);
    const payload = compact({ quote_number: v["quote_number"] as string, issued_at: `${v["issued_at"]}T12:00:00Z`, total: v["total"] as number, customer_id, salesperson_id, status: v["status"] ? String(v["status"]).toLowerCase() : undefined, valid_until: v["valid_until"] as string | null });
    const id = byNumber.get(key(v["quote_number"]));
    if (id) {
      if (mode === "insert") { issues.warn(row, "Orçamento já existe — ignorado"); res.skipped++; return; }
      const { error } = await client.from("quotes").update(payload).eq("id", id);
      if (error) issues.error(row, `Falha ao atualizar: ${error.message}`); else res.updated++;
    } else {
      const { error } = await client.from("quotes").insert({ ...payload, total: v["total"] as number, store_id: ctx.storeId, created_by: ctx.userId } as Any);
      if (error) issues.error(row, `Falha ao gravar: ${error.message}`); else res.inserted++;
    }
  });
  return res;
}

export type CommitInput = {
  entity: ImportEntity;
  fileName: string;
  fileType: string;
  mode: "insert" | "upsert";
  mapping: Record<string, string>;
  records: RawRecord[];
  base64: string;
  contentType: string;
  confirmed: true;
};

export async function previewImport(client: Client, userId: string, entity: ImportEntity, records: RawRecord[]) {
  const ctx = await getContext(client, userId);
  if (!canImport(entity, ctx.roles)) throw new Error("Seu papel não permite esta importação.");
  const rows = validateRecords(entity, records);
  const issues = new RowIssues(rows);
  if (["inventory", "sales", "purchases"].includes(entity)) {
    const products = await productLookup(client, ctx);
    for (const r of rows) if (r.status !== "ERRO" && !products.has(key(r.values["sku"]))) issues.error(r, `Produto "${r.values["sku"]}" não cadastrado`);
  }
  if (entity === "purchases") {
    const suppliers = await nameMap(client, "suppliers", ctx);
    for (const r of rows) if (r.status !== "ERRO" && !suppliers.has(key(r.values["supplier"]))) issues.error(r, `Fornecedor "${r.values["supplier"]}" não cadastrado`);
  }
  if (ENTITIES[entity].grouped) {
    const field = ENTITIES[entity].keyField;
    for (const group of groupRows(rows, field).values()) {
      const h = group[0];
      if (!h) continue;
      const shared = entity === "sales" ? ["sold_at", "customer", "salesperson", "status"] : ["ordered_at", "supplier", "received_at"];
      if (group.some((r) => shared.some((k) => r.values[k] !== h.values[k]))) group.forEach((r) => issues.error(r, "INCONSISTÊNCIA DETECTADA: cabeçalho diferente entre itens do documento"));
      if (group.some((r) => r.status === "ERRO")) group.filter((r) => r.status !== "ERRO").forEach((r) => issues.error(r, "Documento rejeitado: outra linha possui erro"));
    }
  }
  return rows;
}

export async function commitImport(client: Client, userId: string, input: CommitInput) {
  const ctx = await getContext(client, userId);
  if (!canImport(input.entity, ctx.roles)) throw new Error(`Seu papel não permite importar ${ENTITIES[input.entity].label}.`);
  if (input.records.length > MAX_IMPORT_ROWS) throw new Error(`Limite de ${MAX_IMPORT_ROWS} linhas por importação.`);

  const { data: imp, error: impErr } = await client.from("imports").insert({
    file_name: input.fileName, file_type: input.fileType, target_entity: input.entity, status: "PROCESSANDO",
    rows_total: input.records.length, started_at: new Date().toISOString(), write_mode: input.mode,
    column_mapping: input.mapping, store_id: ctx.storeId, created_by: userId,
  }).select("id").single();
  if (impErr || !imp) throw new Error(`Não foi possível registrar a importação: ${impErr?.message}`);

  try { await saveImportFile(client, userId, imp.id, input.fileName, input.base64, input.contentType); } catch (error) {
    await client.from("imports").update({ status: "FALHOU", finished_at: new Date().toISOString(), errors: [{ line: 0, messages: ["Arquivo original não guardado; nenhum dado importado."] }] }).eq("id", imp.id);
    throw error;
  }
  const rows = await previewImport(client, userId, input.entity, input.records);
  const issues = new RowIssues(rows);
  let result: WriteResult = { inserted: 0, updated: 0, skipped: 0 };
  let fatal: string | null = null;
  try {
    switch (input.entity) {
      case "products": result = await writeProducts(client, ctx, rows, input.mode, issues, false); break;
      case "inventory": result = await writeProducts(client, ctx, rows, input.mode, issues, true); break;
      case "customers": case "suppliers": result = await writeParties(client, ctx, input.entity, rows, input.mode, issues); break;
      case "sales": result = await writeSales(client, ctx, rows, issues); break;
      case "purchases": result = await writePurchases(client, ctx, rows, issues); break;
      case "accounts_payable": case "accounts_receivable": case "expenses": result = await writeFinance(client, ctx, input.entity, issues); break;
      case "quotes": result = await writeQuotes(client, ctx, input.mode, issues); break;
    }
  } catch (e) {
    fatal = e instanceof Error ? e.message : String(e);
    rows.forEach((r) => issues.error(r, "Processamento interrompido; confira o histórico antes de repetir."));
  }

  const s = summarize(rows);
  const errors = rows.filter((r) => r.errors.length).slice(0, 1000).map((r) => ({ line: r.line, messages: r.errors }));
  const warnings = rows.filter((r) => r.warnings.length).slice(0, 1000).map((r) => ({ line: r.line, messages: r.warnings }));
  if (fatal) errors.unshift({ line: 0, messages: [fatal] });
  const rejected = rows.filter((r) => r.status === "ERRO").slice(0, 2000).map((r) => ({ line: r.line, record: input.records[r.line - 2], errors: r.errors }));
  const status = fatal ? "FALHOU" : s.error === s.total && s.total > 0 ? "FALHOU" : s.error ? "CONCLUIDO_COM_ERROS" : "CONCLUIDO";

  const { error: historyError } = await client.from("imports").update({
    status, rows_ok: s.total - s.error, rows_error: s.error, rows_warning: s.warning,
    rows_inserted: result.inserted, rows_updated: result.updated, errors, warnings, rejected_rows: rejected,
    finished_at: new Date().toISOString(),
  }).eq("id", imp.id);

  if (historyError) throw new Error("Dados processados, mas o histórico não foi atualizado. Não repita sem conferir.");
  let reconciliation: { created: number; resolved: number; open: number } | null = null;
  try { reconciliation = await runReconciliationWith(client, ctx); } catch { reconciliation = null; }

  return { importId: imp.id, status, summary: s, ...result, reconciliation };
}

export async function saveImportFile(client: Client, userId: string, importId: string, fileName: string, base64: string, contentType: string) {
  const ctx = await getContext(client, userId);
  const { data: imp } = await client.from("imports").select("id,created_by,target_entity").eq("id", importId).maybeSingle();
  if (!imp || (imp.created_by !== userId && !ctx.roles.some((r) => ["ADMIN", "GERENTE"].includes(r)))) throw new Error("Importação não encontrada.");
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  if (bytes.byteLength > 10 * 1024 * 1024) throw new Error("Arquivo acima de 10 MB.");
  const path = `${ctx.storeId ?? "geral"}/${importId}/${fileName.replace(/[^\w.\-]+/g, "_")}`;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.storage.from("imports").upload(path, bytes, { contentType, upsert: true });
  if (error) throw new Error(`Falha ao guardar o arquivo: ${error.message}`);
  await client.from("imports").update({ file_path: path }).eq("id", importId);
  return { path };
}

export async function getImportFileUrl(client: Client, userId: string, importId: string) {
  // RLS: only staff can read the import row; then sign a short-lived URL.
  const ctx = await getContext(client, userId);
  const { data: imp } = await scoped(client.from("imports").select("file_path").eq("id", importId), ctx.storeId).maybeSingle();
  if (!imp?.file_path) throw new Error("Arquivo original não disponível.");
  const { data, error } = await client.storage.from("imports").createSignedUrl(imp.file_path, 300);
  if (error || !data) throw new Error("Não foi possível gerar o link.");
  return { url: data.signedUrl };
}

async function runReconciliationWith(client: Client, ctx: Ctx) {
  const [products, inventory, movements, sales, saleItems] = await Promise.all([
    scoped(client.from("products").select("id,sku,name,cost_price,active").limit(20000), ctx.storeId),
    scoped(client.from("inventory").select("product_id,quantity").limit(20000), ctx.storeId),
    scoped(client.from("inventory_movements").select("product_id,movement_type,quantity").limit(50000), ctx.storeId),
    scoped(client.from("sales").select("id,sale_number,total,discount_amount,status").gte("sold_at", new Date(Date.now() - 90 * 86400000).toISOString()).limit(10000), ctx.storeId),
    client.from("sale_items").select("sale_id,product_id,quantity,unit_price,unit_cost,total,discount_amount,sales!inner(sold_at,store_id)").gte("sales.sold_at", new Date(Date.now() - 90 * 86400000).toISOString()).limit(30000),
  ]);
  let purchaseItems: Any[] = [], payables: Any[] = [], receivables: Any[] = [];
  if (ctx.canSeeFinance) {
    const [pi, ap, ar] = await Promise.all([
      client.from("purchase_items").select("product_id,unit_cost,purchases!inner(ordered_at,store_id)").limit(30000),
      scoped(client.from("accounts_payable").select("id,supplier_id,description,amount").is("paid_at", null).limit(20000), ctx.storeId),
      scoped(client.from("accounts_receivable").select("id,customer_id,description,amount").is("received_at", null).limit(20000), ctx.storeId),
    ]);
    purchaseItems = ((pi.data ?? []) as Any[]).filter((i) => !ctx.storeId || i.purchases?.store_id === ctx.storeId).map((i) => ({ product_id: i.product_id, unit_cost: Number(i.unit_cost), ordered_at: i.purchases.ordered_at }));
    payables = (ap.data ?? []) as Any[];
    receivables = (ar.data ?? []) as Any[];
  }
  const findings = reconcile({
    products: (products.data ?? []) as Any[],
    inventory: ((inventory.data ?? []) as Any[]).map((i) => ({ product_id: i.product_id, quantity: Number(i.quantity) })),
    movements: ((movements.data ?? []) as Any[]).map((m) => ({ ...m, quantity: Number(m.quantity) })),
    sales: ((sales.data ?? []) as Any[]).map((s) => ({ ...s, total: Number(s.total), discount_amount: Number(s.discount_amount) })),
    saleItems: ((saleItems.data ?? []) as Any[]).filter((i) => !ctx.storeId || i.sales?.store_id === ctx.storeId).map((i) => ({ sale_id: i.sale_id, product_id: i.product_id, quantity: Number(i.quantity), unit_price: Number(i.unit_price), unit_cost: Number(i.unit_cost), total: Number(i.total), discount_amount: Number(i.discount_amount) })),
    purchaseItems, payables, receivables,
  });
  return persistFindings(client, ctx, findings);
}

async function persistFindings(client: Client, ctx: Ctx, findings: Finding[]) {
  const { data: open } = await scoped(client.from("alerts").select("id,dedup_key").eq("source", "conciliacao").eq("status", "ABERTO").limit(20000), ctx.storeId);
  const openKeys = new Map(((open ?? []) as Any[]).map((a) => [a.dedup_key as string, a.id as string]));
  const current = new Map(findings.map((f) => [`${ctx.storeId ?? "geral"}:${f.key}`, f]));
  // Finance-only rule keys are not re-evaluated for non-finance users: never auto-resolve them.
  const evaluatedPrefixes = ctx.canSeeFinance ? null : ["neg:", "dupsku:", "dupname:", "stockmov:", "saletotal:", "belowcost:"];
  const toInsert = [...current.entries()].filter(([k]) => !openKeys.has(k)).map(([k, f]) => ({
    title: f.title.slice(0, 200), message: f.problem, category: f.category, priority: f.priority, status: "ABERTO",
    entity_type: f.entity_type ?? null, entity_id: f.entity_id ?? null, dedup_key: k, source: "conciliacao",
    details: { cause: f.cause, impact: f.impact, solution: f.solution }, store_id: ctx.storeId, created_by: ctx.userId,
  }));
  for (let i = 0; i < toInsert.length; i += 500) await client.from("alerts").insert(toInsert.slice(i, i + 500));
  const stale = [...openKeys.entries()].filter(([k]) => !current.has(k) && (!evaluatedPrefixes || evaluatedPrefixes.some((p) => k.split(":").slice(1).join(":").startsWith(p)))).map(([, id]) => id);
  for (let i = 0; i < stale.length; i += 200) {
    await client.from("alerts").update({ status: "RESOLVIDO", resolved_at: new Date().toISOString(), resolved_by: ctx.userId }).in("id", stale.slice(i, i + 200));
  }
  return { created: toInsert.length, resolved: stale.length, open: current.size };
}

export async function runReconciliation(client: Client, userId: string) {
  const ctx = await getContext(client, userId);
  if (!ctx.roles.some((r) => ["ADMIN", "GERENTE", "FINANCEIRO", "ESTOQUE"].includes(r))) throw new Error("Seu papel não permite rodar a conciliação.");
  return runReconciliationWith(client, ctx);
}

export async function listImports(client: Client, userId: string) {
  const ctx = await getContext(client, userId);
  const { data, error } = await scoped(client.from("imports").select("id,file_name,file_type,target_entity,status,rows_total,rows_ok,rows_error,rows_warning,rows_inserted,rows_updated,created_at,created_by,file_path").order("created_at", { ascending: false }).limit(100), ctx.storeId);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getImport(client: Client, userId: string, id: string) {
  const ctx = await getContext(client, userId);
  const { data, error } = await scoped(client.from("imports").select("*").eq("id", id), ctx.storeId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return JSON.parse(JSON.stringify(data)) as Record<string, Any>;
}

export { extractPdfTable } from "./pdf-extraction.server";
