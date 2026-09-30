# -*- coding: utf-8 -*-
"""
Sinh file SQL import du lieu cu (CCDC_data_da_lam_sach.xlsx) vao schema D1 (sau migration 0007).
Chay: python scripts/generate_import_sql.py  -> scripts/import_data.sql
      (in kem bang anh xa kho + ton am de doi chieu truoc khi import production).

Quyet dinh anh xa da xac nhan truc tiep voi user:
(2026-09-22)
- Tai san co dinh: CHI import trang thai HIEN TAI. Giu theo DIA_DIEM / khong xac dinh / ke toan tu
  choi ban giao -> 'Trong kho' tai Kho tong HCNS + ghi chu nguon goc. "Ke toan xac nhan da hu hong"
  -> trang thai 'Hong' (trang thai moi tu migration 0006) tai kho HCNS.
- Nhan vien: CHI dong co MSNV hop le, khong trung. Ten CTV/GS khong MSNV giu dang text tu do.
(2026-09-24, mo hinh da kho - migration 0006)
- Nguoi tung XUAT hang trong du lieu cu = 1 kho: Phung Thi Doanh -> "Kho van Mien Bac", Nguyen Hoang
  Tuong Vy -> "Kho van Mien Nam" (loai Kho mien); MOI nguoi khac (ke ca Hoang Ngoc Nhat Tam) -> kho
  Quan ly cua chinh nguoi do. Nguoi khong co trong danh ba (khong MSNV) van co kho QL, nhan_vien_id
  NULL - HCNS gan thu kho tay o man Kho.
- Moi giao dich cu = 1 phieu_chuyen_kho 1 dong hang: tu Kho mua -> Nhap mua; toi 1 kho -> Chuyen kho;
  toi nguoi/dia diem khong phai kho -> Cap phat NV (tieu hao het).
- Ton am do du lieu cu lech: GIU NGUYEN (khong sinh phieu dieu chinh) - HCNS tu xu ly.
- Tai khoan: KHONG tao san users - danh ba nhan su se dong bo tu ETX (giong linh-kien-app); gmail tu
  cot "Mail" luu vao nhan_vien.gmail (khong FK) de tu lien ket khi nguoi do dang nhap / khop ETX.
"""
import re
from collections import Counter, defaultdict
from datetime import datetime

import openpyxl

SRC = "CCDC_data_da_lam_sach.xlsx"
OUT = "scripts/import_data.sql"
SYSTEM_USER_EMAIL = "nhap-du-lieu-cu@he-thong.local"
KHO_MUA, KHO_HCNS = 1, 2  # seed san trong migration 0006
KHO_VAN = {"Phùng Thị Doanh": "Kho vận Miền Bắc", "Nguyễn Hoàng Tường Vy": "Kho vận Miền Nam"}
XONG = {"Quản lý đã bàn giao", "Kế toán đã xác nhận", "Quản lý đã xác nhận"}
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def esc(v):
    if v is None:
        return "NULL"
    if isinstance(v, bool):
        return "1" if v else "0"
    if isinstance(v, (int, float)):
        return str(v)
    if isinstance(v, datetime):
        return "'" + v.strftime("%Y-%m-%d %H:%M:%S") + "'"
    s = str(v).strip()
    if s == "":
        return "NULL"
    return "'" + s.replace("'", "''") + "'"


def S(v):
    return str(v).strip() if v is not None else ""


def load(wb, name):
    rows = list(wb[name].iter_rows(values_only=True))
    return {h: i for i, h in enumerate(rows[0])}, rows[1:]


def bo_hau_to(t):
    return re.sub(r"\s*\([^)]*\)\s*$", "", S(t)).strip()


def kho_ref(k):
    """Bieu thuc SQL tra id kho: so (kho seed) hoac subquery theo ten (kho tao trong script)."""
    return str(k) if isinstance(k, int) else f"(SELECT id FROM kho WHERE ten_kho = {esc(k)})"


def main():
    wb = openpyxl.load_workbook(SRC, read_only=True, data_only=True)
    out = ["-- Sinh tu dong boi scripts/generate_import_sql.py - KHONG sua tay, chay lai script neu can doi.", ""]

    out.append(
        "INSERT INTO users (email, ten, vai_tro, trang_thai_duyet, bi_khoa) VALUES "
        f"({esc(SYSTEM_USER_EMAIL)}, 'Nhap du lieu cu (he thong)', 'Admin', 'Da duyet', 1) ON CONFLICT(email) DO NOTHING;"
    )
    out.append("")

    # --- nhom_ccdc ---
    idx_cd, rows_cd = load(wb, "Danh_muc_co_dinh")
    idx_th_dm, rows_th_dm = load(wb, "Danh_muc_tieu_hao")
    nhom_names = []
    for r in rows_cd + rows_th_dm:
        n = S(r[idx_cd["Nhóm dụng cụ (gốc)"]])
        if n and n not in nhom_names:
            nhom_names.append(n)
    for i, n in enumerate(nhom_names):
        out.append(f"INSERT INTO nhom_ccdc (ten_nhom, stt) SELECT {esc(n)}, {i} WHERE NOT EXISTS (SELECT 1 FROM nhom_ccdc WHERE ten_nhom = {esc(n)});")
    out.append("")

    # --- nhan_vien (+ gmail, quan ly truc tiep theo ten) ---
    idx_nv, rows_nv = load(wb, "Nhan_vien_sach")
    ten_to_manv = {}
    nv_rows = []
    for r in rows_nv:
        msnv = S(r[idx_nv["MSNV"]])
        # Cot MSNV cu lan lon: ma T..., ma dang nhap (loilm.mn2), email (4 QL PTDV), rac ('NGHỈ', ho ten).
        # Nhan moi ma KHONG co khoang trang; rac -> bo (ten van dung dang text tu do o phieu).
        if not msnv or re.search(r"\s", msnv) or msnv.upper() == "NGHỈ" or msnv in {x[0] for x in nv_rows}:
            continue
        ten = S(r[idx_nv["Họ và tên"]])
        mail = S(r[idx_nv["Mail"]]).lower() or (msnv.lower() if "@" in msnv else "")
        nv_rows.append((msnv, ten, r[idx_nv["Bộ phận"]], r[idx_nv["Cấp độ"]], 1 if r[idx_nv["Đang hoạt động"]] else 0, mail if EMAIL_RE.match(mail) else None, S(r[idx_nv["Quản lý trực tiếp"]])))
        ten_to_manv.setdefault(ten, msnv)
        ten_to_manv.setdefault(bo_hau_to(ten), msnv)
    out.append(f"-- {len(nv_rows)} nhan vien co MSNV hop le (tren {len(rows_nv)} dong nguon).")
    for msnv, ten, bp, cv, on, mail, _ in nv_rows:
        out.append(
            "INSERT INTO nhan_vien (ma_nv, ten_nv, bo_phan, chuc_vu, dang_lam_viec, gmail) VALUES "
            f"({esc(msnv)}, {esc(ten)}, {esc(bp)}, {esc(cv)}, {on}, {esc(mail)}) ON CONFLICT(ma_nv) DO NOTHING;"
        )
    n_ql = 0
    co_cap_duoi = set()
    for msnv, _, _, _, on, _, ql_ten in nv_rows:
        ql = ten_to_manv.get(ql_ten)
        if ql and ql != msnv:
            out.append(f"UPDATE nhan_vien SET quan_ly_id = {esc(ql)} WHERE ma_nv = {esc(msnv)} AND quan_ly_id IS NULL;")
            n_ql += 1
            if on:
                co_cap_duoi.add(ql)
    out.append("")
    print(f"nhan_vien: {len(nv_rows)} dong, {n_ql} co quan ly truc tiep khop danh ba, {len(co_cap_duoi)} quan ly co cap duoi")

    # --- kho ---
    idx_th, rows_th = load(wb, "QL_tieu_hao_sach")

    ten_nguon = {bo_hau_to(r[idx_th["Kho đi (gốc)"]]) for r in rows_th}

    def canon(t):
        """Ten nguoi chuan hoa: bo hau to '(PTDV MN)', tach 'Hoang Ngoc Nhat Tam - ptdv' / 'GS DVBH - Ngo Van
        Tuan' lay phan khop danh ba hoac khop 1 nguoi tung xuat hang - de cung 1 nguoi ghi nhieu kieu o
        'Kho di' va 'Kho den' ve cung 1 kho."""
        b = bo_hau_to(t)
        for p in [b] + [x.strip() for x in re.split(r"\s*-\s*", b)]:
            if p in ten_to_manv or p in ten_nguon:
                return p
        return b

    nguon = Counter(canon(r[idx_th["Kho đi (gốc)"]]) for r in rows_th)
    goc_theo_canon = defaultdict(set)
    for r in rows_th:
        goc_theo_canon[canon(r[idx_th["Kho đi (gốc)"]])].add(S(r[idx_th["Kho đi (gốc)"]]))

    def node(t):
        """Kho tuong ung 1 gia tri 'Kho di/den' cu (id so / ten kho QL / ten kho van), hoac None neu la
        noi tieu hao (nguoi thuong / dia diem nhu 'Kho tieu hao', 'Van phong ...')."""
        c = canon(t)
        if c.lower() == "kho mua hàng":
            return KHO_MUA
        if c == "Kho tổng HCNS":
            return KHO_HCNS
        if c in KHO_VAN:
            return KHO_VAN[c]
        if c in nguon:
            return f"Kho QL - {c}"
        return None

    out.append("-- Kho mien (kho van) + kho QL cho moi nguoi tung xuat hang (du lieu cu).")
    for ten_kho in KHO_VAN.values():
        out.append(f"INSERT INTO kho (ten_kho, loai) SELECT {esc(ten_kho)}, 'Mien' WHERE NOT EXISTS (SELECT 1 FROM kho WHERE ten_kho = {esc(ten_kho)});")
    bang_kho = []
    for c, n in nguon.most_common():
        k = node(c)
        manv = ten_to_manv.get(c)
        if isinstance(k, str) and k.startswith("Kho QL - "):
            # Nguoi da co kho QL (vd ETX sync tao truoc) -> doi ten kho do ve ten nay de phieu tham chieu duoc.
            if manv:
                out.append(f"UPDATE kho SET ten_kho = {esc(k)} WHERE nhan_vien_id = {esc(manv)};")
            out.append(
                f"INSERT INTO kho (ten_kho, loai, nhan_vien_id) SELECT {esc(k)}, 'Quan ly', {esc(manv)} "
                f"WHERE NOT EXISTS (SELECT 1 FROM kho WHERE ten_kho = {esc(k)});"
            )
        bang_kho.append((" / ".join(sorted(goc_theo_canon[c])), n, k if k is not None else "-", manv or "(khong co trong danh ba)"))
    # Kho QL cho quan ly co cap duoi (theo so do Excel) chua co kho - ETX sync cung lam dieu nay.
    for ql in sorted(co_cap_duoi):
        out.append(
            "INSERT INTO kho (ten_kho, loai, nhan_vien_id) SELECT 'Kho QL - ' || ten_nv, 'Quan ly', ma_nv FROM nhan_vien "
            f"WHERE ma_nv = {esc(ql)} ON CONFLICT(nhan_vien_id) DO NOTHING;"
        )
    out.append("")

    # --- ccdc (tai san co dinh) ---
    idx_ts, rows_ts = load(wb, "QL_tai_san_sach")
    cat_info = {r[idx_cd["ID tài sản"]]: {"nhom": r[idx_cd["Nhóm dụng cụ (gốc)"]], "dvt": r[idx_cd["Đơn vị tính (đã chuẩn hoá)"]], "gia": r[idx_cd["Giá mua"]]} for r in rows_cd}
    seq = Counter()
    thong_ke_ts = Counter()
    for r in rows_ts:
        cat_id = r[idx_ts["ID tài sản"]]
        if cat_id not in cat_info:
            continue
        seq[cat_id] += 1
        info = cat_info[cat_id]
        kq = r[idx_ts["Kết quả bàn giao"]]
        loai_giu = r[idx_ts["loai_nguoi_giu"]]
        ten_giu = S(r[idx_ts["nguoi_giu_ten"]])
        kho_den = S(r[idx_ts["Kho đến (gốc)"]])

        trang_thai, nguoi, kho_id, ghi_chu = "Trong kho", None, KHO_HCNS, None
        tinh_trang = "Tot"
        if kq == "Kế toán xác nhận đã hư hỏng":
            trang_thai, tinh_trang = "Hong", "Hong"
        elif kq == "Kế toán đã từ chối":
            ghi_chu = "Du lieu cu: bàn giao đã bị kế toán từ chối"
        elif loai_giu == "NGUOI" and kq in ("Đã xác nhận bàn giao", "Chờ xác nhận bàn giao"):
            manv = ten_to_manv.get(canon(ten_giu))
            if manv:
                trang_thai, nguoi, kho_id = "Dang cap phat", manv, None
            else:
                ghi_chu = f"Du lieu cu: nguoi giu '{ten_giu}' khong khop danh ba nhan vien"
        elif loai_giu == "DIA_DIEM":
            ghi_chu = f"Du lieu cu: dang o dia diem '{kho_den}'"
        elif loai_giu == "KHONG_XAC_DINH":
            ghi_chu = "Du lieu cu: khong xac dinh duoc nguoi/noi giu"
        thong_ke_ts[trang_thai] += 1
        out.append(
            "INSERT INTO ccdc (id, ten_ccdc, nhom_id, don_vi_tinh, so_seri, ngay_mua, nguyen_gia, tinh_trang, "
            "trang_thai_hien_tai, nguoi_dang_giu, kho_id, ghi_chu, nguoi_tao) VALUES ("
            f"{esc(f'{cat_id}-{seq[cat_id]:03d}')}, {esc(r[idx_ts['Tên tài sản']])}, (SELECT id FROM nhom_ccdc WHERE ten_nhom = {esc(info['nhom'])}), "
            f"{esc(info['dvt'])}, {esc(r[idx_ts['Key, serial tài sản']])}, {esc(r[idx_ts['Ngày mua']])}, {esc(info['gia'])}, {esc(tinh_trang)}, "
            f"{esc(trang_thai)}, {esc(nguoi)}, {kho_ref(kho_id) if kho_id else 'NULL'}, {esc(ghi_chu)}, {esc(SYSTEM_USER_EMAIL)}) ON CONFLICT(id) DO NOTHING;"
        )
    out.append("")
    print(f"ccdc: {sum(thong_ke_ts.values())} dong {dict(thong_ke_ts)}")

    # Don gia nhap sai trong du lieu cu (dong bo voi migrations/0008_giao_dien.sql muc 4 - chay lai script
    # tren DB moi van ra gia dung): (vt_id, don gia sai) -> don gia dung.
    GIA_SUA = {("TS3T-000045", 17000000): 17000, ("TS3T-000089", 4140000): 13800}

    def gia_dung(vt_id, gia):
        return GIA_SUA.get((vt_id, gia), gia) if isinstance(gia, (int, float)) else gia

    # --- vt_tieu_hao ---
    for r in rows_th_dm:
        out.append(
            "INSERT INTO vt_tieu_hao (id, ten_vt, nhom_id, don_vi_tinh, don_gia_tham_khao, nguoi_tao) VALUES ("
            f"{esc(r[idx_th_dm['ID tài sản']])}, {esc(r[idx_th_dm['Tên tài sản']])}, (SELECT id FROM nhom_ccdc WHERE ten_nhom = {esc(r[idx_th_dm['Nhóm dụng cụ (gốc)']])}), "
            f"{esc(r[idx_th_dm['Đơn vị tính (đã chuẩn hoá)']])}, {esc(gia_dung(r[idx_th_dm['ID tài sản']], r[idx_th_dm['Giá mua']]))}, {esc(SYSTEM_USER_EMAIL)}) ON CONFLICT(id) DO NOTHING;"
        )
    out.append("")

    # --- phieu_chuyen_kho (1 giao dich cu = 1 phieu 1 dong hang) ---
    thong_ke = Counter()
    bo_qua = []
    ton = defaultdict(float)  # (kho, vt) -> ton, de bao cao ton am
    for r in rows_th:
        gd = r[idx_th["ID giao dịch"]]
        vt = r[idx_th["ID tài sản"]]
        tu = node(S(r[idx_th["Kho đi (gốc)"]]))
        den_raw = S(r[idx_th["Kho đến (gốc)"]])
        ten_nhan = S(r[idx_th["nguoi_kho_den"]]) or den_raw
        den = node(ten_nhan) if ten_nhan else None
        if den is None and den_raw:
            den = node(den_raw)
        tt_goc = r[idx_th["Trạng thái"]]
        sl = r[idx_th["Số lượng"]] or 0
        if not isinstance(sl, (int, float)) or sl <= 0:
            bo_qua.append((gd, vt, S(r[idx_th["Kho đi (gốc)"]]), S(r[idx_th["Kho đến (gốc)"]]), sl, r[idx_th["Thành tiền"]]))
            continue  # CHECK so_luong > 0 - khong anh huong ton, liet ke de HCNS doi chieu
        ngay = r[idx_th["Tháng tạo"]]
        if tu is None:
            tu = KHO_HCNS  # nguon khong xac dinh (1 dong) -> coi nhu tu kho HCNS

        den_nv, tu_do = None, None
        if tu == KHO_MUA:
            loai, den = "Nhap mua", den if den is not None else KHO_HCNS
        elif den is not None and den != tu:
            loai = "Chuyen kho"
        else:
            loai, den = "Cap phat NV", None
            den_nv = ten_to_manv.get(canon(ten_nhan)) if ten_nhan else None
            if not den_nv:
                tu_do = ten_nhan or "(không rõ người nhận - dữ liệu cũ)"

        if tt_goc in XONG:
            trang_thai = "Da giao" if loai == "Cap phat NV" else "Da nhan"
        elif tt_goc == "Kế toán đã từ chối":
            trang_thai = "Ke toan tu choi" if loai == "Nhap mua" else "Bi tu choi"
        elif loai == "Nhap mua":
            trang_thai = "Cho ke toan duyet"
        else:  # cho QL / KT xac nhan - he moi KT khong duyet chuyen kho -> cho ben nhan
            trang_thai = "Dang chuyen" if loai == "Chuyen kho" else "Da giao"
        da_xn = 1 if (loai == "Cap phat NV" and tt_goc in XONG) else 0
        thong_ke[(loai, trang_thai)] += 1

        if trang_thai in ("Dang chuyen", "Da nhan", "Da giao") and tu != KHO_MUA:
            ton[(tu, vt)] -= float(sl)
        if trang_thai == "Da nhan" and den is not None:
            ton[(den, vt)] += float(sl)

        out.append(
            "INSERT INTO phieu_chuyen_kho (id, ma_phieu, loai, tu_kho_id, den_kho_id, den_nhan_vien_id, nguoi_nhan_ten_tu_do, nguoi_lap, "
            "trang_thai, da_xac_nhan, ghi_chu, created_at, updated_at) VALUES ("
            f"{esc(gd)}, {esc(gd)}, {esc(loai)}, {kho_ref(tu)}, {kho_ref(den) if den is not None else 'NULL'}, {esc(den_nv)}, {esc(tu_do)}, "
            f"{esc(SYSTEM_USER_EMAIL)}, {esc(trang_thai)}, {da_xn}, {esc('Du lieu cu: ' + str(tt_goc))}, {esc(ngay)}, {esc(ngay)}) ON CONFLICT(id) DO NOTHING;"
        )
        out.append(
            "INSERT INTO phieu_chuyen_kho_ct (phieu_id, vt_id, so_luong, don_gia, thanh_tien) SELECT "
            f"{esc(gd)}, {esc(vt)}, {esc(sl)}, {esc(gia_dung(vt, r[idx_th['Đơn giá']]))}, "
            f"{esc(sl * gia_dung(vt, r[idx_th['Đơn giá']]) if gia_dung(vt, r[idx_th['Đơn giá']]) != r[idx_th['Đơn giá']] else r[idx_th['Thành tiền']])} "
            f"WHERE NOT EXISTS (SELECT 1 FROM phieu_chuyen_kho_ct WHERE phieu_id = {esc(gd)});"
        )
        out.append(
            "INSERT INTO phieu_chuyen_kho_log (phieu_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu) SELECT "
            f"{esc(gd)}, {esc(trang_thai)}, {esc(SYSTEM_USER_EMAIL)}, {esc(ngay)}, 'Nhap tu du lieu cu' "
            f"WHERE NOT EXISTS (SELECT 1 FROM phieu_chuyen_kho_log WHERE phieu_id = {esc(gd)});"
        )
    out.append("")
    # KHONG BEGIN/COMMIT: D1 remote tu chay ca file --file nguyen tu, va tu choi lenh BEGIN TRANSACTION.

    with open(OUT, "w", encoding="utf-8") as f:
        f.write("\n".join(out))

    print(f"phieu_chuyen_kho: {sum(thong_ke.values())} phieu")
    for (l, t), n in sorted(thong_ke.items()):
        print(f"   {l:12} {t:18} {n}")
    print("\nBANG ANH XA NGUON XUAT CU -> KHO MOI (so giao dich | kho | ma NV chu kho):")
    for t, n, k, manv in bang_kho:
        print(f"   {n:5} | {t} -> {k if isinstance(k, str) else ('Kho mua hàng' if k == KHO_MUA else 'Kho tổng HCNS')} | {manv}")
    print(f"\nBO QUA {len(bo_qua)} giao dich so luong <= 0:")
    for b in bo_qua:
        print("   " + " | ".join(str(x) for x in b))
    am = [(k, v, q) for (k, v), q in ton.items() if q < -1e-9]
    print(f"\nTON AM giu nguyen theo quyet dinh user ({len(am)} cap):")
    for k, v, q in sorted(am, key=lambda x: x[2]):
        print(f"   {k if isinstance(k, str) else ('Kho tổng HCNS' if k == KHO_HCNS else k)} | {v} | {q:g}")
    print(f"\nDa ghi {OUT} ({len(out)} dong)")


if __name__ == "__main__":
    main()
