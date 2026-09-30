# -*- coding: utf-8 -*-
"""
Kiem thu API luong da kho + vai tro (Giai doan 1.5) tren wrangler dev LOCAL (port 8791).
Can: LOCAL_DEV_BYPASS_AUTH=true (env.local) + cac user test *@test.local da tao san trong D1 local.
Chay: python scripts/test_da_kho.py  (tao du lieu test co tien to TEST-, chay lai duoc nhieu lan).
KHONG chay voi production.
"""
import json
import sys
import threading
import time
import urllib.error
import urllib.request

BASE = "http://127.0.0.1:8791"
RUN = str(int(time.time()))[-6:]


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):
        return None


opener = urllib.request.build_opener(NoRedirect)
cookies = {}


def login(email):
    url = f"{BASE}/api/auth/dev-login" + (f"?email={email}" if email else "")
    try:
        opener.open(url)
    except urllib.error.HTTPError as e:
        sc = e.headers.get("Set-Cookie")
        assert sc, f"login {email} failed {e.code}"
        cookies[email or "admin"] = sc.split(";")[0]
        return
    raise AssertionError("expected redirect")


def call(who, method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method)
    req.add_header("Cookie", cookies[who])
    if data:
        req.add_header("Content-Type", "application/json")
    try:
        with opener.open(req) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


passed = failed = 0


def check(name, cond, extra=""):
    global passed, failed
    if cond:
        passed += 1
        print(f"  OK   {name}")
    else:
        failed += 1
        print(f"  FAIL {name} {extra}")


def ton(who, kho_id, vt):
    s, r = call(who, "GET", f"/api/bao-cao/ton-kho?kho_id={kho_id}")
    for row in r["rows"]:
        if row["id"] == vt:
            return row["ton"], row["dang_chuyen_den"]
    return 0, 0


for u in [None, "kt@test.local", "hcns@test.local", "ql@test.local", "tkmien@test.local", "nv@test.local"]:
    login(u)
A, KT, HC, QL, TK, NV = "admin", "kt@test.local", "hcns@test.local", "ql@test.local", "tkmien@test.local", "nv@test.local"

print("== Setup: nhan vien, so do QL, lien ket tai khoan, kho mien")
ql_id, nv1, nv2, nv3 = f"TQL{RUN}", f"TNV1{RUN}", f"TNV2{RUN}", f"TNV3{RUN}"
check("tao QL", call(HC, "POST", "/api/nhan-vien", {"ma_nv": ql_id, "ten_nv": "Test QL " + RUN, "email_dang_nhap": None})[0] == 200)
for m in (nv1, nv2):
    check(f"tao {m} (cap duoi QL)", call(HC, "POST", "/api/nhan-vien", {"ma_nv": m, "ten_nv": "Test " + m, "quan_ly_id": ql_id})[0] == 200)
check("tao nv3 (ngoai nhom)", call(HC, "POST", "/api/nhan-vien", {"ma_nv": nv3, "ten_nv": "Test " + nv3})[0] == 200)
# lien ket tai khoan: bo lien ket cu cua cac email test truoc (lan chay truoc) roi gan moi
for email, ma, ten, qlid in [(QL, ql_id, "Test QL " + RUN, None), (NV, nv1, "Test " + nv1, ql_id)]:
    s, r = call(A, "GET", "/api/nhan-vien")
    for row in r["rows"]:
        if row["email_dang_nhap"] == email and row["ma_nv"] != ma:
            call(A, "PUT", f"/api/nhan-vien/{row['ma_nv']}", {"ten_nv": row["ten_nv"], "email_dang_nhap": None})
    check(f"lien ket {email}", call(A, "PUT", f"/api/nhan-vien/{ma}", {"ten_nv": ten, "email_dang_nhap": email, "quan_ly_id": qlid})[0] == 200)
check("tu gan minh lam QL -> 400", call(A, "PUT", f"/api/nhan-vien/{nv3}", {"ten_nv": "x", "quan_ly_id": nv3})[0] == 400)

s, r = call(A, "GET", "/api/kho")
kho_ql = next((k for k in r["rows"] if k["nhan_vien_id"] == ql_id), None)
check("kho QL tu tao khi gan quan ly", kho_ql is not None, r)
KHO_QL = kho_ql["id"]
s, r = call(HC, "POST", "/api/kho", {"ten_kho": f"Test Kho Mien {RUN}", "loai": "Mien"})
KHO_MIEN = r["id"]
check("HCNS tao kho mien", s == 200)
check("NV khong tao duoc kho -> 403", call(NV, "POST", "/api/kho", {"ten_kho": "x", "loai": "Mien"})[0] == 403)
check("gan thu kho mien", call(HC, "POST", f"/api/kho/{KHO_MIEN}/thu-kho", {"email": TK})[0] == 200)
s, me = call(TK, "GET", "/api/auth/me")
check("/me thu kho thay kho mien", any(k["id"] == KHO_MIEN for k in me["user"]["kho_phu_trach"]), me)
s, me = call(QL, "GET", "/api/auth/me")
check("/me QL co_cap_duoi + kho QL", me["user"]["co_cap_duoi"] and any(k["id"] == KHO_QL for k in me["user"]["kho_phu_trach"]), me)

VT = f"TEST-VT-{RUN}"
check("tao vat tu test", call(HC, "POST", "/api/vt-tieu-hao", {"id": VT, "ten_vt": "Giay test " + RUN, "don_vi_tinh": "Ram"})[0] == 200)

print("== Tieu hao: nhap mua -> Ke toan duyet")
s, r = call(HC, "POST", "/api/phieu-chuyen-kho", {"loai": "Nhap mua", "tu_kho_id": 1, "den_kho_id": 2, "nha_cung_cap": "NCC test", "items": [{"vt_id": VT, "so_luong": 100, "don_gia": 50000}]})
check("HCNS lap nhap mua -> Cho ke toan duyet", s == 200 and r["trang_thai"] == "Cho ke toan duyet", r)
P_NHAP = r["id"]
check("chua duyet: ton HCNS = 0", ton(A, 2, VT)[0] == 0)
check("QL lap nhap mua -> 403", call(QL, "POST", "/api/phieu-chuyen-kho", {"loai": "Nhap mua", "tu_kho_id": 1, "den_kho_id": 2, "items": [{"vt_id": VT, "so_luong": 1}]})[0] == 403)
check("HCNS tu duyet -> 403", call(HC, "POST", f"/api/phieu-chuyen-kho/{P_NHAP}/ke-toan-duyet")[0] == 403)
check("KT tu choi khong ly do -> 400", call(KT, "POST", f"/api/phieu-chuyen-kho/{P_NHAP}/ke-toan-tu-choi", {})[0] == 400)
check("KT duyet", call(KT, "POST", f"/api/phieu-chuyen-kho/{P_NHAP}/ke-toan-duyet")[0] == 200)
check("KT duyet lan 2 -> 409", call(KT, "POST", f"/api/phieu-chuyen-kho/{P_NHAP}/ke-toan-duyet")[0] == 409)
check("ton HCNS = 100", ton(A, 2, VT)[0] == 100, ton(A, 2, VT))

print("== Chuyen kho HCNS -> Mien: tru nguon ngay, nhan / tu choi")
s, r = call(HC, "POST", "/api/phieu-chuyen-kho", {"loai": "Chuyen kho", "tu_kho_id": 2, "den_kho_id": KHO_MIEN, "items": [{"vt_id": VT, "so_luong": 30}]})
check("lap chuyen 30 -> Dang chuyen", s == 200 and r["trang_thai"] == "Dang chuyen", r)
P1 = r["id"]
check("HCNS con 70 (tru ngay)", ton(A, 2, VT)[0] == 70)
check("Mien ton 0, dang chuyen den 30", ton(A, KHO_MIEN, VT) == (0, 30), ton(A, KHO_MIEN, VT))
s, r = call(TK, "GET", "/api/phieu-chuyen-kho?cho_toi_nhan=1")
check("thu kho mien thay phieu cho nhan", any(p["id"] == P1 for p in r["rows"]))
check("NV nhan ho -> 403", call(NV, "POST", f"/api/phieu-chuyen-kho/{P1}/nhan")[0] == 403)
check("thu kho mien nhan", call(TK, "POST", f"/api/phieu-chuyen-kho/{P1}/nhan")[0] == 200)
check("Mien ton 30", ton(A, KHO_MIEN, VT)[0] == 30)
s, r = call(HC, "POST", "/api/phieu-chuyen-kho", {"loai": "Chuyen kho", "tu_kho_id": 2, "den_kho_id": KHO_MIEN, "items": [{"vt_id": VT, "so_luong": 10}]})
P2 = r["id"]
check("HCNS con 60", ton(A, 2, VT)[0] == 60)
check("thu kho mien tu choi nhan", call(TK, "POST", f"/api/phieu-chuyen-kho/{P2}/tu-choi-nhan", {"ghi_chu": "Thieu hang"})[0] == 200)
check("hoan ve HCNS = 70", ton(A, 2, VT)[0] == 70)
s, r = call(A, "GET", f"/api/phieu-chuyen-kho/{P2}")
check("log co 2 dong (Dang chuyen, Bi tu choi)", [l["trang_thai"] for l in r["log"]] == ["Dang chuyen", "Bi tu choi"], r["log"])

print("== Mien -> kho QL -> NV cap duoi")
check("QL xuat tu kho HCNS -> 403", call(QL, "POST", "/api/phieu-chuyen-kho", {"loai": "Chuyen kho", "tu_kho_id": 2, "den_kho_id": KHO_QL, "items": [{"vt_id": VT, "so_luong": 1}]})[0] == 403)
s, r = call(TK, "POST", "/api/phieu-chuyen-kho", {"loai": "Chuyen kho", "tu_kho_id": KHO_MIEN, "den_kho_id": KHO_QL, "items": [{"vt_id": VT, "so_luong": 20}]})
check("mien -> kho QL 20", s == 200, r)
check("QL nhan", call(QL, "POST", f"/api/phieu-chuyen-kho/{r['id']}/nhan")[0] == 200)
check("kho QL ton 20", ton(A, KHO_QL, VT)[0] == 20)
s, r = call(QL, "POST", "/api/phieu-chuyen-kho", {"loai": "Cap phat NV", "tu_kho_id": KHO_QL, "den_nhan_vien_id": nv1, "items": [{"vt_id": VT, "so_luong": 5}]})
check("QL cap phat cap duoi 5 -> Da giao", s == 200 and r["trang_thai"] == "Da giao", r)
P_NV = r["id"]
check("kho QL con 15", ton(A, KHO_QL, VT)[0] == 15)
check("QL cap cho nguoi ngoai nhom -> 403", call(QL, "POST", "/api/phieu-chuyen-kho", {"loai": "Cap phat NV", "tu_kho_id": KHO_QL, "den_nhan_vien_id": nv3, "items": [{"vt_id": VT, "so_luong": 1}]})[0] == 403)
check("QL dung ten tu do -> 400", call(QL, "POST", "/api/phieu-chuyen-kho", {"loai": "Cap phat NV", "tu_kho_id": KHO_QL, "nguoi_nhan_ten_tu_do": "KTV X", "items": [{"vt_id": VT, "so_luong": 1}]})[0] == 400)
s, r = call(QL, "POST", "/api/phieu-chuyen-kho", {"loai": "Cap phat NV", "tu_kho_id": KHO_QL, "den_nhan_vien_id": nv1, "items": [{"vt_id": VT, "so_luong": 1000}]})
check("xuat vuot ton -> 400 VUOT_TON", s == 400 and r["error"] == "VUOT_TON", r)
check("thu kho mien cap cho NV ngoai nhom bat ky (ten tu do)", call(TK, "POST", "/api/phieu-chuyen-kho", {"loai": "Cap phat NV", "tu_kho_id": KHO_MIEN, "nguoi_nhan_ten_tu_do": "KTV ngoai danh ba", "items": [{"vt_id": VT, "so_luong": 2}]})[0] == 200)
check("QL xac nhan ho NV -> 403", call(QL, "POST", f"/api/phieu-chuyen-kho/{P_NV}/xac-nhan")[0] == 403)
check("NV xac nhan phieu cua minh", call(NV, "POST", f"/api/phieu-chuyen-kho/{P_NV}/xac-nhan")[0] == 200)

print("== Chot chan dong thoi: 2 phieu x10 cung luc, kho QL chi con 15")
results = []


def fire():
    results.append(call(QL, "POST", "/api/phieu-chuyen-kho", {"loai": "Cap phat NV", "tu_kho_id": KHO_QL, "den_nhan_vien_id": nv2, "items": [{"vt_id": VT, "so_luong": 10}]}))


ths = [threading.Thread(target=fire) for _ in range(2)]
[t.start() for t in ths]
[t.join() for t in ths]
codes = sorted(s for s, _ in results)
check("dung 1 phieu thanh cong", codes.count(200) == 1, results)
check("kho QL khong am (= 5)", ton(A, KHO_QL, VT)[0] == 5, ton(A, KHO_QL, VT))

print("== TSCD: nhap mua -> KT duyet -> chuyen kho / cap phat / dieu chuyen / bao hong / thanh ly")
TS = [f"TEST-TS-{RUN}-{i}" for i in range(1, 4)]
for t in TS:
    s, r = call(HC, "POST", "/api/ccdc", {"id": t, "ten_ccdc": "Laptop test " + t, "nguyen_gia": 10000000, "nha_cung_cap": "NCC"})
    check(f"tao {t} -> kem phieu nhap mua", s == 200 and r.get("phieu_id"), r)
    s2, row = call(A, "GET", f"/api/ccdc/{t}")
    check("  trang thai Cho duyet nhap", row["row"]["trang_thai_hien_tai"] == "Cho duyet nhap")
    check("  KT duyet nhap", call(KT, "POST", f"/api/phieu-xu-ly-ts/{r['phieu_id']}/ke-toan-duyet")[0] == 200)
    s2, row = call(A, "GET", f"/api/ccdc/{t}")
    check("  -> Trong kho HCNS", row["row"]["trang_thai_hien_tai"] == "Trong kho" and row["row"]["kho_id"] == 2, row["row"])

check("QL chuyen TS tu kho HCNS -> 403", call(QL, "POST", "/api/phieu-giao-nhan", {"loai_phieu": "Chuyen kho", "tu_kho_id": 2, "den_kho_id": KHO_MIEN, "items": [{"ccdc_id": TS[0]}]})[0] == 403)
check("HCNS chuyen TS1 -> kho mien", call(HC, "POST", "/api/phieu-giao-nhan", {"loai_phieu": "Chuyen kho", "tu_kho_id": 2, "den_kho_id": KHO_MIEN, "items": [{"ccdc_id": TS[0]}]})[0] == 200)
check("thu kho mien cap phat TS1 cho NV ngoai nhom (toan he thong)", call(TK, "POST", "/api/phieu-giao-nhan", {"loai_phieu": "Cap phat", "tu_kho_id": KHO_MIEN, "nhan_vien_id": nv3, "items": [{"ccdc_id": TS[0]}]})[0] == 200)
check("QL dieu chuyen TS1 tu nguoi ngoai nhom -> 403", call(QL, "POST", "/api/phieu-giao-nhan", {"loai_phieu": "Dieu chuyen", "nhan_vien_id": nv3, "nhan_vien_nhan_moi_id": nv1, "items": [{"ccdc_id": TS[0]}]})[0] == 403)
check("HCNS cap phat TS2 cho NV1", call(HC, "POST", "/api/phieu-giao-nhan", {"loai_phieu": "Cap phat", "tu_kho_id": 2, "nhan_vien_id": nv1, "items": [{"ccdc_id": TS[1]}]})[0] == 200)
check("QL dieu chuyen TS2 NV1 -> NV2 (trong nhom)", call(QL, "POST", "/api/phieu-giao-nhan", {"loai_phieu": "Dieu chuyen", "nhan_vien_id": nv1, "nhan_vien_nhan_moi_id": nv2, "items": [{"ccdc_id": TS[1]}]})[0] == 200)
check("QL dieu chuyen TS2 NV2 -> QL (ve minh)", call(QL, "POST", "/api/phieu-giao-nhan", {"loai_phieu": "Dieu chuyen", "nhan_vien_id": nv2, "nhan_vien_nhan_moi_id": ql_id, "items": [{"ccdc_id": TS[1]}]})[0] == 200)
check("QL dieu chuyen TS2 QL -> NV1", call(QL, "POST", "/api/phieu-giao-nhan", {"loai_phieu": "Dieu chuyen", "nhan_vien_id": ql_id, "nhan_vien_nhan_moi_id": nv1, "items": [{"ccdc_id": TS[1]}]})[0] == 200)

s, r = call(NV, "POST", "/api/phieu-xu-ly-ts", {"loai": "Bao hong", "ccdc_ids": [TS[1]], "ly_do": "Vo man hinh"})
check("NV1 bao hong TS minh giu", s == 200, r)
s2, row = call(A, "GET", f"/api/ccdc/{TS[1]}")
check("  -> Cho duyet bao hong", row["row"]["trang_thai_hien_tai"] == "Cho duyet bao hong")
check("NV bao hong TS nguoi khac -> 403", call(NV, "POST", "/api/phieu-xu-ly-ts", {"loai": "Bao hong", "ccdc_ids": [TS[0]], "ly_do": "x"})[0] == 403)
check("KT tu choi bao hong", call(KT, "POST", f"/api/phieu-xu-ly-ts/{r['id']}/ke-toan-tu-choi", {"ghi_chu": "Van dung duoc"})[0] == 200)
s2, row = call(A, "GET", f"/api/ccdc/{TS[1]}")
check("  -> hoan Dang cap phat NV1", row["row"]["trang_thai_hien_tai"] == "Dang cap phat" and row["row"]["nguoi_dang_giu"] == nv1, row["row"])
s, r = call(QL, "POST", "/api/phieu-xu-ly-ts", {"loai": "Bao hong", "ccdc_ids": [TS[1]], "ly_do": "Hong han"})
check("QL bao hong TS cua cap duoi", s == 200, r)
check("KT duyet bao hong", call(KT, "POST", f"/api/phieu-xu-ly-ts/{r['id']}/ke-toan-duyet")[0] == 200)
s2, row = call(A, "GET", f"/api/ccdc/{TS[1]}")
check("  -> Hong, thu ve kho HCNS", row["row"]["trang_thai_hien_tai"] == "Hong" and row["row"]["kho_id"] == 2 and row["row"]["nguoi_dang_giu"] is None, row["row"])
check("QL de xuat thanh ly -> 403", call(QL, "POST", "/api/phieu-xu-ly-ts", {"loai": "Thanh ly", "ccdc_ids": [TS[1]], "ly_do": "x"})[0] == 403)
check("thanh ly TS dang cap phat -> 400", call(HC, "POST", "/api/phieu-xu-ly-ts", {"loai": "Thanh ly", "ccdc_ids": [TS[0]], "ly_do": "x"})[0] == 400)
s, r = call(HC, "POST", "/api/phieu-xu-ly-ts", {"loai": "Thanh ly", "ccdc_ids": [TS[1]], "ly_do": "Hong khong sua duoc"})
check("HCNS de xuat thanh ly TS Hong", s == 200, r)
P_TL = r["id"]
check("hoan tat truoc khi KT duyet -> 409", call(HC, "POST", f"/api/phieu-xu-ly-ts/{P_TL}/hoan-tat", {})[0] == 409)
check("KT duyet thanh ly", call(KT, "POST", f"/api/phieu-xu-ly-ts/{P_TL}/ke-toan-duyet")[0] == 200)
check("HCNS hoan tat thanh ly (thu hoi 500k)", call(HC, "POST", f"/api/phieu-xu-ly-ts/{P_TL}/hoan-tat", {"gia_tri_thu_hoi": 500000})[0] == 200)
s2, row = call(A, "GET", f"/api/ccdc/{TS[1]}")
check("  -> Da thanh ly", row["row"]["trang_thai_hien_tai"] == "Da thanh ly")
s, r = call(HC, "POST", "/api/phieu-xu-ly-ts", {"loai": "Tieu huy", "ccdc_ids": [TS[2]], "ly_do": "Het khau hao"})
call(KT, "POST", f"/api/phieu-xu-ly-ts/{r['id']}/ke-toan-duyet")
check("tieu huy hoan tat", call(HC, "POST", f"/api/phieu-xu-ly-ts/{r['id']}/hoan-tat", {})[0] == 200)
s2, row = call(A, "GET", f"/api/ccdc/{TS[2]}")
check("  -> Da tieu huy", row["row"]["trang_thai_hien_tai"] == "Da tieu huy")

print(f"\n{passed} OK, {failed} FAIL")
sys.exit(1 if failed else 0)
