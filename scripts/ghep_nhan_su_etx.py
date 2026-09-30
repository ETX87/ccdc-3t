# -*- coding: utf-8 -*-
"""
Buoc 1/2 - DO KHOP nhan su du lieu cu voi ho so ETX (user chot 2026-09-30: "ETX nhan su la goc",
"chi quan tam ho so da co data cap phat that, ho so danh sach cu chua dung thi bo qua").

Dau vao (JSON xuat tu production bang `wrangler d1 execute --remote --json`, thu muc DIR):
  nv.json       - nhan_vien + so kho / tai san / phieu / cap duoi dang tham chieu
  tentudo.json  - phieu_chuyen_kho.nguoi_nhan_ten_tu_do (khong ma NV) gom theo ten
  kho.json      - kho
  etx_full.json - TOAN BO danh ba ETX ke ca nguoi da nghi (lay tu bang etx_nhan_su cua linh-kien-app -
                  CCDC chi luu nguoi ETX 'on' + nguoi da co san, ma nhieu nguoi nhan cu da nghi viec)
Dau ra: DIR/ghep_nhan_su_etx.xlsx de HCNS duyet - cot "Mã ETX chốt" dien san theo de xuat, sua/xoa
tay truoc khi chay buoc 2 (sinh SQL ghep).

Nguon can ghep (chi dong CO du lieu that):
  1. Ho so cu (ma_etx NULL) dang gan kho QL / giu TS / nhan phieu / co cap duoi.
  2. Ten nguoi nhan tu do tren phieu_chuyen_kho (chua co ma NV).
  3. Kho Quan ly chua gan nhan vien.
So voi TOAN BO ETX (ca nguoi da nghi); nguoi ETX chua co trong CCDC -> buoc 2 them ho so (nghi viec).
Thu tu khop: gmail trung (ho so cu) -> ho ten bo dau trung DUY NHAT 1 ho so ETX -> nhieu ho so
cung ten thi uu tien dang lam viec + chuc danh/bo phan gan nghia (telesale, ptdv, dia danh...).
"""
import json
import re
import sys
import unicodedata
from collections import defaultdict

import openpyxl
from openpyxl.styles import Font, PatternFill

DIR = sys.argv[1] if len(sys.argv) > 1 else "../_backup_ccdc/ghep_nv"


def load(name):
    return json.load(open(f"{DIR}/{name}.json", encoding="utf-8"))[0]["results"]


def norm(s):
    s = (s or "").replace("Đ", "D").replace("đ", "d")
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", s).strip().lower()


# Tu/cum KHONG phai ho ten (tien to vi tri, vung, vai tro) - bo khoi ten truoc khi so.
NHIEU = re.compile(r"\b(ptdv|ctv|ktv|telesale|nv|gs)\b")
KHONG_PHAI_NGUOI = ("kho ", "van phong", "khong ro", "cong ty", "phong ", "chi nhanh", "cua hang")


def ten_sach(s):
    """Tra ve (ho ten GIU DAU viet thuong, ngu canh bo dau) tu 1 chuoi ten tu do / ten_nv cu.
    GIU DAU khi so ten: bo dau lam "Hưng" == "Hùng" (da gap that) - khop bo dau chi la du phong."""
    raw = re.sub(r"\s+", " ", unicodedata.normalize("NFC", s or "")).strip().lower()
    ngu_canh = norm(s)
    raw = re.sub(r"\([^)]*\)", " ", raw)  # "(longvb.ptdv-hcm)"
    phan = [p.strip() for p in re.split(r"\s+-\s+|\s*-\s*$|^\s*-\s*", raw) if p.strip()]
    ung = []
    for p in phan:
        p2 = re.sub(r"\s+", " ", NHIEU.sub(" ", p)).strip()
        if len(p2.split()) >= 2 and not any(norm(p2).startswith(k.strip()) for k in KHONG_PHAI_NGUOI):
            ung.append(p2)
    # Ho ten thuong la doan CUOI ("CTV Telesale Hai Duong - Bui Thi Yen") hoac doan dau ("Luu Duc Tuan - ptdv").
    ten = ung[-1] if ung else re.sub(r"\s+", " ", NHIEU.sub(" ", raw)).strip()
    return ten, ngu_canh


def la_khong_phai_nguoi(s):
    n = norm(s)
    return n.startswith("(khong ro") or any(n.startswith(k) for k in KHONG_PHAI_NGUOI)


def main():
    nv = load("nv")
    tentudo = load("tentudo")
    kho = load("kho")
    trong_ccdc = {r["ma_etx"]: r["ma_nv"] for r in nv if r["ma_etx"]}
    etx = [
        {
            "ma_nv": r["ma_nhan_su"],
            "ten_nv": r["ho_ten"],
            "chuc_vu": r["chuc_danh"],
            "bo_phan": None,
            "gmail": r["gmail"],
            "dang_lam_viec": 1 if r["trang_thai_lam_viec"] == "on" else 0,
        }
        for r in load("etx_full")
    ]
    by_ten = defaultdict(list)
    by_ten_kd = defaultdict(list)  # bo dau - chi du phong
    by_gmail = defaultdict(list)
    for r in etx:
        t = ten_sach(r["ten_nv"])[0]
        by_ten[t].append(r)
        by_ten_kd[norm(t)].append(r)
        if r["gmail"]:
            by_gmail[r["gmail"].strip().lower()].append(r)

    def diem(e, ngu_canh):
        # Uu tien dang lam viec, roi den so tu chuc danh ETX xuat hien trong ngu canh ten cu.
        d = 10 if e["dang_lam_viec"] else 0
        for w in set(norm(f"{e['chuc_vu'] or ''} {e['bo_phan'] or ''}").split()):
            if len(w) >= 3 and w in ngu_canh:
                d += 1
        return d

    def khop(ten_goc, gmail=None, ngu_canh_them=""):
        if la_khong_phai_nguoi(ten_goc):
            return None, "Không phải người (kho/địa điểm/không rõ)", []
        if gmail:
            g = by_gmail.get(gmail.strip().lower(), [])
            if len(g) == 1:
                return g[0], "Chắc chắn (trùng Gmail)", []
        ten, ngu_canh = ten_sach(ten_goc)
        ngu_canh += " " + norm(ngu_canh_them)
        ds = by_ten.get(ten, [])
        if not ds:
            kd = by_ten_kd.get(norm(ten), [])
            if kd:
                return None, "Cần chọn tay - chỉ khớp khi bỏ dấu (tên ETX khác dấu)", kd
            return None, "Không tìm thấy trên ETX", []
        if len(ds) == 1:
            e = ds[0]
            return e, "Chắc chắn (trùng họ tên)" if e["dang_lam_viec"] else "Chắc chắn (trùng họ tên, ETX đã nghỉ việc)", []
        xep = sorted(ds, key=lambda e: -diem(e, ngu_canh))
        if diem(xep[0], ngu_canh) > diem(xep[1], ngu_canh):
            return xep[0], f"Gợi ý - {len(ds)} người trùng tên, chọn theo chức danh/trạng thái", xep[1:]
        return None, f"Cần chọn tay - {len(ds)} người trùng tên", xep

    def cot_etx(e):
        if not e:
            return ["", "", "", "", ""]
        co = trong_ccdc.get(e["ma_nv"])
        return [e["ma_nv"], e["ten_nv"], e["chuc_vu"] or "", "Đang làm" if e["dang_lam_viec"] else "Nghỉ việc",
                f"Có ({co})" if co else "Chưa - sẽ thêm hồ sơ"]

    def ung_vien(ds):
        return "; ".join(f"{e['ma_nv']} {e['ten_nv']} ({e['chuc_vu'] or '-'}{'' if e['dang_lam_viec'] else ', nghỉ'})" for e in ds[:6])

    wb = openpyxl.Workbook()
    head_font = Font(bold=True, color="FFFFFF")
    head_fill = PatternFill("solid", fgColor="006573")
    fill = {
        "Chắ": PatternFill("solid", fgColor="E4FAFB"),
        "Gợi": PatternFill("solid", fgColor="FFF9E7"),
        "Cần": PatternFill("solid", fgColor="FEE2E2"),
        "Khô": PatternFill("solid", fgColor="F1F5F9"),
    }

    def sheet(ws, header, rows, cot_muc):
        ws.append(header)
        for c in ws[1]:
            c.font, c.fill = head_font, head_fill
        for r in rows:
            ws.append(r)
            f = fill.get(str(r[cot_muc])[:3])
            if f:
                for c in ws[ws.max_row]:
                    c.fill = f
        ws.freeze_panes = "A2"
        for col in ws.columns:
            ws.column_dimensions[col[0].column_letter].width = min(48, max(10, max(len(str(c.value or "")) for c in col) + 2))

    tk = defaultdict(lambda: defaultdict(int))
    ETX_HEAD = ["Mã ETX đề xuất", "Họ tên ETX", "Chức danh ETX", "Trạng thái ETX", "Hồ sơ trong CCDC", "Mức khớp", "Ứng viên khác", "Mã ETX chốt"]

    # 1. Ho so cu co du lieu that
    rows = []
    for r in nv:
        if r["ma_etx"] or not (r["kho_id"] or r["ts"] or r["pck"] or r["cap_duoi"]):
            continue
        e, muc, khac = khop(r["ten_nv"], r["gmail"], f"{r['chuc_vu'] or ''} {r['bo_phan'] or ''}")
        tk["Hồ sơ cũ"][muc.split(" (")[0].split(" - ")[0]] += 1
        rows.append(
            [r["ma_nv"], r["ten_nv"], r["chuc_vu"] or "", r["bo_phan"] or "", r["gmail"] or "", r["kho_id"] or "", r["ts"], r["pck"], r["cap_duoi"]]
            + cot_etx(e) + [muc, ung_vien(khac), e["ma_nv"] if e else ""]
        )
    rows.sort(key=lambda x: (x[14][:3] != "Cần", x[14][:3] != "Gợi", -(x[6] + x[7])))
    ws = wb.active
    ws.title = "1. Hồ sơ cũ có dữ liệu"
    sheet(ws, ["Mã NV cũ", "Họ tên cũ", "Chức vụ cũ", "Bộ phận cũ", "Gmail cũ", "Kho QL (id)", "Tài sản đang giữ", "Phiếu nhận", "Số cấp dưới"] + ETX_HEAD, rows, 14)

    # 2. Ten tu do tren phieu
    rows = []
    for r in tentudo:
        e, muc, khac = khop(r["ten"])
        tk["Tên tự do"][muc.split(" (")[0].split(" - ")[0]] += 1
        rows.append([r["ten"], r["phieu"], r["loai"], (r["tu"] or "")[:10], (r["den"] or "")[:10]] + cot_etx(e) + [muc, ung_vien(khac), e["ma_nv"] if e else ""])
    rows.sort(key=lambda x: (x[10][:3] != "Cần", x[10][:3] != "Gợi", -x[1]))
    sheet(wb.create_sheet("2. Tên người nhận tự do"), ["Tên trên phiếu", "Số phiếu", "Loại phiếu", "Từ ngày", "Đến ngày"] + ETX_HEAD, rows, 10)

    # 3. Kho QL chua gan nhan vien
    rows = []
    for k in kho:
        if k["loai"] != "Quan ly" or k["nhan_vien_id"]:
            continue
        e, muc, khac = khop(k["ten_kho"].replace("Kho QL - ", ""))
        tk["Kho QL"][muc.split(" (")[0].split(" - ")[0]] += 1
        rows.append([k["id"], k["ten_kho"]] + cot_etx(e) + [muc, ung_vien(khac), e["ma_nv"] if e else ""])
    sheet(wb.create_sheet("3. Kho QL chưa gắn NV"), ["Id kho", "Tên kho"] + ETX_HEAD, rows, 7)

    ws = wb.create_sheet("Hướng dẫn", 0)
    for line in [
        ["Ghép nhân sự dữ liệu cũ vào hồ sơ ETX (ETX là gốc) - chỉ các hồ sơ/tên đã có dữ liệu cấp phát thật."],
        [""],
        ["Cột 'Mã ETX chốt' (cuối mỗi sheet) = mã sẽ dùng để ghép. Đã điền sẵn theo đề xuất:"],
        ["  Xanh  = Chắc chắn (trùng Gmail / trùng họ tên duy nhất) - chỉ cần lướt kiểm."],
        ["  Vàng  = Gợi ý (nhiều người trùng tên, đã chọn theo chức danh) hoặc ETX báo đã nghỉ - kiểm kỹ."],
        ["  Đỏ    = Cần chọn tay - điền mã NS-... từ cột 'Ứng viên khác'."],
        ["  Xám   = Không tìm thấy trên ETX / không phải người - điền mã nếu biết, để trống = giữ nguyên."],
        ["Xoá mã ở cột 'Mã ETX chốt' nếu đề xuất sai. Không sửa các cột khác."],
        [""],
        ["Thống kê:"],
    ]:
        ws.append(line)
    for nguon, d in tk.items():
        ws.append([f"  {nguon}: " + ", ".join(f"{k} {v}" for k, v in sorted(d.items(), key=lambda x: -x[1]))])
    ws.column_dimensions["A"].width = 110
    ws["A1"].font = Font(bold=True, size=13)

    out = f"{DIR}/ghep_nhan_su_etx.xlsx"
    wb.save(out)
    print(out)
    for nguon, d in tk.items():
        print(nguon, dict(d))


if __name__ == "__main__":
    main()
