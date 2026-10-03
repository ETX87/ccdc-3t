import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, FileText, Paperclip, X } from "lucide-react";
import { api } from "../api/client";
import { fmtNgayGio } from "../lib/format";
import { thongBaoLoi } from "../lib/nhan";
import {
  anhNho,
  CHAP_NHAN,
  fmtKichThuoc,
  kiemTraTep,
  LOAI_DINH_KEM,
  moTep,
  taiLen,
  type DinhKemRow,
  type DoiTuongDinhKem,
  type LoaiDinhKem,
  type TepCho,
} from "../lib/dinhKem";

// Khung "Hóa đơn, chứng từ & ảnh" trong popup chi tiet phieu / tai san: xem (anh nho, bam mo tren Drive),
// tai them, xoa mem. Quyen tai len / xoa do server tinh (co_the_tai, co_the_xoa).

function TheTep({ t, onXoa }: { t: DinhKemRow | { ten: string; mime: string; url?: string }; onXoa?: () => void }) {
  const laRow = "drive_file_id" in t;
  const ten = laRow ? t.ten_file : t.ten;
  const laAnh = t.mime.startsWith("image/");
  const href = laRow ? moTep(t.drive_file_id) : undefined;
  return (
    <div className="dinh-kem-item" title={ten}>
      <a href={href} target="_blank" rel="noreferrer" className="dinh-kem-thumb">
        {laRow && laAnh ? <img src={anhNho(t.drive_file_id)} alt={ten} loading="lazy" referrerPolicy="no-referrer" /> : !laRow && t.url ? <img src={t.url} alt={ten} /> : <FileText size={28} />}
      </a>
      {laRow && <span className="dinh-kem-loai">{LOAI_DINH_KEM[t.loai]}</span>}
      <div className="dinh-kem-ten">{ten}</div>
      {laRow && (
        <div className="dinh-kem-meta">
          {t.nguon_ma ? `Phiếu ${t.nguon_ma} · ` : ""}
          {t.nguoi_tai_ten ?? t.nguoi_tai} · {fmtNgayGio(t.created_at)} · {fmtKichThuoc(t.kich_thuoc)}
        </div>
      )}
      {onXoa && (
        <button type="button" className="dinh-kem-xoa" aria-label={`Xoá ${ten}`} title="Xoá tệp" onClick={onXoa}>
          <X size={13} />
        </button>
      )}
    </div>
  );
}

export function DinhKem({ doiTuong, id, nhacHoaDon }: { doiTuong: DoiTuongDinhKem; id: string; nhacHoaDon?: boolean }) {
  const [data, setData] = useState<{ rows: DinhKemRow[]; co_the_tai: boolean; drive_ket_noi: boolean } | null>(null);
  const [loai, setLoai] = useState<LoaiDinhKem>(nhacHoaDon ? "Hoa don" : doiTuong === "chuyen_kho" ? "Chung tu" : "Bang chung");
  const [dangTai, setDangTai] = useState<string | null>(null);
  const [xoa, setXoa] = useState<DinhKemRow | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const chon = useRef<HTMLInputElement>(null);
  const chup = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    api
      .get<{ rows: DinhKemRow[]; co_the_tai: boolean; drive_ket_noi: boolean }>(`/dinh-kem?doi_tuong=${doiTuong}&id=${encodeURIComponent(id)}`)
      .then(setData)
      .catch((e) => setErr(thongBaoLoi(e, "Không tải được tệp đính kèm.")));
  }, [doiTuong, id]);
  useEffect(load, [load]);

  async function guiTep(files: FileList | null) {
    if (!files?.length) return;
    setErr(null);
    const loi: string[] = [];
    let i = 0;
    for (const f of Array.from(files)) {
      i++;
      const sai = kiemTraTep(f);
      if (sai) {
        loi.push(sai);
        continue;
      }
      setDangTai(`Đang tải ${i}/${files.length}: ${f.name}`);
      try {
        await taiLen(doiTuong, id, f, loai);
      } catch (e) {
        loi.push(`${f.name}: ${thongBaoLoi(e)}`);
      }
    }
    setDangTai(null);
    if (loi.length) setErr(loi.join(" · "));
    load();
  }

  async function xacNhanXoa(t: DinhKemRow) {
    try {
      await api.delete(`/dinh-kem/${t.id}`);
      setXoa(null);
      load();
    } catch (e) {
      setErr(thongBaoLoi(e));
    }
  }

  const rows = data?.rows ?? [];
  const thieuHoaDon = nhacHoaDon && data && !rows.some((r) => r.loai === "Hoa don");
  return (
    <div className="dinh-kem">
      <div className="section-title" style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 6 }}>
        <Paperclip size={15} /> Hóa đơn, chứng từ & ảnh ({rows.length})
      </div>
      {err && <div className="alert alert-error">{err}</div>}
      {thieuHoaDon && <div className="alert alert-warning">Chưa có hóa đơn đính kèm cho phiếu này.</div>}
      {data && rows.length === 0 && <div className="muted small" style={{ marginBottom: 8 }}>Chưa có tệp đính kèm.</div>}
      {rows.length > 0 && (
        <div className="dinh-kem-grid">
          {rows.map((t) => (
            <TheTep key={t.id} t={t} onXoa={t.co_the_xoa && !t.nguon_ma ? () => setXoa(t) : undefined} />
          ))}
        </div>
      )}
      {xoa && (
        <div className="alert alert-warning" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ flex: 1 }}>
            Xoá tệp <b>{xoa.ten_file}</b>? Tệp vẫn được lưu trên Drive để đối chiếu, chỉ ẩn khỏi phiếu.
          </span>
          <button type="button" className="btn btn-sm" onClick={() => setXoa(null)}>
            Huỷ
          </button>
          <button type="button" className="btn btn-danger btn-sm" onClick={() => xacNhanXoa(xoa)}>
            Xoá tệp
          </button>
        </div>
      )}
      {data?.co_the_tai &&
        (data.drive_ket_noi ? (
          <div className="dinh-kem-tai">
            <select value={loai} onChange={(e) => setLoai(e.target.value as LoaiDinhKem)} aria-label="Loại tệp">
              {Object.entries(LOAI_DINH_KEM).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <button type="button" className="btn btn-outline btn-sm" disabled={!!dangTai} onClick={() => chup.current?.click()}>
              <Camera size={13} /> Chụp ảnh
            </button>
            <button type="button" className="btn btn-outline btn-sm" disabled={!!dangTai} onClick={() => chon.current?.click()}>
              <Paperclip size={13} /> Chọn tệp
            </button>
            {dangTai && <span className="muted small">{dangTai}</span>}
            <input ref={chon} type="file" accept={CHAP_NHAN} multiple hidden onChange={(e) => (guiTep(e.target.files), (e.target.value = ""))} />
            <input ref={chup} type="file" accept="image/*" capture="environment" hidden onChange={(e) => (guiTep(e.target.files), (e.target.value = ""))} />
          </div>
        ) : (
          <div className="muted small">Chưa kết nối Google Drive – Admin vào Cấu hình → Tài khoản & phân quyền để kết nối trước khi tải tệp.</div>
        ))}
    </div>
  );
}

/** O chon tep trong form lap phieu: giu danh sach tep cho (tai len sau khi phieu tao xong). */
export function ChonTep({ tep, onDoi, loaiMacDinh = "Hoa don" }: { tep: TepCho[]; onDoi: (t: TepCho[]) => void; loaiMacDinh?: LoaiDinhKem }) {
  const [loai, setLoai] = useState<LoaiDinhKem>(loaiMacDinh);
  const [loi, setLoi] = useState<string | null>(null);
  const chon = useRef<HTMLInputElement>(null);
  const chup = useRef<HTMLInputElement>(null);
  const [xem, setXem] = useState<string[]>([]);
  useEffect(() => {
    const urls = tep.map((t) => (t.file.type.startsWith("image/") ? URL.createObjectURL(t.file) : ""));
    setXem(urls);
    return () => urls.forEach((u) => u && URL.revokeObjectURL(u));
  }, [tep]);

  function them(files: FileList | null) {
    if (!files?.length) return;
    const sai: string[] = [];
    const moi = Array.from(files).filter((f) => {
      const l = kiemTraTep(f);
      if (l) sai.push(l);
      return !l;
    });
    setLoi(sai.length ? sai.join(" · ") : null);
    onDoi([...tep, ...moi.map((file) => ({ file, loai }))]);
  }

  return (
    <div className="field-group">
      <label className="field-label">Đính kèm hóa đơn, chứng từ, ảnh</label>
      {tep.length > 0 && (
        <div className="dinh-kem-grid" style={{ marginBottom: 8 }}>
          {tep.map((t, i) => (
            <div key={i} className="dinh-kem-item" title={t.file.name}>
              <div className="dinh-kem-thumb">{xem[i] ? <img src={xem[i]} alt={t.file.name} /> : <FileText size={28} />}</div>
              <span className="dinh-kem-loai">{LOAI_DINH_KEM[t.loai]}</span>
              <div className="dinh-kem-ten">{t.file.name}</div>
              <button type="button" className="dinh-kem-xoa" aria-label={`Bỏ ${t.file.name}`} onClick={() => onDoi(tep.filter((_, j) => j !== i))}>
                <X size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="dinh-kem-tai">
        <select value={loai} onChange={(e) => setLoai(e.target.value as LoaiDinhKem)} aria-label="Loại tệp">
          {Object.entries(LOAI_DINH_KEM).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <button type="button" className="btn btn-outline btn-sm" onClick={() => chup.current?.click()}>
          <Camera size={13} /> Chụp ảnh
        </button>
        <button type="button" className="btn btn-outline btn-sm" onClick={() => chon.current?.click()}>
          <Paperclip size={13} /> Chọn tệp
        </button>
        <input ref={chon} type="file" accept={CHAP_NHAN} multiple hidden onChange={(e) => (them(e.target.files), (e.target.value = ""))} />
        <input ref={chup} type="file" accept="image/*" capture="environment" hidden onChange={(e) => (them(e.target.files), (e.target.value = ""))} />
      </div>
      {loi && <div className="field-hint" style={{ color: "#dc2626" }}>{loi}</div>}
      <div className="field-hint">Ảnh hoặc PDF; ảnh chụp tự thu nhỏ trước khi tải. Tệp được tải lên sau khi lập phiếu thành công.</div>
    </div>
  );
}
