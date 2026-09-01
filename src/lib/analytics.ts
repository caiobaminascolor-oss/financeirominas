import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { addDays, daysBetween, isoDate } from "@/lib/format";

/* ------------------------------------------------------------------ */
/* Tipos brutos (somente o que é lido do banco — nada é inventado)     */
/* ------------------------------------------------------------------ */

export type SaleRow = {
  id: string;
  sale_number: string | null;
  sold_at: string;
  subtotal: number;
  discount_amount: number;
  total: number;
  cost_total: number;
  gross_profit: number;
  margin_pct: number | null;
  payment_method: string | null;
  status: string;
  customer_id: string | null;
  salesperson_id: string | null;
  customers: { name: string } | null;
  salespeople: { name: string } | null;
};

export type SaleItemRow = {
  id: string;
  sale_id: string;
  product_id: string | null;
  quantity: number;
  unit_price: number;
  unit_cost: number;
  discount_amount: number;
  total: number;
  sales: { sold_at: string; status: string; salesperson_id: string | null } | null;
};

export type ProductRow = {
  id: string;
  sku: string | null;
  name: string;
  brand: string | null;
  unit: string;
  cost_price: number;
  sale_price: number;
  min_stock: number;
  max_stock: number | null;
  active: boolean;
  category_id: string | null;
  supplier_id: string | null;
  categories: { name: string } | null;
  suppliers: { name: string; lead_time_days: number | null } | null;
};

export type InventoryRow = {
  id: string;
  product_id: string;
  quantity: number;
  reserved_quantity: number;
  avg_cost: number;
  location: string | null;
  last_movement_at: string | null;
};

/* ------------------------------------------------------------------ */
/* Consultas base                                                      */
/* ------------------------------------------------------------------ */

export function useSales(days = 90) {
  const since = isoDate(addDays(new Date(), -days));
  return useQuery({
    queryKey: ["sales", days],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select(
          "id, sale_number, sold_at, subtotal, discount_amount, total, cost_total, gross_profit, margin_pct, payment_method, status, customer_id, salesperson_id, customers(name), salespeople(name)",
        )
        .gte("sold_at", since)
        .order("sold_at", { ascending: false })
        .limit(2000);
      if (error) throw error;
      return (data ?? []) as unknown as SaleRow[];
    },
  });
}

export function useSaleItems(days = 365) {
  const since = isoDate(addDays(new Date(), -days));
  return useQuery({
    queryKey: ["sale_items", days],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sale_items")
        .select(
          "id, sale_id, product_id, quantity, unit_price, unit_cost, discount_amount, total, sales!inner(sold_at, status, salesperson_id)",
        )
        .gte("sales.sold_at", since)
        .limit(5000);
      if (error) throw error;
      return (data ?? []) as unknown as SaleItemRow[];
    },
  });
}

export function useProducts() {
  return useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select(
          "id, sku, name, brand, unit, cost_price, sale_price, min_stock, max_stock, active, category_id, supplier_id, categories(name), suppliers(name, lead_time_days)",
        )
        .limit(3000);
      if (error) throw error;
      return (data ?? []) as unknown as ProductRow[];
    },
  });
}

export function useInventory() {
  return useQuery({
    queryKey: ["inventory"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory")
        .select("id, product_id, quantity, reserved_quantity, avg_cost, location, last_movement_at")
        .limit(3000);
      if (error) throw error;
      return (data ?? []) as unknown as InventoryRow[];
    },
  });
}

/* ------------------------------------------------------------------ */
/* Derivações de estoque / produto (base de Estoque, Parados, Compras) */
/* ------------------------------------------------------------------ */

export type ProductAnalytics = {
  productId: string;
  sku: string | null;
  name: string;
  category: string;
  supplier: string;
  leadTimeDays: number | null;
  quantity: number;
  avgCost: number;
  salePrice: number;
  minStock: number;
  maxStock: number | null;
  stockValue: number;
  lastSaleAt: string | null;
  daysWithoutSale: number | null;
  qty30: number;
  qty90: number;
  qty365: number;
  revenue365: number;
  cost365: number;
  profit365: number;
  marginPct: number | null;
  /** Giro anual = unidades vendidas em 12 meses / estoque atual. */
  turnover: number | null;
  /** Cobertura em dias = estoque atual / venda média diária (90 dias). */
  coverageDays: number | null;
};

export function useProductAnalytics() {
  const products = useProducts();
  const inventory = useInventory();
  const items = useSaleItems(365);

  const loading = products.isLoading || inventory.isLoading || items.isLoading;
  const error = products.error ?? inventory.error ?? items.error;

  const invByProduct = new Map<string, InventoryRow>();
  for (const inv of inventory.data ?? []) {
    const prev = invByProduct.get(inv.product_id);
    if (prev) {
      invByProduct.set(inv.product_id, {
        ...prev,
        quantity: prev.quantity + inv.quantity,
        avg_cost: prev.avg_cost || inv.avg_cost,
      });
    } else invByProduct.set(inv.product_id, inv);
  }

  const now = new Date();
  const d30 = addDays(now, -30);
  const d90 = addDays(now, -90);

  const agg = new Map<
    string,
    { q30: number; q90: number; q365: number; rev: number; cost: number; last: string | null }
  >();
  for (const it of items.data ?? []) {
    if (!it.product_id || !it.sales) continue;
    if (it.sales.status === "cancelada") continue;
    const soldAt = new Date(it.sales.sold_at);
    const cur =
      agg.get(it.product_id) ?? { q30: 0, q90: 0, q365: 0, rev: 0, cost: 0, last: null };
    cur.q365 += it.quantity;
    if (soldAt >= d90) cur.q90 += it.quantity;
    if (soldAt >= d30) cur.q30 += it.quantity;
    cur.rev += it.total;
    cur.cost += it.unit_cost * it.quantity;
    if (!cur.last || soldAt > new Date(cur.last)) cur.last = it.sales.sold_at;
    agg.set(it.product_id, cur);
  }

  const rows: ProductAnalytics[] = (products.data ?? []).map((p) => {
    const inv = invByProduct.get(p.id);
    const a = agg.get(p.id);
    const quantity = inv?.quantity ?? 0;
    const avgCost = inv?.avg_cost || p.cost_price;
    const qty365 = a?.q365 ?? 0;
    const qty90 = a?.q90 ?? 0;
    const revenue365 = a?.rev ?? 0;
    const cost365 = a?.cost ?? 0;
    const dailySales = qty90 / 90;
    return {
      productId: p.id,
      sku: p.sku,
      name: p.name,
      category: p.categories?.name ?? "Sem categoria",
      supplier: p.suppliers?.name ?? "Sem fornecedor",
      leadTimeDays: p.suppliers?.lead_time_days ?? null,
      quantity,
      avgCost,
      salePrice: p.sale_price,
      minStock: p.min_stock,
      maxStock: p.max_stock,
      stockValue: quantity * avgCost,
      lastSaleAt: a?.last ?? null,
      daysWithoutSale: a?.last ? daysBetween(a.last) : null,
      qty30: a?.q30 ?? 0,
      qty90,
      qty365,
      revenue365,
      cost365,
      profit365: revenue365 - cost365,
      marginPct: revenue365 > 0 ? ((revenue365 - cost365) / revenue365) * 100 : null,
      turnover: quantity > 0 ? qty365 / quantity : null,
      coverageDays: dailySales > 0 ? quantity / dailySales : null,
    };
  });

  return {
    rows,
    loading,
    error,
    hasProducts: (products.data ?? []).length > 0,
    hasInventory: (inventory.data ?? []).length > 0,
    hasSales: (items.data ?? []).length > 0,
  };
}

export type StockClass = {
  label: string;
  tone: "verde" | "amarelo" | "laranja" | "vermelho" | "neutro";
  reason: string;
};

export function classifyStock(r: ProductAnalytics): StockClass {
  if (r.quantity < 0)
    return { label: "Estoque negativo", tone: "vermelho", reason: "Quantidade negativa indica inconsistência de movimentação." };
  if (r.qty365 === 0 && r.quantity > 0)
    return {
      label: "Dinheiro parado",
      tone: "vermelho",
      reason: "Sem nenhuma venda em 12 meses e com estoque em capital imobilizado.",
    };
  if (r.quantity <= 0 && r.qty90 > 0)
    return { label: "Risco de ruptura", tone: "vermelho", reason: "Produto com giro nos últimos 90 dias e estoque zerado." };
  if (r.coverageDays !== null && r.coverageDays < 15)
    return {
      label: "Risco de ruptura",
      tone: "vermelho",
      reason: `Cobertura de ${r.coverageDays.toFixed(0)} dias, abaixo de 15 dias de venda média.`,
    };
  if (r.quantity < r.minStock)
    return { label: "Risco de ruptura", tone: "vermelho", reason: "Estoque atual abaixo do estoque mínimo cadastrado." };
  if (r.daysWithoutSale !== null && r.daysWithoutSale > 180 && r.quantity > 0)
    return { label: "Dinheiro parado", tone: "vermelho", reason: `Sem venda há ${r.daysWithoutSale} dias.` };
  if (r.coverageDays !== null && r.coverageDays > 180)
    return {
      label: "Excessivo",
      tone: "laranja",
      reason: `Cobertura de ${r.coverageDays.toFixed(0)} dias — muito acima do necessário.`,
    };
  if (r.maxStock !== null && r.quantity > r.maxStock)
    return { label: "Excessivo", tone: "laranja", reason: "Estoque acima do máximo cadastrado." };
  if (r.turnover !== null && r.turnover >= 6)
    return { label: "Alto giro", tone: "verde", reason: `Giro de ${r.turnover.toFixed(1)}x ao ano.` };
  if (r.turnover !== null && r.turnover >= 2)
    return { label: "Atenção", tone: "amarelo", reason: `Giro moderado de ${r.turnover.toFixed(1)}x ao ano.` };
  if (r.turnover === null)
    return { label: "Sem dados", tone: "neutro", reason: "Sem estoque ou sem histórico suficiente para calcular giro." };
  return { label: "Atenção", tone: "amarelo", reason: `Giro baixo de ${r.turnover.toFixed(1)}x ao ano.` };
}

export type PurchaseClass = { label: string; tone: "verde" | "amarelo" | "laranja" | "vermelho"; reason: string };

export function classifyPurchase(r: ProductAnalytics, cashOk: boolean): PurchaseClass {
  const lead = r.leadTimeDays ?? 15;
  const daily = r.qty90 / 90;
  const cover = r.coverageDays;

  if (daily === 0 && r.qty365 === 0)
    return {
      label: "Não comprar",
      tone: "vermelho",
      reason: "Sem nenhuma venda em 12 meses: comprar aumenta capital parado sem demanda comprovada.",
    };
  if (cover !== null && cover > 120)
    return {
      label: "Não comprar",
      tone: "vermelho",
      reason: `Cobertura de ${cover.toFixed(0)} dias contra prazo de entrega de ${lead} dias — estoque já excede a demanda.`,
    };
  if (daily === 0)
    return {
      label: "Sob demanda",
      tone: "laranja",
      reason: "Sem venda nos últimos 90 dias; comprar apenas mediante pedido do cliente.",
    };
  if (cover !== null && cover <= lead)
    return {
      label: cashOk ? "Comprar agora" : "Comprar em breve",
      tone: cashOk ? "verde" : "amarelo",
      reason: cashOk
        ? `Cobertura de ${cover.toFixed(0)} dias é menor ou igual ao prazo do fornecedor (${lead} dias): há risco real de ruptura antes da reposição.`
        : `Cobertura de ${cover.toFixed(0)} dias exige reposição, mas o caixa projetado não suporta a compra agora — negocie prazo.`,
    };
  if (cover !== null && cover <= lead * 2)
    return {
      label: "Comprar em breve",
      tone: "amarelo",
      reason: `Cobertura de ${cover.toFixed(0)} dias contra prazo de ${lead} dias: programar a compra nas próximas semanas.`,
    };
  return {
    label: "Sob demanda",
    tone: "laranja",
    reason: `Cobertura de ${cover ? cover.toFixed(0) : "—"} dias é confortável frente ao prazo de ${lead} dias.`,
  };
}

/* ------------------------------------------------------------------ */
/* Curva ABC                                                           */
/* ------------------------------------------------------------------ */

export type AbcCriterion = "faturamento" | "margem" | "giro" | "capital";

export function abcCurve(rows: ProductAnalytics[], criterion: AbcCriterion) {
  const value = (r: ProductAnalytics) =>
    criterion === "faturamento"
      ? r.revenue365
      : criterion === "margem"
        ? r.profit365
        : criterion === "giro"
          ? r.qty365
          : r.stockValue;

  const list = rows
    .map((r) => ({ row: r, value: value(r) }))
    .filter((x) => x.value > 0)
    .sort((a, b) => b.value - a.value);

  const total = list.reduce((s, x) => s + x.value, 0);
  let acc = 0;
  return list.map((x) => {
    acc += x.value;
    const accPct = total > 0 ? (acc / total) * 100 : 0;
    const cls = accPct <= 80 ? "A" : accPct <= 95 ? "B" : "C";
    return { ...x, sharePct: total > 0 ? (x.value / total) * 100 : 0, accPct, cls };
  });
}
