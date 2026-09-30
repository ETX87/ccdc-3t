// In tem QR tai san (quet bang nut "Quet QR" tren topbar -> mo dung tai san). QR chua dung ma tai san.
// Tra ve thong bao loi (hien trong man goi) hoac null neu da mo cua so in. Mo cua so NGAY (dong bo, truoc
// await) - trinh duyet chan pop-up mo sau await vi mat "user activation".
export async function inTemQr(items: { id: string; ten: string }[]): Promise<string | null> {
  if (!items.length) return "Chưa chọn tài sản nào để in tem.";
  const w = window.open("", "_blank", "width=900,height=700");
  if (!w) return "Trình duyệt đã chặn cửa sổ in - hãy cho phép cửa sổ bật lên (pop-up) cho trang này.";
  w.document.write("<p style='font-family:system-ui;padding:16px'>Đang tạo tem QR…</p>");
  const QR = await import("qrcode");
  const tems = await Promise.all(
    items.map(async (it) => ({ ...it, qr: await QR.toDataURL(it.id, { margin: 1, width: 220, errorCorrectionLevel: "M" }) })),
  );
  w.document.open();
  const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]!);
  w.document.write(`<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Tem QR tài sản</title>
<style>
  @page { margin: 8mm; }
  body { font-family: 'Plus Jakarta Sans', system-ui, sans-serif; margin: 0; color: #0f172a; }
  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6mm; }
  .tem { border: 1px solid #e2e8f0; border-radius: 3mm; padding: 3mm; display: flex; gap: 3mm; align-items: center; break-inside: avoid; }
  .tem img.qr { width: 24mm; height: 24mm; }
  .brand { font-size: 8pt; color: #007482; font-weight: 700; }
  .ma { font-size: 10pt; font-weight: 800; margin: 1mm 0; }
  .ten { font-size: 8pt; color: #334155; line-height: 1.25; }
</style></head><body><div class="grid">${tems
    .map(
      (t) => `<div class="tem"><img class="qr" src="${t.qr}" alt=""><div><div class="brand">3T Asset</div><div class="ma">${esc(t.id)}</div><div class="ten">${esc(t.ten)}</div></div></div>`,
    )
    .join("")}</div><script>window.onload = () => { window.print(); };</script></body></html>`);
  w.document.close();
  return null;
}
