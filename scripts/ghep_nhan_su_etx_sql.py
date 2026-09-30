# -*- coding: utf-8 -*-
"""
Buoc 2/2 - SINH SQL GHEP nhan su du lieu cu vao ho so ETX, tu file ghep_nhan_su_etx.xlsx DA DUOC HCNS
DUYET (cot "Ma ETX chot"; o trong = giu nguyen). Dau vao cung thu muc DIR voi buoc 1 (nv.json, kho.json,
etx_full.json + xlsx). Dau ra: DIR/ghep_nhan_su_etx.sql (chay bang `wrangler d1 execute --file`, D1 tu
chay nguyen tu ca file) + in bao cao.

Quy tac ghep (ETX la goc - user chot 2026-09-30):
  * Moi ma ETX chot -> 1 ho so DICH:
      - da co dong nhan_vien.ma_etx = ma (dong sync ETX tao, ma_nv = NS-...) -> dich = dong do;
      - chua co -> dich = ho so cu nhieu du lieu nhat trong nhom, gan ma_etx + ho ten/chuc danh/gmail/
        trang thai theo ETX (sync hang ngay se tu khop qua ma_etx tu nay);
      - chua co ma chi xuat hien o sheet 2/3 -> them ho so moi ma_nv = ma ETX (ca nguoi da nghi viec).
  * Ho so cu con lai trong nhom -> chuyen MOI tham chieu sang dich (ccdc, phieu_giao_nhan x2,
    kiem_ke_ct, phieu_chuyen_kho, phieu_xu_ly_ts_ct, quan_ly_id cap duoi, kho QL), bu cot HCNS nhap tay
    (bo_phan, sdt, ghi_chu, email_dang_nhap) neu dich dang trong, roi XOA ho so cu.
  * Sheet 2: phieu Cap phat NV ghi ten tu do -> gan den_nhan_vien_id (GIU nguoi_nhan_ten_tu_do + GIU
    da_xac_nhan nhu du lieu cu).
  * Sheet 3: gan chu kho QL dang trong.
  * Dich ra 2 kho QL (sync ETX tu tao kho cho dong NS-..., ho so cu cung co kho) -> giu kho id nho,
    xoa kho con lai CHI KHI no khong co tham chieu nao (guard).
  * Da test 2026-09-30 tren DB local = state_dev + snapshot nv/kho production: FK sach, v_ton_kho
    khong doi, chay lan 2 bi guard chan. Luu y: phieu cu ten tu do da_xac_nhan=0 sau khi gan NV se
    hien "cho NV xac nhan" (+9 phieu voi snapshot 2026-09-30) - giong phieu cu da co NV.
  * Dau file: kiem tra production van dung nhu snapshot (chu ma_etx, chu kho QL...) - lech thi chen
    batch_guard x=0 -> D1 rollback CA FILE. Snapshot cu -> xuat lai JSON roi chay lai buoc 1+2.
Xung dot khong tu xu ly duoc (2 ho so cung co kho QL, 1 ho so cu chot 2 ma...) -> in ra va DUNG.
"""
import json
import sys
from collections import defaultdict

import openpyxl

DIR = sys.argv[1] if len(sys.argv) > 1 else "../_backup_ccdc/ghep_nv"


def load(name):
    return json.load(open(f"{DIR}/{name}.json", encoding="utf-8"))[0]["results"]


def q(v):
    return "NULL" if v is None else "'" + str(v).replace("'", "''") + "'"


def doc_sheet(ws, cot_khoa, cot_chot="Mã ETX chốt"):
    rows = list(ws.iter_rows(values_only=True))
    h = list(rows[0])
    ik, ic = h.index(cot_khoa), h.index(cot_chot)
    out = []
    for r in rows[1:]:
        if r[ik] is None:
            continue
        ma = str(r[ic]).strip().upper() if r[ic] not in (None, "") else ""
        out.append((r[ik], ma))
    return out


def main():
    nv = {r["ma_nv"]: r for r in load("nv")}
    kho = load("kho")
    etx = {r["ma_nhan_su"]: r for r in load("etx_full")}
    chu_etx = {r["ma_etx"]: r["ma_nv"] for r in nv.values() if r["ma_etx"]}
    kho_cua = {k["nhan_vien_id"]: k for k in kho if k["nhan_vien_id"]}
    kho_by_id = {k["id"]: k for k in kho}

    wb = openpyxl.load_workbook(f"{DIR}/ghep_nhan_su_etx.xlsx", read_only=True)
    s1 = [(str(k), m) for k, m in doc_sheet(wb["1. Hồ sơ cũ có dữ liệu"], "Mã NV cũ") if m]
    s2 = [(str(k), m) for k, m in doc_sheet(wb["2. Tên người nhận tự do"], "Tên trên phiếu") if m]
    s3 = [(int(k), m) for k, m in doc_sheet(wb["3. Kho QL chưa gắn NV"], "Id kho") if m]

    loi = []
    for _, m in s1 + s2 + s3:
        if m not in etx:
            loi.append(f"Mã ETX không tồn tại: {m}")
    for ma_cu, m in s1:
        if ma_cu not in nv:
            loi.append(f"Hồ sơ cũ không còn trong snapshot: {ma_cu}")
        elif nv[ma_cu]["ma_etx"]:
            loi.append(f"Hồ sơ cũ {ma_cu} đã có ma_etx {nv[ma_cu]['ma_etx']}")
    if len({k for k, _ in s1}) != len(s1):
        loi.append("Sheet 1 có Mã NV cũ lặp")
    for kid, _ in s3:
        if kid not in kho_by_id or kho_by_id[kid]["nhan_vien_id"]:
            loi.append(f"Kho {kid} không còn trống chủ trong snapshot")
    if loi:
        print("\n".join(loi))
        sys.exit(1)

    nhom = defaultdict(list)  # ma ETX -> [ma_nv cu]
    for ma_cu, m in s1:
        nhom[m].append(ma_cu)

    def nang(ma_nv):
        r = nv[ma_nv]
        return (r["kho_id"] is not None, r["ts"] + r["pck"] + r["cap_duoi"])

    dich = {}  # ma ETX -> ma_nv dich
    gan_etx = []  # ho so cu duoc gan ma_etx
    them_moi = []  # ma ETX can them ho so
    gop = []  # (ma_nv cu, ma_nv dich)
    for m in sorted(set(nhom) | {x for _, x in s2} | {x for _, x in s3}):
        if m in chu_etx:
            dich[m] = chu_etx[m]
            gop += [(o, dich[m]) for o in nhom[m]]
        elif nhom[m]:
            ds = sorted(nhom[m], key=nang, reverse=True)
            dich[m] = ds[0]
            gan_etx.append((ds[0], m))
            gop += [(o, ds[0]) for o in ds[1:]]
        else:
            if m in nv:
                loi.append(f"Mã {m} trùng ma_nv của hồ sơ khác (ma_etx {nv[m]['ma_etx']})")
            dich[m] = m
            them_moi.append(m)

    # Kho QL: moi dich toi da 1 kho (kho.nhan_vien_id UNIQUE).
    kho_moi = defaultdict(list)  # ma_nv dich -> [kho id se thuoc ve]
    for o, t in gop:
        if o in kho_cua:
            kho_moi[t].append(kho_cua[o]["id"])
    for kid, m in s3:
        kho_moi[dich[m]].append(kid)
    # Dich se co >1 kho (thuong: sync ETX da tu tao kho QL cho dong NS-..., ho so cu cung co kho QL
    # tu du lieu cu) -> GIU kho id nho nhat (kho cu, mang lich su), XOA cac kho con lai - chi khi luc
    # chay chung KHONG co tham chieu nao (guard ben duoi), con khong thi rollback ca file.
    xoa_kho = []
    for t, ds in kho_moi.items():
        tong = sorted(ds + ([kho_cua[t]["id"]] if t in kho_cua else []))
        if len(tong) > 1:
            if len(tong) > 2:
                loi.append(f"Xung đột kho QL: hồ sơ đích {t} sẽ sở hữu {len(tong)} kho {tong} - xử lý tay")
            xoa_kho += tong[1:]
    if loi:
        print("\n".join(loi))
        sys.exit(1)

    L = [
        "-- Sinh boi scripts/ghep_nhan_su_etx_sql.py - GHEP nhan su du lieu cu vao ho so ETX.",
        "-- KHONG BEGIN/COMMIT: `wrangler d1 execute --file` tu chay nguyen tu ca file.",
        "PRAGMA defer_foreign_keys = true;",
        "",
        "-- 0. Kiem production con dung snapshot (lech -> batch_guard x=0 -> rollback ca file).",
    ]

    def guard(dk):
        L.append(f"INSERT INTO batch_guard (x) SELECT CASE WHEN {dk} THEN 1 ELSE 0 END;")

    for m in sorted(dich):
        chu = chu_etx.get(m)
        guard(f"(SELECT ma_nv FROM nhan_vien WHERE ma_etx = {q(m)}) IS {q(chu)}")
    for m in them_moi:
        guard(f"NOT EXISTS (SELECT 1 FROM nhan_vien WHERE ma_nv = {q(m)})")
    for o, _ in gop + [(x, None) for x, _ in gan_etx]:
        guard(f"EXISTS (SELECT 1 FROM nhan_vien WHERE ma_nv = {q(o)} AND ma_etx IS NULL)")
    for t, ds in kho_moi.items():
        guard(f"NOT EXISTS (SELECT 1 FROM kho WHERE nhan_vien_id = {q(t)}{' AND id != ' + str(kho_cua[t]['id']) if t in kho_cua else ''})")
    for kid, _ in s3:
        guard(f"(SELECT nhan_vien_id FROM kho WHERE id = {kid}) IS NULL")
    for kid in xoa_kho:
        guard(
            " AND ".join(
                f"NOT EXISTS (SELECT 1 FROM {b} WHERE {c} = {kid})"
                for b, c in [
                    ("kho_thu_kho", "kho_id"),
                    ("ccdc", "kho_id"),
                    ("phieu_giao_nhan", "tu_kho_id"),
                    ("phieu_giao_nhan", "den_kho_id"),
                    ("phieu_chuyen_kho", "tu_kho_id"),
                    ("phieu_chuyen_kho", "den_kho_id"),
                    ("phieu_xu_ly_ts_ct", "kho_truoc"),
                ]
            )
        )
    L.append("DELETE FROM batch_guard;")

    L += ["", f"-- Xoa {len(xoa_kho)} kho QL trung, trong (dich da co kho QL cu mang lich su)."]
    for kid in xoa_kho:
        L.append(f"DELETE FROM kho WHERE id = {kid}; -- {kho_by_id[kid]['ten_kho']} ({kho_by_id[kid]['nhan_vien_id']})")

    def etx_cot(m):
        e = etx[m]
        gmail = e["gmail"].strip().lower() if e["gmail"] else None
        return e["ho_ten"], e["chuc_danh"], gmail, 1 if e["trang_thai_lam_viec"] == "on" else 0

    L += ["", f"-- 1. Them {len(them_moi)} ho so ETX chua co (chi xuat hien o phieu ten tu do / kho QL)."]
    for m in them_moi:
        ten, cv, gm, on = etx_cot(m)
        L.append(
            "INSERT INTO nhan_vien (ma_nv, ten_nv, chuc_vu, gmail, ma_etx, dang_lam_viec, ghi_chu, created_at, updated_at) "
            f"VALUES ({q(m)}, {q(ten)}, {q(cv)}, {q(gm)}, {q(m)}, {on}, 'Them khi ghep du lieu cu', datetime('now', '+7 hours'), datetime('now', '+7 hours'));"
        )

    L += ["", f"-- 2. Gan ma ETX cho {len(gan_etx)} ho so cu (ETX chua co trong CCDC)."]
    for o, m in gan_etx:
        ten, cv, gm, on = etx_cot(m)
        L.append(
            f"UPDATE nhan_vien SET ma_etx = {q(m)}, ten_nv = {q(ten)}, chuc_vu = {q(cv)}, gmail = {q(gm)}, dang_lam_viec = {on}, "
            f"updated_at = datetime('now', '+7 hours') WHERE ma_nv = {q(o)};"
        )

    L += ["", f"-- 3. Gop {len(gop)} ho so cu vao ho so dich roi xoa."]
    for o, t in gop:
        L.append(f"-- {o} ({nv[o]['ten_nv']}) -> {t}")
        for bang, cot in [
            ("ccdc", "nguoi_dang_giu"),
            ("phieu_giao_nhan", "nhan_vien_id"),
            ("phieu_giao_nhan", "nhan_vien_nhan_moi_id"),
            ("kiem_ke_ct", "nguoi_dang_giu_thuc_te"),
            ("phieu_chuyen_kho", "den_nhan_vien_id"),
            ("phieu_xu_ly_ts_ct", "nguoi_giu_truoc"),
            ("kho", "nhan_vien_id"),
        ]:
            L.append(f"UPDATE {bang} SET {cot} = {q(t)} WHERE {cot} = {q(o)};")
        L.append(f"UPDATE nhan_vien SET quan_ly_id = {q(t)} WHERE quan_ly_id = {q(o)} AND ma_nv != {q(t)};")
        L.append(
            "UPDATE nhan_vien SET "
            + ", ".join(f"{c} = COALESCE({c}, (SELECT {c} FROM nhan_vien WHERE ma_nv = {q(o)}))" for c in ("bo_phan", "sdt", "ghi_chu", "email_dang_nhap"))
            + f", updated_at = datetime('now', '+7 hours') WHERE ma_nv = {q(t)};"
        )
        L.append(f"DELETE FROM nhan_vien WHERE ma_nv = {q(o)};")

    ten_by = {}
    for ten, m in s2:
        ten_by[ten] = m
    L += ["", f"-- 4. Gan nguoi nhan cho phieu Cap phat NV ghi ten tu do ({len(ten_by)} ten)."]
    for ten, m in ten_by.items():
        L.append(
            f"UPDATE phieu_chuyen_kho SET den_nhan_vien_id = {q(dich[m])}, updated_at = datetime('now', '+7 hours') "
            f"WHERE loai = 'Cap phat NV' AND den_nhan_vien_id IS NULL AND nguoi_nhan_ten_tu_do = {q(ten)};"
        )

    L += ["", f"-- 5. Gan chu {len(s3)} kho QL dang trong."]
    for kid, m in s3:
        L.append(f"UPDATE kho SET nhan_vien_id = {q(dich[m])}, updated_at = datetime('now', '+7 hours') WHERE id = {kid} AND nhan_vien_id IS NULL;")

    out = f"{DIR}/ghep_nhan_su_etx.sql"
    open(out, "w", encoding="utf-8").write("\n".join(L) + "\n")
    print(out)
    print(f"Sheet1 chot {len(s1)} | sheet2 chot {len(s2)} | sheet3 chot {len(s3)}")
    print(f"Them ho so moi {len(them_moi)} | gan ma ETX cho ho so cu {len(gan_etx)} | gop+xoa ho so cu {len(gop)}")
    dup = {m: v for m, v in nhom.items() if len(v) > 1}
    if dup:
        print(f"{len(dup)} ma ETX duoc chot cho >1 ho so cu (se gop):")
        for m, v in sorted(dup.items()):
            print(f"  {m} {etx[m]['ho_ten']}: {', '.join(f'{o} ({nv[o]['ten_nv']})' for o in v)}")


if __name__ == "__main__":
    main()
