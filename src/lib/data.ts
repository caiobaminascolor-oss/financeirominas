import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/* Consultas cruas adicionais — nenhum dado é inventado aqui. */

export type CustomerRow = {
  id: string;
  name: string;
  doc: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  segment: string | null;
  status: string;
  first_purchase_at: string | null;
  last_purchase_at: string | null;
};

export type QuoteRow = {
  id: string;
  quote_number: string | null;
  customer_id: string | null;
  salesperson_id: string | null;
  issued_at: string;
  valid_until: string | null;
  total: number;
  status: string;
  converted_sale_id: string | null;
  customers: { name: string } | null;
  salespeople: { name: string } | null;
};

export type SupplierRow = {
  id: string;
  name: string;
  cnpj: string | null;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  lead_time_days: number | null;
  payment_terms: string | null;
  active: boolean;
};

export type PayableRow = {
  id: string;
  supplier_id: string | null;
  description: string | null;
  category: string | null;
  amount: number;
  due_date: string;
  paid_at: string | null;
  paid_amount: number | null;
  status: string;
  suppliers: { name: string } | null;
};

export type ReceivableRow = {
  id: string;
  customer_id: string | null;
  description: string | null;
  amount: number;
  due_date: string;
  received_at: string | null;
  received_amount: number | null;
  status: string;
  customers: { name: string } | null;
};

export type CashRow = {
  id: string;
  transaction_date: string;
  direction: string;
  amount: number;
  category: string | null;
  description: string | null;
  payment_method: string | null;
};

export type ExpenseRow = {
  id: string;
  expense_date: string;
  category: string | null;
  description: string | null;
  amount: number;
  recurring: boolean;
};

export type SalespersonRow = {
  id: string;
  name: string;
  commission_rate: number;
  active: boolean;
};

export type TargetRow = {
  id: string;
  period_type: string;
  period_start: string;
  period_end: string;
  scope: string;
  salesperson_id: string | null;
  category_id: string | null;
  metric: string;
  target_value: number;
};

export type DiscountRow = {
  id: string;
  sale_id: string | null;
  product_id: string | null;
  salesperson_id: string | null;
  discount_pct: number;
  discount_amount: number;
  below_cost: boolean;
  approved_by: string | null;
  notes: string | null;
  created_at: string;
  products: { name: string; sku: string | null } | null;
  salespeople: { name: string } | null;
};

export type CommissionRow = {
  id: string;
  salesperson_id: string | null;
  sale_id: string | null;
  period_start: string | null;
  period_end: string | null;
  base_amount: number;
  rate: number;
  amount: number;
  status: string;
};

export type AlertRow = {
  id: string;
  priority: "P1" | "P2" | "P3" | "P4";
  category: string | null;
  title: string;
  message: string | null;
  entity_type: string | null;
  entity_id: string | null;
  status: string;
  resolved_at: string | null;
  created_at: string;
};

function simpleQuery<T>(key: string, table: string, select: string, limit = 3000) {
  return () =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useQuery({
      queryKey: [key],
      queryFn: async () => {
        const { data, error } = await supabase.from(table as never).select(select).limit(limit);
        if (error) throw error;
        return (data ?? []) as unknown as T[];
      },
    });
}

export const useCustomers = simpleQuery<CustomerRow>(
  "customers",
  "customers",
  "id, name, doc, email, phone, city, segment, status, first_purchase_at, last_purchase_at",
);

export const useQuotes = simpleQuery<QuoteRow>(
  "quotes",
  "quotes",
  "id, quote_number, customer_id, salesperson_id, issued_at, valid_until, total, status, converted_sale_id, customers(name), salespeople(name)",
);

export const useSuppliers = simpleQuery<SupplierRow>(
  "suppliers",
  "suppliers",
  "id, name, cnpj, contact_name, email, phone, lead_time_days, payment_terms, active",
);

export const usePayables = simpleQuery<PayableRow>(
  "accounts_payable",
  "accounts_payable",
  "id, supplier_id, description, category, amount, due_date, paid_at, paid_amount, status, suppliers(name)",
);

export const useReceivables = simpleQuery<ReceivableRow>(
  "accounts_receivable",
  "accounts_receivable",
  "id, customer_id, description, amount, due_date, received_at, received_amount, status, customers(name)",
);

export const useCashTransactions = simpleQuery<CashRow>(
  "cash_transactions",
  "cash_transactions",
  "id, transaction_date, direction, amount, category, description, payment_method",
);

export const useExpenses = simpleQuery<ExpenseRow>(
  "expenses",
  "expenses",
  "id, expense_date, category, description, amount, recurring",
);

export const useSalespeople = simpleQuery<SalespersonRow>(
  "salespeople",
  "salespeople",
  "id, name, commission_rate, active",
);

export const useTargets = simpleQuery<TargetRow>(
  "targets",
  "targets",
  "id, period_type, period_start, period_end, scope, salesperson_id, category_id, metric, target_value",
);

export const useDiscounts = simpleQuery<DiscountRow>(
  "discounts",
  "discounts",
  "id, sale_id, product_id, salesperson_id, discount_pct, discount_amount, below_cost, approved_by, notes, created_at, products(name, sku), salespeople(name)",
);

export const useCommissions = simpleQuery<CommissionRow>(
  "commissions",
  "commissions",
  "id, salesperson_id, sale_id, period_start, period_end, base_amount, rate, amount, status",
);

export const useAlerts = simpleQuery<AlertRow>(
  "alerts",
  "alerts",
  "id, priority, category, title, message, entity_type, entity_id, status, resolved_at, created_at",
);

/* ---------------------------------------------------------------- */
/* Projeção de caixa — base compartilhada por Financeiro e Compras    */
/* ---------------------------------------------------------------- */

export type CashProjection = {
  saldoAtual: number;
  hasCash: boolean;
  hasAp: boolean;
  hasAr: boolean;
  horizons: {
    days: number;
    aReceber: number;
    aPagar: number;
    /** Cenário base: recebe tudo que vence no prazo. */
    base: number;
    /** Pessimista: 25% dos recebimentos atrasam, despesas mantidas. */
    pessimista: number;
    /** Otimista: recebe tudo + 10% de antecipação de vencimentos futuros. */
    otimista: number;
  }[];
  vencidoAPagar: number;
  vencidoAReceber: number;
};

export function buildCashProjection(
  cash: CashRow[],
  payables: PayableRow[],
  receivables: ReceivableRow[],
): CashProjection {
  const saldoAtual = cash.reduce(
    (s, t) => s + (t.direction === "entrada" ? t.amount : -t.amount),
    0,
  );
  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);

  const openAp = payables.filter((p) => !p.paid_at);
  const openAr = receivables.filter((r) => !r.received_at);

  const horizons = [7, 15, 30, 60, 90].map((days) => {
    const limit = new Date(today);
    limit.setDate(limit.getDate() + days);
    const limitIso = limit.toISOString().slice(0, 10);
    const aPagar = openAp.filter((p) => p.due_date <= limitIso).reduce((s, p) => s + p.amount, 0);
    const aReceber = openAr.filter((r) => r.due_date <= limitIso).reduce((s, r) => s + r.amount, 0);
    return {
      days,
      aPagar,
      aReceber,
      base: saldoAtual + aReceber - aPagar,
      pessimista: saldoAtual + aReceber * 0.75 - aPagar,
      otimista: saldoAtual + aReceber * 1.1 - aPagar,
    };
  });

  return {
    saldoAtual,
    hasCash: cash.length > 0,
    hasAp: payables.length > 0,
    hasAr: receivables.length > 0,
    horizons,
    vencidoAPagar: openAp.filter((p) => p.due_date < todayIso).reduce((s, p) => s + p.amount, 0),
    vencidoAReceber: openAr.filter((r) => r.due_date < todayIso).reduce((s, r) => s + r.amount, 0),
  };
}
