import { describe, expect, it } from "vitest";
import { canImport, parseDate, parseNumber, suggestMapping, validateRecords } from "./import-schema";
import { reconcile } from "./reconciliation";

describe("leitura de valores", () => {
  it("entende números em formato brasileiro", () => {
    expect(parseNumber("R$ 1.234,56")).toBe(1234.56);
    expect(parseNumber("12,5")).toBe(12.5);
    expect(parseNumber("(10,00)")).toBe(-10);
    expect(parseNumber("abc")).toBeNull();
  });
  it("entende datas dd/mm/aaaa e rejeita datas impossíveis", () => {
    expect(parseDate("05/10/2026")).toBe("2026-10-05");
    expect(parseDate("31/02/2026")).toBeNull();
  });
});

describe("mapeamento de colunas", () => {
  it("reconhece Cód. e Descrição como código e produto", () => {
    const m = suggestMapping("products", ["Cód.", "Descrição", "Preço Venda", "Custo"]);
    expect(m.sku).toBe("Cód.");
    expect(m.name).toBe("Descrição");
    expect(m.sale_price).toBe("Preço Venda");
    expect(m.cost_price).toBe("Custo");
  });
});

describe("validação de linhas", () => {
  it("rejeita linha sem código obrigatório", () => {
    const [row] = validateRecords("products", [{ name: "Tinta" }]);
    expect(row.status).toBe("ERRO");
  });
  it("avisa preço de venda abaixo do custo", () => {
    const [row] = validateRecords("products", [{ sku: "1", name: "Tinta", cost_price: "100", sale_price: "90" }]);
    expect(row.status).toBe("AVISO");
  });
  it("rejeita código duplicado no mesmo arquivo", () => {
    const rows = validateRecords("products", [{ sku: "A1", name: "x" }, { sku: "a1", name: "y" }]);
    expect(rows[1].status).toBe("ERRO");
  });
});

describe("permissões de importação", () => {
  it("VENDEDOR não importa nada; ESTOQUE não importa contas a pagar", () => {
    expect(canImport("products", ["VENDEDOR"])).toBe(false);
    expect(canImport("accounts_payable", ["ESTOQUE"])).toBe(false);
    expect(canImport("products", ["ESTOQUE"])).toBe(true);
    expect(canImport("accounts_payable", ["FINANCEIRO"])).toBe(true);
  });
});

describe("conciliação", () => {
  const products = [
    { id: "p1", sku: "A1", name: "Tinta Branca", cost_price: 100 },
    { id: "p2", sku: "A1", name: "Tinta Branca 18L", cost_price: 50 },
  ];
  it("estoque negativo vira P1", () => {
    const f = reconcile({ products, inventory: [{ product_id: "p1", quantity: -3 }] });
    expect(f.find((x) => x.key === "neg:p1")?.priority).toBe("P1");
  });
  it("detecta código duplicado", () => {
    const f = reconcile({ products, inventory: [] });
    expect(f.some((x) => x.key.startsWith("dupsku:"))).toBe(true);
  });
  it("divergência de custo acima de 10% é sinalizada", () => {
    const f = reconcile({ products, inventory: [], purchaseItems: [{ product_id: "p1", unit_cost: 115, ordered_at: "2026-10-01" }] });
    expect(f.some((x) => x.key === "cost:p1")).toBe(true);
    const ok = reconcile({ products, inventory: [], purchaseItems: [{ product_id: "p1", unit_cost: 105, ordered_at: "2026-10-01" }] });
    expect(ok.some((x) => x.key === "cost:p1")).toBe(false);
  });
  it("venda abaixo do custo vira P1 e total divergente é INCONSISTÊNCIA DETECTADA", () => {
    const f = reconcile({
      products, inventory: [],
      sales: [{ id: "s1", sale_number: "10", total: 200, discount_amount: 0, status: "CONCLUIDA" }],
      saleItems: [{ sale_id: "s1", product_id: "p1", quantity: 1, unit_price: 90, unit_cost: 100, total: 90, discount_amount: 0 }],
    });
    expect(f.find((x) => x.key.startsWith("belowcost:"))?.priority).toBe("P1");
    expect(f.find((x) => x.key === "saletotal:s1")?.title).toContain("INCONSISTÊNCIA DETECTADA");
  });
  it("estoque diferente da soma das movimentações é sinalizado", () => {
    const f = reconcile({ products, inventory: [{ product_id: "p1", quantity: 5 }], movements: [{ product_id: "p1", movement_type: "entrada", quantity: 10 }, { product_id: "p1", movement_type: "venda", quantity: 3 }] });
    expect(f.some((x) => x.key === "stockmov:p1")).toBe(true);
  });
});
