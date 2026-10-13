import { MAX_IMPORT_ROWS, toCsv, ENTITIES, type ImportEntity, type RawRecord } from "./import-schema";

export function checkImportFile(file: Pick<File, "name" | "size">) {
  if (!file.size) throw new Error("Arquivo vazio.");
  if (file.size > 10 * 1024 * 1024) throw new Error("Limite de 10 MB por arquivo.");
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (!extension || !["csv", "xls", "xlsx", "pdf"].includes(extension)) throw new Error("Selecione CSV, XLS, XLSX ou PDF.");
  return extension;
}

export function fileBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
    reader.readAsDataURL(file);
  });
}

export async function readWorkbook(file: File) {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: false });
  return workbook.SheetNames.map((name) => {
    const sheet = workbook.Sheets[name];
    const table = sheet ? XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: true }) : [];
    const headerIndex = table.findIndex((r) => r.filter((c) => c !== "").length > 1);
    const headerRow = table[headerIndex] ?? [];
    const headers = headerRow.map((v, i) => String(v || `Coluna ${i + 1}`));
    const seen = new Set<string>();
    const uniqueHeaders = headers.map((h, i) => { const value = seen.has(h) ? `${h} (${i + 1})` : h; seen.add(value); return value; });
    const body = table.slice(headerIndex + 1).filter((r) => r.some((c) => c !== ""));
    if (body.length > MAX_IMPORT_ROWS) throw new Error(`Limite de ${MAX_IMPORT_ROWS} linhas por planilha; divida o arquivo.`);
    return { name, headers: uniqueHeaders, rows: body.map((r) => Object.fromEntries(uniqueHeaders.map((h, i) => [h, r[i] ?? ""]))) as RawRecord[] };
  }).filter((s) => s.headers.length && s.rows.length);
}

export function downloadCsv(name: string, content: string) {
  const url = URL.createObjectURL(new Blob(["\uFEFF", content], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a"); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
}

export function downloadTemplate(entity: ImportEntity) {
  downloadCsv(`modelo-${entity}.csv`, toCsv(ENTITIES[entity].fields.map((f) => f.label), []));
}