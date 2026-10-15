# -*- coding: utf-8 -*-
"""
Sinh SQL import du lieu cu cong ty NSKX (Google Sheet, 5 tab xuat TSV) vao D1 - cong_ty_id = 2.
Chay: python scripts/import_nskx.py <thu_muc_tsv> <ban_sao_db.sqlite> [out.sql]
  - <ban_sao_db.sqlite>: ban sao production MOI (wrangler d1 export -> sqlite) - dung de quyet dinh
    khop nhan su / hoat dong ben 3T. Script CHI DOC ban sao, khong ghi.
  - In bang doi chieu (nhan su, kho, phieu, ton am) de kiem tra truoc khi --remote.

Quyet dinh da chot voi user (2026-10-15):
- Nhan su NSKX (cot "MSNV moi" dang T...) da co trong danh ba (ETX dong bo, dang xep cong ty 3T) -> CHUYEN
  ho so do sang NSKX (giu ma NS-xxx), kho QL cua ho chuyen theo neu kho chua co phieu / tai san. Khop theo:
  ma_nv trung MSNV > Gmail > ten (bo dau) DUY NHAT va khong co hoat dong ben 3T (giu tai san, nhan cap phat,
  thu kho, kho co phieu). Trung ten >= 2 ho so / co hoat dong 3T -> tao ho so NSKX moi bang MSNV (ma tam,
  ma_etx NULL) de HCNS gop tay ("Doi ma / gop").
- TSCD: chi trang thai HIEN TAI (giong import 3T). Moi dia diem (Van phong Ha Noi, Kho sua chua HCM, Kho 3T)
  = 1 kho NSKX loai Mien; "Da xac nhan ban giao" toi dia diem -> Trong kho tai do; toi nguoi -> Dang cap phat;
  chua / cho ban giao -> Trong kho tai kho xuat (Kho mua -> Kho tong HCNS) + ghi chu; KT xac nhan hu hong -> Hong.
- Tieu hao: 1 giao dich = 1 phieu 1 dong (giong import 3T, ma_phieu = ID goc). Kho mua -> HCNS = Nhap mua;
  HCNS -> "Kho cap phat vat pham" (kho Mien, thu kho Dang Thi Trang Anh) = Chuyen kho; HCNS -> "Kho tieu hao"
  (loai Tieu hao) = Cap phat NV vao kho tieu hao; Kho cap phat vat pham -> nguoi = Cap phat NV. Ton am giu nguyen.
  created_at = "Ngay tao"; updated_at = luc xac nhan (KT / log) - bao cao nhap xuat ton tinh hang VAO kho theo
  updated_at.
- Vai tro: Trieu Thuy Linh = HCNS, Phan Thu Phuong = Ke toan (chi khi ho so da chuyen sang NSKX).
"""
import csv
import re
import sqlite3
import sys
import unicodedata
from collections import Counter, defaultdict

CT = 2
SYS = "nhap-du-lieu-cu@he-thong.local"
NOW = "2026-10-15 09:00:00"
DIA_DIEM = ["Văn phòng Hà Nội", "Kho sửa chữa Hồ Chí Minh", "Kho 3T"]
KHO_CPVP = "Kho cấp phát vật phẩm"
KHO_TH = "Kho tiêu hao"
THU_KHO_CPVP = "anhdang19991017@gmail.com"
VAI_TRO = {"trieuthuylinh131295@gmail.com": "HCNS", "phanphuongst2000@gmail.com": "Ke toan"}


def esc(v):
    if v is None:
        return "NULL"
    if isinstance(v, (int, float)):
        return repr(v) if isinstance(v, float) and not v.is_integer() else str(int(v))
    s = str(v).strip()
    return "NULL" if s == "" else "'" + s.replace("'", "''") + "'"


def bo_dau(s):
    s = unicodedata.normalize("NFD", s or "")
    s = "".join(ch for ch in s if unicodedata.category(ch) != "Mn").replace("đ", "d").replace("Đ", "D")
    return re.sub(r"\s+", " ", s).strip().lower()


def chuan(s):
    return re.sub(r"\s+", " ", unicodedata.normalize("NFC", s or "")).strip()


def so(s):
    s = (s or "").strip().replace(".", "").replace(",", "")
    return int(s) if re.fullmatch(r"-?\d+", s) else None


def ngay(s):
    """dd/mm/yyyy[ h:mm:ss] -> YYYY-MM-DD HH:MM:SS (gio VN - sheet ghi gio VN)."""
    m = re.match(r"^(\d{1,2})/(\d{1,2})/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?", (s or "").strip())
    if not m:
        return None
    d, mo, y, hh, mi, ss = m.groups()
    return f"{y}-{int(mo):02d}-{int(d):02d} {int(hh or 0):02d}:{mi or '00'}:{ss or '00'}"


def doc_tsv(path, so_cot):
    """Doc TSV Google (khong quote): dong co o xuong dong bi vo -> ghep lai cho du so cot."""
    out, buf = [], None
    for line in open(path, encoding="utf-8").read().split("\n"):
        line = line.rstrip("\r")
        cells = line.split("\t")
        if buf is not None:
            buf[-1] += "\n" + cells[0]
            buf += cells[1:]
            cells = buf
            buf = None
        if len(cells) < so_cot and any(c.strip() for c in cells):
            buf = cells
            continue
        out.append(cells)
    hdr = out[0]
    return [dict(zip(hdr, r)) for r in out[1:] if any(c.strip() for c in r)]


def main():
    src, db_path = sys.argv[1], sys.argv[2]
    out_path = sys.argv[3] if len(sys.argv) > 3 else "scripts/import_nskx.sql"
    db = sqlite3.connect(db_path)
    q = lambda sql, *a: db.execute(sql, a).fetchall()

    ds = doc_tsv(f"{src}/ds_tai_san.tsv", 16)
    ts = doc_tsv(f"{src}/tai_san.tsv", 20)
    th = doc_tsv(f"{src}/tieu_hao.tsv", 23)
    ns = doc_tsv(f"{src}/nhan_su.tsv", 8)
    L = ["-- Sinh tu dong boi scripts/import_nskx.py - KHONG sua tay.", ""]
    L.append(
        "INSERT INTO users (email, ten, vai_tro, trang_thai_duyet, bi_khoa) VALUES "
        f"({esc(SYS)}, 'Nhap du lieu cu (he thong)', 'Admin', 'Da duyet', 1) ON CONFLICT(email) DO NOTHING;"
    )

    # ------------------------------------------------------------------ nhan su
    prod = q("SELECT ma_nv, ten_nv, ma_etx, lower(COALESCE(gmail,'')), lower(COALESCE(email_dang_nhap,'')), cong_ty_id FROM nhan_vien")
    by_ma = {r[0]: r for r in prod}
    by_mail = {}
    for r in prod:
        for m in (r[3], r[4]):
            if m:
                by_mail.setdefault(m, r)
    by_ten = defaultdict(list)
    for r in prod:
        by_ten[bo_dau(r[1])].append(r)

    def hoat_dong_3t(ma):
        """So hoat dong cua ho so ben 3T - co thi KHONG chuyen cong ty khi chi khop ten."""
        n = q(
            "SELECT (SELECT COUNT(*) FROM ccdc WHERE nguoi_dang_giu = ?1) + (SELECT COUNT(*) FROM phieu_chuyen_kho WHERE den_nhan_vien_id = ?1)"
            " + (SELECT COUNT(*) FROM phieu_giao_nhan WHERE nhan_vien_id = ?1 OR nhan_vien_nhan_moi_id = ?1)"
            " + (SELECT COUNT(*) FROM kho k JOIN phieu_chuyen_kho p ON p.tu_kho_id = k.id OR p.den_kho_id = k.id WHERE k.nhan_vien_id = ?1)"
            " + (SELECT COUNT(*) FROM kho k JOIN ccdc c ON c.kho_id = k.id WHERE k.nhan_vien_id = ?1)",
            ma,
        )[0][0]
        return n

    ms_da_dung = {}
    nv_map = {}  # MSNV goc -> ma_nv dich
    ten_map = {}  # ten chuan (bo dau) -> ma_nv dich (de khop nguoi nhan / nguoi giu)
    chuyen, tao, ly_do = [], [], Counter()
    KHONG_PHAI_NGUOI = {"KHO", "KHO VAN", "Mua hàng"}
    so_tam = 0
    for r in ns:
        ms = chuan(r["MSNV mới"])
        ten = chuan(r["Họ và tên"])
        mail0 = chuan(r["Mail"]).lower()
        la_nguoi = bool(ten) and chuan(r["Cấp độ"]) not in KHONG_PHAI_NGUOI and ms != "Chuabangiao" and not re.match(r"^(kho tong|ketoanxacnhan)", ms)
        if not la_nguoi:
            # Dong "kho" (Kho tong HCNS / Ke toan xac nhan / Kho cap phat vat pham) ghi Gmail nguoi van hanh -> chuyen ho so do.
            if mail0 in by_mail and by_mail[mail0][0] not in {c[0] for c in chuyen}:
                chuyen.append((by_mail[mail0][0], r, ten))
                ly_do["chuyen sang NSKX (gmail dong kho)"] += 1
            continue
        if not re.fullmatch(r"(T|NS-)\d+", ms):
            so_tam += 1
            ms = f"NSKX-TAM-{so_tam:03d}"
        ten = re.sub(r"^(.+?)\1$", r"\1", ten)  # "Nguyen Van KienNguyen Van Kien"
        mail = chuan(r["Mail"]).lower()
        if ms in ms_da_dung:
            if bo_dau(ms_da_dung[ms]) == bo_dau(ten) or bo_dau(ten).startswith(bo_dau(ms_da_dung[ms])) and not re.search(r"\d$", ten):
                ten_map.setdefault(bo_dau(ten), nv_map[ms])
                continue
            ms_goc, k = ms, 2
            while f"{ms_goc}-{k}" in ms_da_dung:
                k += 1
            ms = f"{ms_goc}-{k}"
        ms_da_dung[ms] = ten
        dich, cach = None, None
        if ms in by_ma:
            dich, cach = by_ma[ms], "ma"
        elif mail and mail in by_mail:
            dich, cach = by_mail[mail], "gmail"
        else:
            hits = by_ten.get(bo_dau(ten), [])
            if len(hits) == 1 and hits[0][5] != CT:
                if hoat_dong_3t(hits[0][0]) == 0:
                    dich, cach = hits[0], "ten"
                else:
                    ly_do["trung ten nhung co hoat dong 3T -> tao moi"] += 1
            elif len(hits) > 1:
                ly_do["trung ten >= 2 ho so -> tao moi"] += 1
        if dich:
            ly_do[f"chuyen sang NSKX (khop {cach})"] += 1
            nv_map[ms] = dich[0]
            chuyen.append((dich[0], r, ten))
        else:
            ly_do["tao moi (ma tam)"] += 1
            nv_map[ms] = ms
            tao.append((ms, ten, r, mail))
        ten_map.setdefault(bo_dau(ten), nv_map[ms])
    nv_map_goc = dict(nv_map)

    L.append(f"\n-- Nhan su: chuyen {len(chuyen)} ho so sang NSKX, tao moi {len(tao)}.")
    for ma, r, _ in chuyen:
        L.append(
            f"UPDATE nhan_vien SET cong_ty_id = {CT}, bo_phan = COALESCE(bo_phan, {esc(r['Bộ Phận'])}), updated_at = {esc(NOW)} WHERE ma_nv = {esc(ma)};"
        )
        # Kho QL cua ho (ETX tu tao) chuyen theo neu chua co phieu / tai san.
        L.append(
            f"UPDATE kho SET cong_ty_id = {CT}, updated_at = {esc(NOW)} WHERE nhan_vien_id = {esc(ma)} "
            "AND NOT EXISTS (SELECT 1 FROM phieu_chuyen_kho p WHERE p.tu_kho_id = kho.id OR p.den_kho_id = kho.id) "
            "AND NOT EXISTS (SELECT 1 FROM ccdc c WHERE c.kho_id = kho.id);"
        )
    for ms, ten, r, mail in tao:
        on = 0 if chuan(r["Hoạt động"]).upper() == "FALSE" else 1
        gm = mail if re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", mail or "") and mail not in by_mail else None
        L.append(
            "INSERT INTO nhan_vien (ma_nv, ten_nv, bo_phan, chuc_vu, dang_lam_viec, gmail, ghi_chu, cong_ty_id, created_at, updated_at) VALUES ("
            f"{esc(ms)}, {esc(ten)}, {esc(r['Bộ Phận'])}, {esc(r['Cấp độ'])}, {on}, {esc(gm)}, 'Du lieu cu NSKX (ma tam)', {CT}, {esc(NOW)}, {esc(NOW)}) "
            "ON CONFLICT(ma_nv) DO NOTHING;"
        )
    # Quan ly truc tiep (cot QLTT = ten) - chi dien cho ho so moi tao.
    n_ql = 0
    for ms, ten, r, _ in tao:
        ql = ten_map.get(bo_dau(r["QLTT"]))
        if ql and ql != ms:
            L.append(f"UPDATE nhan_vien SET quan_ly_id = {esc(ql)} WHERE ma_nv = {esc(ms)} AND quan_ly_id IS NULL;")
            n_ql += 1

    # Vai tro + thu kho (tai khoan da ton tai - ETX tu tao)
    for email, vt in VAI_TRO.items():
        ma = by_mail.get(email)
        if ma and ma[0] in {c[0] for c in chuyen}:
            L.append(f"UPDATE users SET vai_tro = {esc(vt)}, updated_at = {esc(NOW)} WHERE email = {esc(email)} AND vai_tro IS NULL;")

    # ------------------------------------------------------------------ danh muc
    nhoms = []
    for r in ds:
        n = chuan(r["Nhóm dụng cụ"])
        if n and n not in nhoms:
            nhoms.append(n)
    L.append("")
    for i, n in enumerate(nhoms):
        L.append(
            f"INSERT INTO nhom_ccdc (ten_nhom, stt, cong_ty_id) SELECT {esc(n)}, {i}, {CT} "
            f"WHERE NOT EXISTS (SELECT 1 FROM nhom_ccdc WHERE ten_nhom = {esc(n)} AND cong_ty_id = {CT});"
        )
    nhom = lambda n: f"(SELECT id FROM nhom_ccdc WHERE ten_nhom = {esc(chuan(n))} AND cong_ty_id = {CT})"
    dm = {r["ID tài sản"].strip(): r for r in ds}
    # Vat tu khai trung (cung ten + DVT, 2 ma) -> gop ve ma dau tien, don gia lay muc cao nhat (vd "26" vs "26.000").
    gop, nhom_vt = {}, defaultdict(list)
    for r in ds:
        if r["Phân loại tài sản"].strip() == "Tài sản tiêu hao":
            nhom_vt[(bo_dau(r["Tên tài sản"]), bo_dau(r["Đơn vị tính"]))].append(r)
    gia_gop = {}
    for rs in nhom_vt.values():
        for r in rs[1:]:
            gop[r["ID tài sản"].strip()] = rs[0]["ID tài sản"].strip()
        gia_gop[rs[0]["ID tài sản"].strip()] = max((so(r["Giá mua"]) or 0) for r in rs) or None
    n_vt = 0
    for r in ds:
        if r["Phân loại tài sản"].strip() != "Tài sản tiêu hao" or r["ID tài sản"].strip() in gop:
            continue
        n_vt += 1
        L.append(
            "INSERT INTO vt_tieu_hao (id, ten_vt, nhom_id, don_vi_tinh, don_gia_tham_khao, nguoi_tao, cong_ty_id, created_at, updated_at) VALUES ("
            f"{esc(r['ID tài sản'])}, {esc(chuan(r['Tên tài sản']))}, {nhom(r['Nhóm dụng cụ'])}, {esc(r['Đơn vị tính'])}, {esc(gia_gop.get(r['ID tài sản'].strip()))}, "
            f"{esc(SYS)}, {CT}, {esc(ngay(r['Ngày tạo']) or NOW)}, {esc(NOW)}) ON CONFLICT(id) DO NOTHING;"
        )

    # ------------------------------------------------------------------ kho
    L.append("")
    kho_moi = [(t, "Mien") for t in DIA_DIEM] + [(KHO_CPVP, "Mien"), (KHO_TH, "Tieu hao")]
    for t, loai in kho_moi:
        L.append(
            f"INSERT INTO kho (ten_kho, loai, cong_ty_id, ghi_chu, created_at, updated_at) SELECT {esc(t)}, {esc(loai)}, {CT}, 'Du lieu cu NSKX', {esc(NOW)}, {esc(NOW)} "
            f"WHERE NOT EXISTS (SELECT 1 FROM kho WHERE ten_kho = {esc(t)} AND cong_ty_id = {CT});"
        )
    KHO_MUA = f"(SELECT id FROM kho WHERE loai = 'Mua hang' AND cong_ty_id = {CT})"
    KHO_HCNS = f"(SELECT id FROM kho WHERE loai = 'HCNS' AND cong_ty_id = {CT})"
    kho = lambda t: f"(SELECT id FROM kho WHERE ten_kho = {esc(t)} AND cong_ty_id = {CT})"
    L.append(
        f"INSERT INTO kho_thu_kho (kho_id, email, created_at) SELECT {kho(KHO_CPVP)}, {esc(THU_KHO_CPVP)}, {esc(NOW)} "
        f"WHERE EXISTS (SELECT 1 FROM users WHERE email = {esc(THU_KHO_CPVP)}) ON CONFLICT DO NOTHING;"
    )

    def tim_nguoi(ten):
        """Ten nguoi nhan / nguoi giu -> ma_nv (ten NSKX truoc, sau do ten trong danh ba neu duy nhat)."""
        k = bo_dau(ten)
        if k in ten_map:
            return ten_map[k]
        hits = by_ten.get(k, [])
        return hits[0][0] if len(hits) == 1 else None

    # ------------------------------------------------------------------ TSCD
    L.append("")
    seq = Counter()
    tk_ts = Counter()
    for r in ts:
        loai_id = r["ID Tài sản"].strip()
        info = dm.get(loai_id)
        if not info:
            continue
        seq[loai_id] += 1
        kq = chuan(r["Kết quả bàn giao"])
        di, den = chuan(r["Kho đi"]), chuan(r["Kho đến"])
        kho_di = KHO_HCNS if di in ("Kho mua hàng", "Kho tổng HCNS", "") else kho(di)
        tt, tinh, nguoi, kho_id, gc = "Trong kho", "Tot", None, kho_di, []
        if kq == "Kế toán xác nhận đã hư hỏng":
            tt, tinh = "Hong", "Hong"
            kho_id = kho(den) if den in DIA_DIEM else KHO_HCNS
            if den not in DIA_DIEM and den not in ("Kho tổng HCNS", "Chưa bàn giao"):
                gc.append(f"Du lieu cu: hong khi dang o '{den}'")
        elif kq == "Đã xác nhận bàn giao":
            if den in DIA_DIEM:
                kho_id = kho(den)
            elif den == "Kho tổng HCNS":
                kho_id = KHO_HCNS
            else:
                ma = tim_nguoi(den)
                if ma:
                    tt, nguoi, kho_id = "Dang cap phat", ma, None
                else:
                    gc.append(f"Du lieu cu: nguoi giu '{den}' khong khop danh ba")
        else:  # Chua / cho ban giao -> van o kho xuat
            ma = tim_nguoi(den) if den not in DIA_DIEM and den not in ("Kho tổng HCNS", "Chưa bàn giao") else None
            if kq == "Chờ xác nhận bàn giao" and ma:
                tt, nguoi, kho_id = "Dang cap phat", ma, None  # giong import 3T
            elif den and den != "Chưa bàn giao" and den != di:
                gc.append(f"Du lieu cu: {kq.lower()} toi '{den}'")
        for c in ("Mô tả chi tiết", "Ghi chú", "Ghi chú log"):
            if chuan(r.get(c)):
                gc.append(chuan(r[c]))
        tk_ts[tt] += 1
        tao_luc = ngay(r["Ngày giờ tạo"]) or NOW
        ngay_mua = ngay(r["Ngày mua"])
        L.append(
            "INSERT INTO ccdc (id, ten_ccdc, nhom_id, don_vi_tinh, so_seri, ngay_mua, nguyen_gia, tinh_trang, trang_thai_hien_tai, "
            "nguoi_dang_giu, kho_id, ghi_chu, nguoi_tao, cong_ty_id, created_at, updated_at) VALUES ("
            f"{esc(f'{loai_id}-{seq[loai_id]:03d}')}, {esc(chuan(r['Tên tài sản']))}, {nhom(info['Nhóm dụng cụ'])}, {esc(info['Đơn vị tính'])}, "
            f"{esc(r['Key, serial tài sản'])}, {esc(ngay_mua[:10] if ngay_mua else None)}, {esc(so(info['Giá mua']))}, {esc(tinh)}, {esc(tt)}, "
            f"{esc(nguoi)}, {kho_id if kho_id else 'NULL'}, {esc(' | '.join(gc) or None)}, {esc(SYS)}, {CT}, {esc(tao_luc)}, {esc(NOW)}) ON CONFLICT(id) DO NOTHING;"
        )

    # ------------------------------------------------------------------ tieu hao
    L.append("")
    XONG = {"Quản lý đã bàn giao", "Kế toán đã xác nhận", "Quản lý đã xác nhận"}
    tk = Counter()
    ton = defaultdict(float)
    tu_do = Counter()
    bo_qua = []
    for r in th:
        gd = chuan(r.get("ID"))
        vt = chuan(r.get("ID tài sản"))
        vt = gop.get(vt, vt)
        sl = so(r.get("Số lượng"))
        if not gd or not vt or vt not in dm:
            bo_qua.append((gd, vt, "thieu ID / vat tu"))
            continue
        if not sl or sl <= 0:
            bo_qua.append((gd, vt, f"so luong {r.get('Số lượng')!r}"))
            continue
        di, den, tt0 = chuan(r["Kho đi"]), chuan(r["Kho đến"]), chuan(r["Trạng thái"])
        den_kho, den_nv, ten_tu_do = None, None, None
        if di == "Kho mua hàng":
            loai, tu, den_kho = "Nhap mua", KHO_MUA, KHO_HCNS
            tu_key, den_key = None, "HCNS"
        elif di == "Kho tổng HCNS" and den == KHO_CPVP:
            loai, tu, den_kho, tu_key, den_key = "Chuyen kho", KHO_HCNS, kho(KHO_CPVP), "HCNS", KHO_CPVP
        elif di in ("Kho tổng HCNS", KHO_CPVP) and den == KHO_TH:
            tu_key = "HCNS" if di == "Kho tổng HCNS" else KHO_CPVP
            loai, tu, den_kho, den_key = "Cap phat NV", (KHO_HCNS if tu_key == "HCNS" else kho(KHO_CPVP)), kho(KHO_TH), None
        elif di in ("Kho tổng HCNS", KHO_CPVP):
            loai, tu, tu_key, den_key = "Cap phat NV", (KHO_HCNS if di == "Kho tổng HCNS" else kho(KHO_CPVP)), ("HCNS" if di == "Kho tổng HCNS" else KHO_CPVP), None
            den_nv = tim_nguoi(den)
            if not den_nv:
                ten_tu_do = den or "(không rõ người nhận - dữ liệu cũ)"
                tu_do[ten_tu_do] += 1
        else:
            bo_qua.append((gd, vt, f"kho di '{di}'"))
            continue
        if tt0 in XONG:
            trang_thai = "Da giao" if loai == "Cap phat NV" else "Da nhan"
        elif loai == "Nhap mua":
            trang_thai = "Cho ke toan duyet"
        else:
            trang_thai = "Dang chuyen" if loai == "Chuyen kho" else "Da giao"
        da_xn = 1 if loai == "Cap phat NV" and (tt0 in XONG or den_kho) else 0
        tk[(loai, trang_thai)] += 1
        if trang_thai in ("Dang chuyen", "Da nhan", "Da giao") and tu_key:
            ton[(tu_key, vt)] -= sl
        if trang_thai == "Da nhan" and den_key:
            ton[(den_key, vt)] += sl
        tao_luc = ngay(r["Ngày tạo"]) or ngay(r.get("Tháng tạo")) or NOW
        xn_luc = ngay(r.get("Ngày kế toán xác nhận")) if loai == "Nhap mua" else None
        xn_luc = xn_luc or ngay(r.get("Log time")) or tao_luc
        if xn_luc < tao_luc:
            xn_luc = tao_luc
        dg, tt_tien = so(r.get("Đơn giá")), so(r.get("Thành tiền"))
        if tt_tien is None and dg is not None:
            tt_tien = dg * sl
        gc = f"Du lieu cu: {tt0}" + (f" | {chuan(r['Ghi chú'])}" if chuan(r.get("Ghi chú")) else "")
        L.append(
            "INSERT INTO phieu_chuyen_kho (id, ma_phieu, loai, tu_kho_id, den_kho_id, den_nhan_vien_id, nguoi_nhan_ten_tu_do, nguoi_lap, "
            "trang_thai, da_xac_nhan, xac_nhan_luc, ghi_chu, created_at, updated_at) VALUES ("
            f"{esc(gd)}, {esc(gd)}, {esc(loai)}, {tu}, {den_kho or 'NULL'}, {esc(den_nv)}, {esc(ten_tu_do)}, {esc(SYS)}, {esc(trang_thai)}, {da_xn}, "
            f"{esc(xn_luc if da_xn else None)}, {esc(gc)}, {esc(tao_luc)}, {esc(xn_luc)}) ON CONFLICT(id) DO NOTHING;"
        )
        L.append(
            f"INSERT INTO phieu_chuyen_kho_ct (phieu_id, vt_id, so_luong, don_gia, thanh_tien) SELECT {esc(gd)}, {esc(vt)}, {sl}, {esc(dg)}, {esc(tt_tien)} "
            f"WHERE NOT EXISTS (SELECT 1 FROM phieu_chuyen_kho_ct WHERE phieu_id = {esc(gd)});"
        )
        L.append(
            f"INSERT INTO phieu_chuyen_kho_log (phieu_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu) SELECT {esc(gd)}, {esc(trang_thai)}, {esc(SYS)}, "
            f"{esc(xn_luc)}, 'Nhap tu du lieu cu NSKX' WHERE NOT EXISTS (SELECT 1 FROM phieu_chuyen_kho_log WHERE phieu_id = {esc(gd)});"
        )
    # KHONG BEGIN/COMMIT: D1 remote chay ca file --file nguyen tu.
    open(out_path, "w", encoding="utf-8").write("\n".join(L) + "\n")

    print("NHAN SU:", dict(ly_do), f"| quan ly truc tiep dien {n_ql}")
    print("GOP VAT TU TRUNG:", gop)
    print("VAT TU:", n_vt, "| NHOM:", len(nhoms), "| TSCD:", dict(tk_ts))
    print("PHIEU TIEU HAO:", sum(tk.values()))
    for (l, t), n in sorted(tk.items()):
        print(f"   {l:12} {t:18} {n}")
    print("NGUOI NHAN NGOAI DANH BA (ten tu do):", len(tu_do), sum(tu_do.values()), tu_do.most_common(10))
    print("BO QUA:", bo_qua)
    am = sorted([(k, v, x) for (k, v), x in ton.items() if x < 0], key=lambda a: a[2])
    print(f"TON AM ({len(am)}):", am[:15])
    print(f"Da ghi {out_path} ({len(L)} dong)")
    return nv_map_goc


if __name__ == "__main__":
    main()
