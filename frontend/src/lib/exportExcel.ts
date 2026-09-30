// Port tu linh-kien-app/frontend/src/lib/exportExcel.ts. Import dong (dynamic import) de xlsx
// (~1MB) chi tai khi nguoi dung thuc su xuat file, khong lam nang bundle chinh cua ung dung.
export async function exportRowsToExcel<T extends object>(rows: T[], filename: string, sheetName = "Data", headerLabels?: Record<string, string>) {
  const XLSX = await import("xlsx");
  const exportRows = headerLabels ? rows.map((row) => remapKeys(row as unknown as Record<string, unknown>, headerLabels)) : rows;
  const worksheet = XLSX.utils.json_to_sheet(exportRows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  XLSX.writeFile(workbook, filename);
}

function remapKeys(row: Record<string, unknown>, headerLabels: Record<string, string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    out[headerLabels[key] ?? key] = value;
  }
  return out;
}
