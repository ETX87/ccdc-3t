# -*- coding: utf-8 -*-
"""
Dong bo GIAO DICH TIEU HAO MOI tu he thong cu (AppSheet, Google Sheet xuat TSV) vao production SAU lan import
24/09 (user yeu cau 2026-10-02: "dong bo du lieu moi nhat theo database nay"). Chi lam phan CHENH LECH:
  1. Giao dich co ID chua co tren production (so luong > 0) -> them phieu_chuyen_kho (+ _ct, _log), giu
     ma_phieu = ID cu nhu lan import (generate_import_sql.py).
  2. Giao dich he cu da XONG (vd Cho quan ly xac nhan -> Quan ly da xac nhan) ma production van dang cho ->
     cap nhat trang thai, CHI phieu do he thong tao (nguoi_lap = SYS; khong de len thao tac tren app moi).
TSCD: doi chieu tung dong voi nguon import 24/09 - khong co thay doi thi khong dong cham.

Quy tac anh xa GIONG generate_import_sql.py, nhung tra theo danh ba / kho HIEN TAI (da ghep ETX 2 dot):
  - Kho: "Kho mua hang" = 1, "Kho tong HCNS" = 2, Phung Thi Doanh = Kho van Mien Bac, Nguyen Hoang Tuong Vy =
    Kho van Mien Nam, nguoi khac co kho QL (tra theo chu kho / ten kho "Kho QL - <ten>").
  - Nguoi nhan: ten tu do da tung gan ho so (dot 1/2) -> dung lai; "(ma) ..." -> ma do (qua nhat ky doi ma neu
    da gop); trung DUY NHAT 1 ho so dang lam theo ho ten -> ho so do; con lai giu ten tu do.
  - Loai phieu: tu Kho mua -> Nhap mua; toi 1 kho (khac kho di) -> Chuyen kho NEU cot "Phan loai" he cu = "Nhap
    kho" HOAC kho do dang xuat hang (HCNS / Mien / kho QL da tung xuat); con lai -> Cap phat NV.
    (2026-10-06: import 24/09 bo qua cot "Phan loai" -> 22 phieu Nhap kho vao kho QL GS DVBH bi ghi thanh cap
    phat tieu hao, kho Nguyen Thi Xuan am khi bat dau xuat. Cot "Thuoc ve kho" chi la email nguoi nhan, KHONG
    phai dau hieu nhap kho.)
  - Trang thai: da xong -> Da nhan / Da giao; KT tu choi -> Ke toan tu choi / Bi tu choi; dang cho -> Cho ke
    toan duyet (nhap mua) / Dang chuyen (chuyen kho) / Da giao (cap phat).
Vat tu chua co trong danh muc -> tao vt_tieu_hao toi thieu (ten + don gia tu giao dich), HCNS bo sung sau.

Chay: python scripts/dong_bo_tieu_hao_cu.py <thu muc>  (thu muc chua sheet_*.tsv + prod_*.json xuat tu
production) -> <thu muc>/dong_bo_tieu_hao.sql + in bao cao. File SQL chay bang `wrangler d1 execute --file`.
"""
import csv
import json
import re
import sys
import unicodedata
from collections import Counter


DIR = sys.argv[1] if len(sys.argv) > 1 else "../_backup_ccdc/dong_bo_1002"
SHEET_TH = "sheet_1813749378.tsv"
SYS = "nhap-du-lieu-cu@he-thong.local"
XONG = {"Quản lý đã bàn giao", "Kế toán đã xác nhận", "Quản lý đã xác nhận"}
KHO_THEO_TEN = {"kho mua hàng": 1, "kho tổng hcns": 2, "phùng thị doanh": 3, "nguyễn hoàng tường vy": 4}


def load(n):
    return json.load(open(f"{DIR}/{n}.json", encoding="utf-8"))[0]["results"]


def S(v):
    return re.sub(r"\s+", " ", str(v)).strip() if v is not None else ""


def low(s):
    return unicodedata.normalize("NFC", S(s)).lower()


def so(v):
    v = S(v).replace(".", "").replace(",", ".")
    try:
        return float(v)
    except ValueError:
        return None


def ngay(v):
    m = re.match(r"(\d{1,2})/(\d{1,2})/(\d{4})(?:\s+(\d{1,2}):(\d{2}):(\d{2}))?", S(v))
    if not m:
        return None
    d, mo, y, h, mi, s = m.groups()
    return f"{y}-{int(mo):02d}-{int(d):02d} {int(h or 0):02d}:{mi or '00'}:{s or '00'}"


def q(v):
    if v is None:
        return "NULL"
    if isinstance(v, (int, float)):
        return str(int(v)) if float(v).is_integer() else str(v)
    return "'" + str(v).replace("'", "''") + "'"


def main():
    nv = load("prod_nv")
    kho = load("prod_kho")
    vt = {r["id"] for r in load("prod_vt")}
    pck = {r["id"]: r for r in load("prod_pck")}
    lich_su = {r["ma_nguon"]: r["ma_dich"] for r in load("prod_lich_su")}
    tudo_map = {}
    for r in load("prod_tudo_map"):
        if r["ma"]:
            tudo_map.setdefault(r["ten"], set()).add(r["ma"])
    ma_nv = {r["ma_nv"]: r for r in nv}

    def theo_doi(ma):  # ma cu da gop -> ma hien tai
        seen = set()
        while ma in lich_su and ma not in seen:
            seen.add(ma)
            ma = lich_su[ma]
        return ma if ma in ma_nv else None

    theo_ten = {}
    for r in nv:
        if r["dang_lam_viec"]:
            theo_ten.setdefault(low(r["ten_nv"]), []).append(r["ma_nv"])
    kho_chu = {r["nhan_vien_id"]: r["id"] for r in kho if r["nhan_vien_id"]}
    kho_ten = {low(r["ten_kho"]): r["id"] for r in kho}

    def bo_hau_to(t):
        return re.sub(r"\s*\([^)]*\)\s*$", "", S(t)).strip()

    def tim_nguoi(raw):
        """-> (ma_nv | None, cach)"""
        if raw in tudo_map and len(tudo_map[raw]) == 1:
            m = theo_doi(next(iter(tudo_map[raw])))
            if m:
                return m, "ten tu do da gan (dot 1/2)"
        mm = re.match(r"^\s*(?:DVBH-)?\(([^)]+)\)", raw)
        if mm:
            m = theo_doi(mm.group(1)) or (mm.group(1) if mm.group(1) in ma_nv else None)
            if m:
                return m, "ma trong ngoac"
        for t in {low(raw), low(bo_hau_to(raw)), low(re.sub(r"^(GS[^-]*|PTDV)\s*-\s*", "", raw)), low(raw.split(" - ")[-1])}:
            if len(theo_ten.get(t, [])) == 1:
                return theo_ten[t][0], "trung ho ten duy nhat"
        return None, "giu ten tu do"

    def tim_kho(raw):
        r = low(bo_hau_to(raw))
        r2 = low(re.sub(r"^(GS[^-]*)\s*-\s*", "", bo_hau_to(raw)))
        # "Hoang Ngoc Nhat Tam - ptdv" -> thu tung phan (giong canon() cua generate_import_sql.py).
        for t in [r, r2] + [x.strip() for x in re.split(r"\s+-\s*", r)]:
            if t in KHO_THEO_TEN:
                return KHO_THEO_TEN[t]
            if t in kho_ten:
                return kho_ten[t]
            if f"kho ql - {t}" in kho_ten:
                return kho_ten[f"kho ql - {t}"]
        m, _ = tim_nguoi(raw)
        return kho_chu.get(m) if m else None

    th = [r for r in csv.DictReader(open(f"{DIR}/{SHEET_TH}", encoding="utf-8"), delimiter="\t") if S(r["ID"])]
    # Kho dang xuat hang: nhan "Tieu hao" van coi la chuyen kho (nguoi nhan se xuat tiep tu kho minh).
    kho_xuat = {r["id"] for r in kho if r["loai"] in ("HCNS", "Mien") or r.get("so_xuat")}
    kho_xuat |= {k for k in (tim_kho(r["Kho đi"]) for r in th) if k}

    out = ["-- Sinh boi scripts/dong_bo_tieu_hao_cu.py - dong bo giao dich tieu hao moi tu he thong cu.", "PRAGMA defer_foreign_keys = true;"]
    bc = Counter()
    can_xem = []
    vt_moi = {}
    for r in th:
        gd = S(r["ID"])
        tt_goc = S(r["Trạng thái"])
        if gd in pck:
            # 2. He cu da xong ma production (phieu he thong tao) van dang cho -> cap nhat.
            p = pck[gd]
            if tt_goc in XONG and p["nguoi_lap"] == SYS:
                if p["loai"] == "Cap phat NV" and p["trang_thai"] == "Da giao" and not p["da_xac_nhan"]:
                    out.append(f"UPDATE phieu_chuyen_kho SET da_xac_nhan = 1, xac_nhan_luc = datetime('now', '+7 hours'), updated_at = datetime('now', '+7 hours'), ghi_chu = 'Du lieu cu: ' || {q(tt_goc)} WHERE id = {q(gd)} AND trang_thai = 'Da giao' AND da_xac_nhan = 0;")
                elif p["trang_thai"] in ("Dang chuyen", "Cho ke toan duyet"):
                    out.append(f"UPDATE phieu_chuyen_kho SET trang_thai = 'Da nhan', updated_at = datetime('now', '+7 hours'), ghi_chu = 'Du lieu cu: ' || {q(tt_goc)} WHERE id = {q(gd)} AND trang_thai = {q(p['trang_thai'])};")
                else:
                    continue
                out.append(f"INSERT INTO phieu_chuyen_kho_log (phieu_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu) VALUES ({q(gd)}, 'Da nhan', {q(SYS)}, datetime('now', '+7 hours'), {q('Dong bo he thong cu: ' + tt_goc)});")
                bc["doi trang thai"] += 1
            continue
        sl = so(r["Số lượng"])
        if not sl or sl <= 0:
            bc["bo qua so luong <= 0"] += 1
            continue
        # 1. Giao dich moi.
        v = S(r["ID tài sản"])
        if v not in vt and v not in vt_moi:
            vt_moi[v] = (S(r["Tên tài sản"]), so(r["Đơn giá"]))
        tu = tim_kho(r["Kho đi"]) or 2
        den_raw = S(r["Kho đến"])
        den_kho = tim_kho(den_raw) if den_raw else None
        den_nv, tu_do, cach = None, None, ""
        if tu == 1:
            loai, den_kho = "Nhap mua", den_kho or 2
        elif den_kho and den_kho != tu and (S(r["Phân loại"]) == "Nhập kho" or den_kho in kho_xuat):
            loai = "Chuyen kho"
        else:
            if S(r["Phân loại"]) == "Nhập kho" and not den_kho and low(den_raw) != "kho tiêu hao":
                can_xem.append(f"{gd}: he cu 'Nhap kho' toi '{den_raw}' nhung nguoi nay chua co kho QL -> ghi cap phat")
            loai, den_kho = "Cap phat NV", None
            if low(den_raw) == "kho tiêu hao":
                tu_do, cach = "Kho tiêu hao", "kho ao tieu hao"
            else:
                den_nv, cach = tim_nguoi(den_raw)
                if not den_nv:
                    tu_do = den_raw or "(không rõ người nhận - dữ liệu cũ)"
        if tt_goc in XONG:
            trang_thai = "Da giao" if loai == "Cap phat NV" else "Da nhan"
        elif tt_goc == "Kế toán đã từ chối":
            trang_thai = "Ke toan tu choi" if loai == "Nhap mua" else "Bi tu choi"
        elif loai == "Nhap mua":
            trang_thai = "Cho ke toan duyet"
        else:
            trang_thai = "Dang chuyen" if loai == "Chuyen kho" else "Da giao"
        da_xn = 1 if (loai == "Cap phat NV" and tt_goc in XONG) else 0
        tao = ngay(r["Ngày tạo"]) or ngay(r["Tháng tạo"])
        gia, tien = so(r["Đơn giá"]), so(r["Thành tiền"])
        out += [
            "INSERT INTO phieu_chuyen_kho (id, ma_phieu, loai, tu_kho_id, den_kho_id, den_nhan_vien_id, nguoi_nhan_ten_tu_do, nguoi_lap, trang_thai, da_xac_nhan, ghi_chu, created_at, updated_at) "
            f"VALUES ({q(gd)}, {q(gd)}, {q(loai)}, {tu}, {q(den_kho)}, {q(den_nv)}, {q(tu_do)}, {q(SYS)}, {q(trang_thai)}, {da_xn}, {q('Du lieu cu: ' + tt_goc)}, {q(tao)}, {q(tao)}) ON CONFLICT(id) DO NOTHING;",
            f"INSERT INTO phieu_chuyen_kho_ct (phieu_id, vt_id, so_luong, don_gia, thanh_tien) SELECT {q(gd)}, {q(v)}, {q(sl)}, {q(gia)}, {q(tien)} WHERE NOT EXISTS (SELECT 1 FROM phieu_chuyen_kho_ct WHERE phieu_id = {q(gd)});",
            f"INSERT INTO phieu_chuyen_kho_log (phieu_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu) SELECT {q(gd)}, {q(trang_thai)}, {q(SYS)}, {q(tao)}, 'Dong bo tu he thong cu' WHERE NOT EXISTS (SELECT 1 FROM phieu_chuyen_kho_log WHERE phieu_id = {q(gd)});",
        ]
        bc[f"moi {loai} / {trang_thai}"] += 1
        if loai == "Cap phat NV":
            bc[f"  nguoi nhan: {cach}"] += 1
        if not tim_kho(r["Kho đi"]) and low(r["Kho đi"]) not in ("", "kho tổng hcns"):
            can_xem.append(f"{gd}: kho di '{r['Kho đi']}' khong xac dinh -> coi la Kho tong HCNS")

    # Vat tu moi: dat TRUOC cac phieu (FK).
    them_vt = [
        f"INSERT INTO vt_tieu_hao (id, ten_vt, don_gia_tham_khao, nguoi_tao) VALUES ({q(k)}, {q(t)}, {q(g)}, {q(SYS)}) ON CONFLICT(id) DO NOTHING;"
        for k, (t, g) in vt_moi.items()
    ]
    out = out[:2] + them_vt + out[2:]
    open(f"{DIR}/dong_bo_tieu_hao.sql", "w", encoding="utf-8").write("\n".join(out) + "\n")
    print(f"{DIR}/dong_bo_tieu_hao.sql")
    for k, n in sorted(bc.items()):
        print(f"  {k}: {n}")
    print(f"  vat tu moi tao: {len(vt_moi)} {list(vt_moi.items())[:8]}")
    for c in can_xem:
        print("  CAN XEM:", c)


if __name__ == "__main__":
    main()
