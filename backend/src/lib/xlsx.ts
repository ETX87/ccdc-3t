// Ghi file .xlsx toi gian ngay trong Worker (khong thu vien - Workers khong co fs, SheetJS nang + chi ban community):
// moi sheet = 1 bang phang (dong 1 = tieu de cot, tu dong 2 = du lieu) de he thong khac doc thang. Tieu de dam nen
// teal, co dinh dong tieu de, bo loc tu dong, so dung kieu so that (khong phai chuoi). ZIP kieu "store" (khong nen).

export interface CotXlsx {
  key: string;
  header: string;
  /** do rong (ky tu). */
  width?: number;
  /** "tien" = #,##0; "so" = so thuong; mac dinh chu. */
  kieu?: "tien" | "so" | "chu";
}
export interface SheetXlsx {
  name: string;
  cols: CotXlsx[];
  rows: Record<string, unknown>[];
}

const enc = new TextEncoder();

function xmlEsc(s: string): string {
  // Bo ky tu dieu khien XML khong cho phep (tru tab / xuong dong).
  return s
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function tenCot(i: number): string {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

function sheetXml(sh: SheetXlsx): string {
  const cols = sh.cols.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.width ?? 16}" customWidth="1"/>`).join("");
  const dong: string[] = [];
  dong.push(
    `<row r="1">${sh.cols.map((c, i) => `<c r="${tenCot(i)}1" t="inlineStr" s="1"><is><t>${xmlEsc(c.header)}</t></is></c>`).join("")}</row>`,
  );
  sh.rows.forEach((r, ri) => {
    const so = ri + 2;
    const o = sh.cols
      .map((c, i) => {
        const v = r[c.key];
        const ref = `${tenCot(i)}${so}`;
        if (v == null || v === "") return "";
        if ((c.kieu === "tien" || c.kieu === "so") && typeof v === "number" && Number.isFinite(v)) return `<c r="${ref}" s="${c.kieu === "tien" ? 2 : 0}"><v>${v}</v></c>`;
        return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEsc(String(v))}</t></is></c>`;
      })
      .join("");
    dong.push(`<row r="${so}">${o}</row>`);
  });
  const cuoi = `${tenCot(Math.max(0, sh.cols.length - 1))}${sh.rows.length + 1}`;
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` +
    `<cols>${cols}</cols><sheetData>${dong.join("")}</sheetData>` +
    (sh.cols.length ? `<autoFilter ref="A1:${cuoi}"/>` : "") +
    `</worksheet>`
  );
}

const STYLES =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
  `<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts>` +
  `<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>` +
  `<fill><patternFill patternType="solid"><fgColor rgb="FF006573"/><bgColor indexed="64"/></patternFill></fill></fills>` +
  `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
  `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
  `<cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
  `<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"><alignment vertical="center" wrapText="1"/></xf>` +
  `<xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs>` +
  `</styleSheet>`;

// ---- ZIP (store) ----
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(b: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function zip(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const crc = crc32(f.data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true);
    lh.setUint16(4, 20, true);
    lh.setUint16(6, 0x0800, true); // UTF-8 ten tep
    lh.setUint16(8, 0, true); // store
    lh.setUint32(14, crc, true);
    lh.setUint32(18, f.data.length, true);
    lh.setUint32(22, f.data.length, true);
    lh.setUint16(26, name.length, true);
    parts.push(new Uint8Array(lh.buffer), name, f.data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true);
    ch.setUint16(4, 20, true);
    ch.setUint16(6, 20, true);
    ch.setUint16(8, 0x0800, true);
    ch.setUint32(16, crc, true);
    ch.setUint32(20, f.data.length, true);
    ch.setUint32(24, f.data.length, true);
    ch.setUint16(28, name.length, true);
    ch.setUint32(42, offset, true);
    central.push(new Uint8Array(ch.buffer), name);
    offset += 30 + name.length + f.data.length;
  }
  const cdSize = central.reduce((s, p) => s + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true);
  end.setUint32(16, offset, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of all) out.set(p, o), (o += p.length);
  return out;
}

/** Ten sheet hop le cua Excel: <= 31 ky tu, khong []:*?/\ . */
const tenSheet = (s: string) => s.replace(/[[\]:*?/\\]/g, " ").slice(0, 31) || "Sheet";

export function taoXlsx(sheets: SheetXlsx[]): Uint8Array {
  const ds = sheets.map((s, i) => ({ ...s, name: tenSheet(s.name), file: `sheet${i + 1}.xml` }));
  const files = [
    {
      name: "[Content_Types].xml",
      data: enc.encode(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
          `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>` +
          `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
          `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
          ds.map((s) => `<Override PartName="/xl/worksheets/${s.file}" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("") +
          `</Types>`,
      ),
    },
    {
      name: "_rels/.rels",
      data: enc.encode(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
          `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
      ),
    },
    {
      name: "xl/workbook.xml",
      data: enc.encode(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>` +
          ds.map((s, i) => `<sheet name="${xmlEsc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("") +
          `</sheets>` +
          // _xlnm._FilterDatabase: Excel can dinh nghia ten nay de nut loc tren tung sheet hoat dong dung.
          `<definedNames>${ds
            .map((s, i) => `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${xmlEsc(s.name.replace(/'/g, "''"))}'!$A$1:$${tenCot(Math.max(0, s.cols.length - 1))}$${s.rows.length + 1}</definedName>`)
            .join("")}</definedNames></workbook>`,
      ),
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      data: enc.encode(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
          ds.map((s, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/${s.file}"/>`).join("") +
          `<Relationship Id="rId${ds.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
      ),
    },
    { name: "xl/styles.xml", data: enc.encode(STYLES) },
    ...ds.map((s) => ({ name: `xl/worksheets/${s.file}`, data: enc.encode(sheetXml(s)) })),
  ];
  return zip(files);
}
