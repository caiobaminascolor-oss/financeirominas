// Pure reconciliation rules. Input = plain rows already read with the user's permissions.

export type Priority = "P1" | "P2" | "P3" | "P4";
export type Finding = {
  key: string;
  priority: Priority;
  category: string;
  title: string;
  problem: string;
  cause: string;
  impact: string;
  solution: string;
  entity_type?: string;
  entity_id?: string;
};

export type ReconInput = {
  products: { id: string; sku: string | null; name: string; cost_price: number; active?: boolean }[];
  inventory: { product_id: string; quantity: number }[];
  movements?: { product_id: string | null; movement_type: string; quantity: number }[];
  sales?: { id: string; sale_number: string | null; total: number; discount_amount: number; status: string }[];
  saleItems?: { sale_id: string; product_id: string | null; quantity: number; unit_price: number; unit_cost: number; total: number; discount_amount: number }[];
  purchaseItems?: { product_id: string | null; unit_cost: number; ordered_at: string }[];
  payables?: { id: string; supplier_id: string | null; description: string | null; amount: number }[];
  receivables?: { id: string; customer_id: string | null; description: string | null; amount: number }[];
};

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

export const COST_DIVERGENCE_PCT = 0.1;
export const TOTAL_TOLERANCE = 0.05;

const IN_TYPES = ["entrada", "compra", "ajuste_entrada", "devolucao", "inicial", "in"];
const OUT_TYPES = ["saida", "venda", "ajuste_saida", "perda", "out"];

export function reconcile(input: ReconInput): Finding[] {
  const out: Finding[] = [];
  const productById = new Map(input.products.map((p) => [p.id, p]));
  const label = (id: string | null | undefined) => {
    const p = id ? productById.get(id) : undefined;
    return p ? `${p.sku ? p.sku + " — " : ""}${p.name}` : "Produto não identificado";
  };

  // 1. Negative stock
  for (const inv of input.inventory) {
    if (inv.quantity < 0) out.push({
      key: `neg:${inv.product_id}`, priority: "P1", category: "Estoque", title: `Estoque negativo: ${label(inv.product_id)}`,
      problem: `Saldo registrado de ${inv.quantity} unidades.`, cause: "Venda sem entrada correspondente, entrada não lançada ou erro de contagem.",
      impact: "Custo, giro e sugestão de compra ficam distorcidos; risco de vender o que não existe.",
      solution: "Contar fisicamente, lançar a entrada faltante e corrigir o saldo.", entity_type: "product", entity_id: inv.product_id,
    });
  }

  // 2. Duplicated products (same code or same description)
  const byCode = new Map<string, typeof input.products>();
  const byName = new Map<string, typeof input.products>();
  for (const p of input.products) {
    if (p.active === false) continue;
    if (p.sku) byCode.set(norm(p.sku), [...(byCode.get(norm(p.sku)) ?? []), p]);
    byName.set(norm(p.name), [...(byName.get(norm(p.name)) ?? []), p]);
  }
  for (const [code, list] of byCode) if (list.length > 1) out.push({
    key: `dupsku:${code}`, priority: "P2", category: "Cadastro", title: `Código duplicado: ${list[0].sku}`,
    problem: `${list.length} produtos usam o mesmo código.`, cause: "Cadastro repetido ou importação de fontes diferentes.",
    impact: "Vendas e estoque podem cair no produto errado.", solution: "Unificar os cadastros e manter um único código.", entity_type: "product", entity_id: list[0].id,
  });
  for (const [name, list] of byName) if (list.length > 1 && new Set(list.map((p) => p.sku)).size > 1) out.push({
    key: `dupname:${name}`, priority: "P3", category: "Cadastro", title: `Descrição repetida: ${list[0].name}`,
    problem: `${list.length} códigos diferentes com a mesma descrição (${list.map((p) => p.sku ?? "sem código").join(", ")}).`,
    cause: "Possível produto duplicado com códigos distintos.", impact: "Estoque dividido e giro subestimado.",
    solution: "Confirmar se é o mesmo item; se for, unificar.", entity_type: "product", entity_id: list[0].id,
  });

  // 3. Stock vs movements (only for products with movement history)
  if (input.movements?.length) {
    const balance = new Map<string, number>();
    for (const m of input.movements) {
      if (!m.product_id) continue;
      const t = m.movement_type.toLowerCase();
      const sign = IN_TYPES.includes(t) ? 1 : OUT_TYPES.includes(t) ? -1 : Math.sign(m.quantity) || 0;
      balance.set(m.product_id, (balance.get(m.product_id) ?? 0) + sign * Math.abs(m.quantity));
    }
    for (const inv of input.inventory) {
      const expected = balance.get(inv.product_id);
      if (expected == null) continue;
      if (Math.abs(expected - inv.quantity) > 0.001) out.push({
        key: `stockmov:${inv.product_id}`, priority: "P2", category: "Conciliação", title: `INCONSISTÊNCIA DETECTADA: estoque × movimentos — ${label(inv.product_id)}`,
        problem: `Saldo informado ${inv.quantity}; soma das movimentações ${expected}.`, cause: "Movimentos faltando ou saldo ajustado sem registro.",
        impact: "Não é possível confiar no saldo para compra ou venda.", solution: "Auditar movimentos do produto e registrar ajuste justificado.",
        entity_type: "product", entity_id: inv.product_id,
      });
    }
  }

  // 4. Cost divergence: last purchase vs registered cost
  if (input.purchaseItems?.length) {
    const last = new Map<string, { unit_cost: number; ordered_at: string }>();
    for (const it of input.purchaseItems) {
      if (!it.product_id) continue;
      const prev = last.get(it.product_id);
      if (!prev || it.ordered_at > prev.ordered_at) last.set(it.product_id, it);
    }
    for (const [pid, it] of last) {
      const p = productById.get(pid);
      if (!p || !p.cost_price || !it.unit_cost) continue;
      const diff = (it.unit_cost - p.cost_price) / p.cost_price;
      if (Math.abs(diff) > COST_DIVERGENCE_PCT) out.push({
        key: `cost:${pid}`, priority: diff > 0 ? "P2" : "P3", category: "Custo", title: `Divergência de custo: ${label(pid)}`,
        problem: `Última compra a ${brl(it.unit_cost)}; custo cadastrado ${brl(p.cost_price)} (${(diff * 100).toFixed(1)}%).`,
        cause: "Custo do cadastro não atualizado após a compra.",
        impact: diff > 0 ? "Margem real menor do que a exibida." : "Margem subestimada; preço pode estar alto demais.",
        solution: "Atualizar o custo e revisar o preço de venda.", entity_type: "product", entity_id: pid,
      });
    }
  }

  // 5. Sales below cost & sale total ≠ items
  if (input.sales?.length && input.saleItems) {
    const itemsBySale = new Map<string, NonNullable<ReconInput["saleItems"]>>();
    for (const it of input.saleItems) itemsBySale.set(it.sale_id, [...(itemsBySale.get(it.sale_id) ?? []), it]);
    for (const sale of input.sales) {
      if (sale.status.toLowerCase() === "cancelada") continue;
      const items = itemsBySale.get(sale.id) ?? [];
      if (!items.length) continue;
      const sum = items.reduce((s, i) => s + i.total, 0);
      if (Math.abs(sum - sale.total) > TOTAL_TOLERANCE) out.push({
        key: `saletotal:${sale.id}`, priority: "P2", category: "Conciliação", title: `INCONSISTÊNCIA DETECTADA: venda ${sale.sale_number ?? sale.id.slice(0, 8)}`,
        problem: `Total da venda ${brl(sale.total)}; soma dos itens ${brl(sum)}.`, cause: "Desconto ou frete no cabeçalho não refletido nos itens, ou item faltando.",
        impact: "Faturamento e margem divergentes entre relatórios.", solution: "Conferir o documento de origem e corrigir.", entity_type: "sale", entity_id: sale.id,
      });
      for (const it of items) {
        if (it.unit_cost > 0 && it.quantity > 0 && it.total / it.quantity < it.unit_cost) out.push({
          key: `belowcost:${sale.id}:${it.product_id}`, priority: "P1", category: "Margem", title: `Venda abaixo do custo: ${label(it.product_id)}`,
          problem: `Venda ${sale.sale_number ?? ""} a ${brl(it.total / it.quantity)} por unidade; custo ${brl(it.unit_cost)}.`,
          cause: "Desconto excessivo, preço desatualizado ou custo errado.", impact: `Prejuízo de ${brl(it.unit_cost * it.quantity - it.total)} nesta venda.`,
          solution: "Revisar política de desconto e preço do produto.", entity_type: "sale", entity_id: sale.id,
        });
      }
    }
  }

  // 6. Accounts without counterparty
  const apNoParty = (input.payables ?? []).filter((a) => !a.supplier_id);
  if (apNoParty.length) out.push({
    key: "ap:noparty", priority: "P3", category: "Financeiro", title: `${apNoParty.length} conta(s) a pagar sem fornecedor`,
    problem: `${brl(apNoParty.reduce((s, a) => s + a.amount, 0))} em títulos sem fornecedor vinculado.`, cause: "Fornecedor não informado ou não cadastrado na importação.",
    impact: "Impossível analisar concentração e negociar prazos.", solution: "Vincular cada título ao fornecedor correto.",
  });
  const arNoParty = (input.receivables ?? []).filter((a) => !a.customer_id);
  if (arNoParty.length) out.push({
    key: "ar:noparty", priority: "P3", category: "Financeiro", title: `${arNoParty.length} conta(s) a receber sem cliente`,
    problem: `${brl(arNoParty.reduce((s, a) => s + a.amount, 0))} em títulos sem cliente vinculado.`, cause: "Cliente não informado ou não cadastrado.",
    impact: "Cobrança e análise de inadimplência ficam cegas.", solution: "Vincular cada título ao cliente.",
  });

  return out;
}
