import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { MAX_IMPORT_ROWS } from "./import-schema";

const entity = z.enum(["products", "inventory", "customers", "suppliers", "sales", "purchases", "accounts_payable", "accounts_receivable", "expenses", "quotes"]);
const cell = z.union([z.string().max(1000), z.number(), z.null()]);

export const commitImportFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({
    entity,
    fileName: z.string().min(1).max(255),
    fileType: z.string().max(20),
    mode: z.enum(["insert", "upsert"]),
    mapping: z.record(z.string(), z.string().max(200)),
    records: z.array(z.record(z.string(), cell)).max(MAX_IMPORT_ROWS),
  }).parse(data))
  .handler(async ({ data, context }) => {
    const m = await import("./imports.server");
    return m.commitImport(context.supabase, context.userId, data);
  });

export const saveImportFileFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ importId: z.string().uuid(), fileName: z.string().max(255), base64: z.string().max(14_500_000), contentType: z.string().max(120) }).parse(data))
  .handler(async ({ data, context }) => {
    const m = await import("./imports.server");
    return m.saveImportFile(context.supabase, context.userId, data.importId, data.fileName, data.base64, data.contentType);
  });

export const extractPdfFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ fileName: z.string().max(255), base64: z.string().max(14_500_000) }).parse(data))
  .handler(async ({ data }) => {
    const m = await import("./imports.server");
    return m.extractPdfTable(data.base64, data.fileName);
  });

export const listImportsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const m = await import("./imports.server");
    return m.listImports(context.supabase);
  });

export const getImportFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const m = await import("./imports.server");
    return m.getImport(context.supabase, data.id);
  });

export const getImportFileUrlFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const m = await import("./imports.server");
    return m.getImportFileUrl(context.supabase, data.id);
  });

export const runReconciliationFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const m = await import("./imports.server");
    return m.runReconciliation(context.supabase, context.userId);
  });
