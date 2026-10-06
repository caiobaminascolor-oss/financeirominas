// Pure, isomorphic definitions and validation for data imports.
// Used by the browser (preview) and re-run on the server (never trust the client).

export type ImportRole = "ADMIN" | "GERENTE" | "VENDEDOR" | "FINANCEIRO" | "ESTOQUE";
export type FieldType = "text" | "number" | "integer" | "date";
export type ImportEntity =
  | "products"
  | "inventory"
  | "customers"
  | "suppliers"
  | "sales"
  | "purchases"
  | "accounts_payable"
  | "accounts_receivable"
  | "expenses"
  | "quotes";

export type FieldDef = {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  aliases: string[];
  min?: number;
};

export type EntityDef = {
  key: ImportEntity;
  label: string;
  description: string;
  roles: ImportRole[];
  /** Natural key used to group (multi-line documents) or upsert. */
  keyField: string;
  grouped?: boolean;
  fields: FieldDef[];
};

const ALL_ADMIN: ImportRole[] = ["ADMIN", "GERENTE"];
const STOCK: ImportRole[] = ["ADMIN", "GERENTE", "ESTOQUE"];
const FINANCE: ImportRole[] = ["ADMIN", "GERENTE", "FINANCEIRO"];

const f = (key: string, label: string, type: FieldType, aliases: string[], extra: Partial<FieldDef> = {}): FieldDef => ({ key, label, type, aliases, ...extra });

export const ENTITIES: Record<ImportEntity, EntityDef> = {
  products: {
    key: "products", label: "Produtos", description: "Cadastro com custo, preço, estoque mínimo/máximo e saldo atual.", roles: STOCK, keyField: "sku",
    fields: [
      f("sku", "Código", "text", ["codigo", "cod", "sku", "referencia", "ref", "cod produto", "codigo produto"], { required: true }),
      f("name", "Produto", "text", ["produto", "descricao", "nome", "descricao produto", "item"], { required: true }),
      f("category", "Categoria", "text", ["categoria", "grupo", "departamento", "linha"]),
      f("brand", "Marca", "text", ["marca", "fabricante"]),
      f("supplier", "Fornecedor", "text", ["fornecedor"]),
      f("unit", "Unidade", "text", ["unidade", "un", "und", "embalagem"]),
      f("barcode", "Código de barras", "text", ["ean", "codigo de barras", "gtin", "barras"]),
      f("cost_price", "Custo", "number", ["custo", "preco custo", "custo unitario", "preco de custo", "custo medio"], { min: 0 }),
      f("sale_price", "Preço de venda", "number", ["preco", "preco venda", "preco de venda", "valor venda", "pv"], { min: 0 }),
      f("min_stock", "Estoque mínimo", "number", ["estoque minimo", "minimo", "est min"], { min: 0 }),
      f("max_stock", "Estoque máximo", "number", ["estoque maximo", "maximo", "est max"], { min: 0 }),
      f("quantity", "Estoque atual", "number", ["estoque", "quantidade", "qtd", "saldo", "estoque atual", "qtde"]),
    ],
  },
  inventory: {
    key: "inventory", label: "Estoque (saldo)", description: "Atualiza saldo e custo médio de produtos já cadastrados.", roles: STOCK, keyField: "sku",
    fields: [
      f("sku", "Código", "text", ["codigo", "cod", "sku", "referencia", "ref", "cod produto"], { required: true }),
      f("quantity", "Quantidade", "number", ["quantidade", "qtd", "saldo", "estoque", "qtde", "estoque atual"], { required: true }),
      f("avg_cost", "Custo médio", "number", ["custo medio", "custo", "cmv unitario"], { min: 0 }),
      f("location", "Local", "text", ["local", "deposito", "localizacao"]),
    ],
  },
  customers: {
    key: "customers", label: "Clientes", description: "Cadastro de clientes; CPF/CNPJ evita duplicidade.", roles: ["ADMIN", "GERENTE", "FINANCEIRO"], keyField: "doc",
    fields: [
      f("name", "Nome", "text", ["nome", "cliente", "razao social", "nome cliente"], { required: true }),
      f("doc", "CPF/CNPJ", "text", ["cpf", "cnpj", "cpf cnpj", "documento", "doc"]),
      f("email", "E-mail", "text", ["email", "e-mail"]),
      f("phone", "Telefone", "text", ["telefone", "celular", "fone", "whatsapp"]),
      f("city", "Cidade", "text", ["cidade", "municipio"]),
    ],
  },
  suppliers: {
    key: "suppliers", label: "Fornecedores", description: "Cadastro com prazo de entrega e condição de pagamento.", roles: ["ADMIN", "GERENTE", "FINANCEIRO", "ESTOQUE"], keyField: "cnpj",
    fields: [
      f("name", "Nome", "text", ["nome", "fornecedor", "razao social"], { required: true }),
      f("cnpj", "CNPJ", "text", ["cnpj", "documento"]),
      f("contact_name", "Contato", "text", ["contato", "representante", "vendedor"]),
      f("email", "E-mail", "text", ["email", "e-mail"]),
      f("phone", "Telefone", "text", ["telefone", "fone", "celular"]),
      f("lead_time_days", "Prazo de entrega (dias)", "integer", ["prazo", "prazo entrega", "lead time", "prazo de entrega"], { min: 0 }),
      f("payment_terms", "Condição de pagamento", "text", ["condicao", "condicao pagamento", "prazo pagamento"]),
    ],
  },
  sales: {
    key: "sales", label: "Vendas (itens)", description: "Uma linha por item; linhas com o mesmo número formam uma venda.", roles: ALL_ADMIN, keyField: "sale_number", grouped: true,
    fields: [
      f("sale_number", "Nº da venda", "text", ["numero", "nº venda", "n venda", "venda", "pedido", "nota", "documento", "numero venda"], { required: true }),
      f("sold_at", "Data", "date", ["data", "data venda", "emissao", "data emissao"], { required: true }),
      f("sku", "Código do produto", "text", ["codigo", "cod", "sku", "cod produto", "referencia"], { required: true }),
      f("quantity", "Quantidade", "number", ["quantidade", "qtd", "qtde"], { required: true, min: 0.0001 }),
      f("unit_price", "Preço unitário", "number", ["preco", "preco unitario", "valor unitario", "vl unit", "unitario"], { required: true, min: 0 }),
      f("discount", "Desconto do item", "number", ["desconto", "desc", "valor desconto"], { min: 0 }),
      f("unit_cost", "Custo unitário", "number", ["custo", "custo unitario"], { min: 0 }),
      f("customer", "Cliente", "text", ["cliente", "nome cliente"]),
      f("salesperson", "Vendedor", "text", ["vendedor", "atendente"]),
      f("payment_method", "Forma de pagamento", "text", ["pagamento", "forma pagamento", "forma de pagamento"]),
      f("status", "Status", "text", ["status", "situacao"]),
    ],
  },
  purchases: {
    key: "purchases", label: "Compras (itens)", description: "Uma linha por item; linhas com o mesmo número formam um pedido.", roles: FINANCE, keyField: "purchase_number", grouped: true,
    fields: [
      f("purchase_number", "Nº da compra", "text", ["numero", "pedido", "nota", "nf", "numero compra", "documento"], { required: true }),
      f("ordered_at", "Data", "date", ["data", "data pedido", "emissao", "data compra"], { required: true }),
      f("supplier", "Fornecedor", "text", ["fornecedor"], { required: true }),
      f("sku", "Código do produto", "text", ["codigo", "cod", "sku", "cod produto", "referencia"], { required: true }),
      f("quantity", "Quantidade", "number", ["quantidade", "qtd", "qtde"], { required: true, min: 0.0001 }),
      f("unit_cost", "Custo unitário", "number", ["custo", "custo unitario", "valor unitario", "preco"], { required: true, min: 0 }),
      f("received_at", "Recebido em", "date", ["recebimento", "data recebimento", "entrada"]),
    ],
  },
  accounts_payable: {
    key: "accounts_payable", label: "Contas a pagar", description: "Títulos com vencimento; pagos informam data e valor pago.", roles: FINANCE, keyField: "document",
    fields: [
      f("description", "Descrição", "text", ["descricao", "historico", "titulo"], { required: true }),
      f("amount", "Valor", "number", ["valor", "valor titulo", "valor original"], { required: true, min: 0.01 }),
      f("due_date", "Vencimento", "date", ["vencimento", "data vencimento", "venc"], { required: true }),
      f("supplier", "Fornecedor", "text", ["fornecedor", "credor"]),
      f("document", "Documento", "text", ["documento", "nf", "boleto", "numero"]),
      f("category", "Categoria", "text", ["categoria", "plano de contas", "conta"]),
      f("paid_amount", "Valor pago", "number", ["valor pago", "pago"], { min: 0 }),
      f("paid_at", "Pago em", "date", ["data pagamento", "pagamento", "pago em"]),
    ],
  },
  accounts_receivable: {
    key: "accounts_receivable", label: "Contas a receber", description: "Títulos de clientes; recebidos informam data e valor.", roles: FINANCE, keyField: "description",
    fields: [
      f("description", "Descrição", "text", ["descricao", "historico", "titulo", "documento"], { required: true }),
      f("amount", "Valor", "number", ["valor", "valor titulo", "valor original"], { required: true, min: 0.01 }),
      f("due_date", "Vencimento", "date", ["vencimento", "data vencimento", "venc"], { required: true }),
      f("customer", "Cliente", "text", ["cliente", "devedor", "sacado"]),
      f("received_amount", "Valor recebido", "number", ["valor recebido", "recebido"], { min: 0 }),
      f("received_at", "Recebido em", "date", ["data recebimento", "recebimento", "recebido em"]),
    ],
  },
  expenses: {
    key: "expenses", label: "Despesas", description: "Despesas operacionais por data e categoria.", roles: FINANCE, keyField: "description",
    fields: [
      f("description", "Descrição", "text", ["descricao", "historico", "despesa"], { required: true }),
      f("amount", "Valor", "number", ["valor"], { required: true, min: 0.01 }),
      f("expense_date", "Data", "date", ["data", "data despesa", "competencia"], { required: true }),
      f("category", "Categoria", "text", ["categoria", "plano de contas", "tipo"]),
      f("supplier", "Fornecedor", "text", ["fornecedor"]),
    ],
  },
  quotes: {
    key: "quotes", label: "Orçamentos", description: "Cabeçalho do orçamento com valor total e status.", roles: ALL_ADMIN, keyField: "quote_number",
    fields: [
      f("quote_number", "Nº do orçamento", "text", ["numero", "orcamento", "n orcamento", "documento"], { required: true }),
      f("issued_at", "Data", "date", ["data", "emissao", "data orcamento"], { required: true }),
      f("total", "Valor total", "number", ["valor", "total", "valor total"], { required: true, min: 0 }),
      f("customer", "Cliente", "text", ["cliente"]),
      f("salesperson", "Vendedor", "text", ["vendedor"]),
      f("status", "Status", "text", ["status", "situacao"]),
      f("valid_until", "Validade", "date", ["validade", "valido ate"]),
    ],
  },
};

export const ENTITY_LIST = Object.values(ENTITIES);

export function canImport(entity: ImportEntity, roles: string[]) {
  return ENTITIES[entity].roles.some((r) => roles.includes(r));
}

export function normalizeHeader(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[º°.]/g, "")
    .replace(/[_\-/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Suggests source column for each field. Exact alias match wins over partial. */
export function suggestMapping(entity: ImportEntity, headers: string[]): Record<string, string> {
  const normalized = headers.map((h) => ({ raw: h, n: normalizeHeader(h) }));
  const used = new Set<string>();
  const mapping: Record<string, string> = {};
  for (const pass of ["exact", "partial"] as const) {
    for (const field of ENTITIES[entity].fields) {
      if (mapping[field.key]) continue;
      const candidates = [normalizeHeader(field.label), normalizeHeader(field.key), ...field.aliases.map(normalizeHeader)];
      const hit = normalized.find((h) => !used.has(h.raw) && (pass === "exact" ? candidates.includes(h.n) : candidates.some((c) => c.length > 2 && (h.n.startsWith(c) || h.n.includes(` ${c}`)))));
      if (hit) {
        mapping[field.key] = hit.raw;
        used.add(hit.raw);
      }
    }
  }
  return mapping;
}

/** Parses pt-BR and en numbers: "R$ 1.234,56", "1,234.56", "12,5", "(10,00)". */
export function parseNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (value == null) return null;
  let s = String(value).trim();
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1); }
  s = s.replace(/r\$|\s|%/gi, "");
  if (s.startsWith("-")) { negative = true; s = s.slice(1); }
  if (!/^[\d.,]+$/.test(s)) return null;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma > -1 && lastDot > -1) {
    s = lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (lastComma > -1) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if ((s.match(/\./g) ?? []).length > 1 || /^\d{1,3}\.\d{3}$/.test(s)) {
    s = s.replace(/\./g, "");
  }
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

/** Returns ISO date (YYYY-MM-DD). Accepts dd/mm/yyyy, yyyy-mm-dd, Excel serial. */
export function parseDate(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === "number" || /^\d{5}(\.\d+)?$/.test(String(value).trim())) {
    const serial = Number(value);
    if (serial > 20000 && serial < 80000) {
      const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86400000);
      return d.toISOString().slice(0, 10);
    }
    return null;
  }
  const s = String(value).trim();
  let y: number, m: number, d: number;
  let match = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (match) { y = +match[1]; m = +match[2]; d = +match[3]; }
  else {
    match = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
    if (!match) return null;
    d = +match[1]; m = +match[2]; y = +match[3];
    if (y < 100) y += 2000;
  }
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  if (y < 1990 || y > 2100) return null;
  return date.toISOString().slice(0, 10);
}

export type RowStatus = "OK" | "AVISO" | "ERRO";
export type ValidatedRow = {
  line: number;
  status: RowStatus;
  values: Record<string, string | number | null>;
  errors: string[];
  warnings: string[];
};

export type RawRecord = Record<string, unknown>;

/** Applies mapping to raw rows: returns records keyed by field. */
export function applyMapping(rows: RawRecord[], mapping: Record<string, string>): RawRecord[] {
  return rows.map((row) => {
    const out: RawRecord = {};
    for (const [field, column] of Object.entries(mapping)) if (column) out[field] = row[column];
    return out;
  });
}

export function validateRecords(entity: ImportEntity, records: RawRecord[], firstLine = 2): ValidatedRow[] {
  const def = ENTITIES[entity];
  const seen = new Map<string, number>();
  return records.map((record, index) => {
    const line = firstLine + index;
    const values: ValidatedRow["values"] = {};
    const errors: string[] = [];
    const warnings: string[] = [];
    for (const field of def.fields) {
      const raw = record[field.key];
      const empty = raw == null || String(raw).trim() === "";
      if (empty) {
        values[field.key] = null;
        if (field.required) errors.push(`${field.label} obrigatório`);
        continue;
      }
      if (field.type === "text") {
        values[field.key] = String(raw).trim().slice(0, 500);
      } else if (field.type === "date") {
        const d = parseDate(raw);
        if (!d) errors.push(`${field.label} inválida: "${String(raw)}"`);
        values[field.key] = d;
      } else {
        const n = parseNumber(raw);
        if (n == null) errors.push(`${field.label} não numérico: "${String(raw)}"`);
        else if (field.type === "integer" && !Number.isInteger(n)) errors.push(`${field.label} deve ser inteiro`);
        else if (field.min != null && n < field.min) errors.push(`${field.label} abaixo do permitido (${n})`);
        values[field.key] = n;
      }
    }

    // Entity-specific business warnings
    const num = (k: string) => (typeof values[k] === "number" ? (values[k] as number) : null);
    if (entity === "products") {
      const cost = num("cost_price"), price = num("sale_price"), qty = num("quantity");
      if (cost != null && price != null && price > 0 && price < cost) warnings.push("Preço de venda abaixo do custo");
      if (cost == null) warnings.push("Custo ausente — margem e capital parado ficarão incompletos");
      if (qty != null && qty < 0) warnings.push("Estoque negativo");
      const mn = num("min_stock"), mx = num("max_stock");
      if (mn != null && mx != null && mx < mn) warnings.push("Estoque máximo menor que o mínimo");
    }
    if (entity === "inventory" && (num("quantity") ?? 0) < 0) warnings.push("Estoque negativo");
    if (entity === "sales") {
      const price = num("unit_price"), cost = num("unit_cost"), qty = num("quantity") ?? 0, disc = num("discount") ?? 0;
      if (price != null && cost != null && price - disc / Math.max(qty, 1) < cost) warnings.push("Venda abaixo do custo");
      if (price != null && disc > price * qty) errors.push("Desconto maior que o valor do item");
    }
    if (entity === "accounts_payable") {
      if (num("paid_amount") != null && !values.paid_at) warnings.push("Valor pago sem data de pagamento");
      if ((num("paid_amount") ?? 0) > (num("amount") ?? Infinity)) warnings.push("Valor pago maior que o título");
    }
    if (entity === "accounts_receivable") {
      if (num("received_amount") != null && !values.received_at) warnings.push("Valor recebido sem data");
      if ((num("received_amount") ?? 0) > (num("amount") ?? Infinity)) warnings.push("Valor recebido maior que o título");
    }

    // Duplicate natural key inside the file (non-grouped entities)
    if (!def.grouped) {
      const key = values[def.keyField];
      if (key != null && key !== "") {
        const k = normalizeHeader(String(key));
        const prev = seen.get(k);
        if (prev) errors.push(`Duplicado no arquivo (linha ${prev})`);
        else seen.set(k, line);
      }
    }

    const status: RowStatus = errors.length ? "ERRO" : warnings.length ? "AVISO" : "OK";
    return { line, status, values, errors, warnings };
  });
}

export function summarize(rows: ValidatedRow[]) {
  return {
    total: rows.length,
    ok: rows.filter((r) => r.status === "OK").length,
    warning: rows.filter((r) => r.status === "AVISO").length,
    error: rows.filter((r) => r.status === "ERRO").length,
  };
}

export function toCsv(headers: string[], rows: (string | number | null | undefined)[][]) {
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers, ...rows].map((r) => r.map(esc).join(";")).join("\n");
}

export const MAX_IMPORT_ROWS = 5000;
