"""
Lam sach du lieu tu "Database QL CCDC v2.0 3T.xlsx" (he thong Google Sheet cu) de chuan bi
import vao he moi (ccdc-app). CHI lam nhung viec co the kiem chung may moc (khong doan mo
nghiep vu):

1. Bo qua sheet "Latop thue tach ra" (theo yeu cau, khong migrate).
2. Tach truong "Kho den"/"Kho di" (dang tron lan dia diem / ten nguoi / trang thai gia) thanh
   3 loai ro rang bang cach doi chieu that voi sheet "QL Nhan su" + danh sach tu khoa dia diem
   da xac nhan tu du lieu that (khong doan).
3. Loc "QL Nhan su" thanh danh sach nhan vien THAT (bo cac dong gia lam dai dien cho kho/dia
   diem, vd "Kho mua hang", "Chua ban giao").
4. Chuan hoa hoa/thuong cho "Don vi tinh" bang tan suat (khong tu bien nghia).
5. KHONG tu dong gop nhom "Nhom dung cu" (50 nhom) - day la quyet dinh nghiep vu, chi xuat 1
   sheet DE XUAT rieng de doi ngu 3T tu duyet, KHONG ap vao du lieu sach.

Output: "CCDC_data_da_lam_sach.xlsx" (cung thu muc) - dung de RA SOAT truoc khi import that,
khong phai file import truc tiep khong kiem tra.

Chay: python scripts/clean_import_data.py
"""

import collections
import re
import openpyxl
from openpyxl.styles import Font, PatternFill

SRC = "Database QL CCDC v2.0 3T.xlsx"
OUT = "CCDC_data_da_lam_sach.xlsx"

# Tu khoa nhan dien "dia diem" - lay tu chinh cac gia tri tan suat cao nhat da khao sat that
# trong "Kho den"/"Kho di" (khong doan), + tien to pho bien.
LOCATION_KEYWORDS = [
    "Kho ", "Kho\xa0", "Văn phòng", "VP ", "Phòng đào tạo", "Chi nhánh",
]
SENTINEL_CHUA_BAN_GIAO = "Chưa bàn giao"
# "GS DVBH - <ten>" / "GS <khu vuc> - <ten>": nhan la 1 NGUOI (ten sau dau '-'), phan truoc la
# vai tro/khu vuc - giu lai lam ghi chu, khong bo.
GS_PATTERN = re.compile(r"^(GS[^-]*)-\s*(.+)$")


def norm_name(s):
    return re.sub(r"\s+", " ", str(s).strip()).casefold() if s else ""


def load_employees(wb):
    """Tra ve (real_employees: dict ten_chuan_hoa -> record, pseudo_names: set ten_chuan_hoa)."""
    ws = wb["QL Nhân sự"]
    rows = list(ws.iter_rows(values_only=True))
    header = rows[0]
    idx = {name: i for i, name in enumerate(header)}

    real = {}
    pseudo = set()
    ragged = 0
    for r in rows[1:]:
        if idx["Họ và tên"] >= len(r) or not r[idx["Họ và tên"]]:
            continue
        ten = str(r[idx["Họ và tên"]]).strip()
        if idx["Mail"] >= len(r):
            ragged += 1
        is_location = any(kw.casefold() in ten.casefold() for kw in LOCATION_KEYWORDS) or ten == SENTINEL_CHUA_BAN_GIAO
        if is_location:
            pseudo.add(norm_name(ten))
            continue
        real[norm_name(ten)] = {
            "ten": ten,
            "msnv": r[idx["MSNV mới"]] if idx["MSNV mới"] < len(r) else None,
            "bo_phan": r[idx["Bộ Phận"]] if idx["Bộ Phận"] < len(r) else None,
            "qltt": r[idx["QLTT"]] if idx["QLTT"] < len(r) else None,
            "cap_do": r[idx["Cấp độ"]] if idx["Cấp độ"] < len(r) else None,
            "mail": r[idx["Mail"]] if idx["Mail"] < len(r) else None,
            "hoat_dong": r[idx["Hoạt động"]] if idx["Hoạt động"] < len(r) else None,
            "mail_quan_ly": r[idx["Mail quản lý"]] if idx["Mail quản lý"] < len(r) else None,
        }
    return real, pseudo, ragged


def classify_holder(raw_value, employees, pseudo_names):
    """Phan loai 1 gia tri 'Kho den'/'Kho di' -> (loai, ten_nguoi_hoac_None, ghi_chu)."""
    if raw_value is None or str(raw_value).strip() == "":
        return "TRONG", None, ""
    val = str(raw_value).strip()

    if val == SENTINEL_CHUA_BAN_GIAO:
        return "CHUA_BAN_GIAO", None, ""

    if any(kw.casefold() in val.casefold() for kw in LOCATION_KEYWORDS):
        return "DIA_DIEM", None, val

    m = GS_PATTERN.match(val)
    if m:
        role_prefix, ten = m.group(1).strip(), m.group(2).strip()
        key = norm_name(ten)
        if key in employees:
            return "NGUOI", employees[key]["ten"], f"Vai trò/khu vực gốc: {role_prefix}"
        return "KHONG_XAC_DINH", None, f"Không khớp danh bạ nhân sự (dạng 'GS - tên'): {val}"

    key = norm_name(val)
    if key in employees:
        return "NGUOI", employees[key]["ten"], ""
    if key in pseudo_names:
        return "DIA_DIEM_KHAC", None, val

    return "KHONG_XAC_DINH", None, f"Không khớp danh bạ nhân sự, không phải từ khoá địa điểm đã biết: {val}"


def build_unit_normalizer(values):
    """Gop bien the hoa/thuong/khoang trang cua cung 1 don vi tinh, chon dang xuat hien nhieu
    nhat lam chuan - THUAN TUY tan suat, khong tu bien nghia moi."""
    groups = collections.defaultdict(collections.Counter)
    for v in values:
        if not v:
            continue
        key = re.sub(r"\s+", " ", str(v).strip()).casefold()
        groups[key][str(v).strip()] += 1
    canonical = {}
    for key, counter in groups.items():
        best = counter.most_common(1)[0][0]
        canonical[key] = best
    return canonical


def norm_unit(v, canonical):
    if not v:
        return v
    key = re.sub(r"\s+", " ", str(v).strip()).casefold()
    return canonical.get(key, str(v).strip())


# Danh sach DE XUAT gop nhom dung cu (50 -> ~12), CHI de tham khao, KHONG ap dung vao du lieu
# sach - xem sheet "De xuat gop nhom (CAN DUYET)" trong file output. Nhung nhom mang tinh phan
# phoi-theo-doi-tuong (vd "cap phat cho KTV") CO CHU DINH KHONG gop vi gop se mat thong tin.
GROUP_PROPOSAL = {
    "Văn phòng phẩm": "Văn phòng phẩm",
    "Bút viêt": "Văn phòng phẩm",
    "Giấy A4": "Văn phòng phẩm",
    "Bút chì": "Văn phòng phẩm",
    "Sổ tay cá nhân": "Văn phòng phẩm",
    "Thiết bị văn phòng": "Thiết bị văn phòng",
    "Thiết bị văn phòng phẩm": "Thiết bị văn phòng (CẦN XÁC NHẬN - có trùng ý 'Văn phòng phẩm' không?)",
    "Máy in": "Thiết bị văn phòng",
    "Cổng kết nối tivi": "Thiết bị văn phòng",
    "Tivi": "Thiết bị văn phòng",
    "máy tính cây": "Thiết bị văn phòng",
    "Điện thoại": "Thiết bị văn phòng",
    "tai nghe": "Thiết bị văn phòng",
    "sim": "Thiết bị văn phòng",
    "Dụng cụ vệ sinh": "Dụng cụ vệ sinh",
    "Cọ cốc": "Dụng cụ vệ sinh",
    "xô": "Dụng cụ vệ sinh",
    "khăn giấy khô": "Dụng cụ vệ sinh",
    "giấy ướt": "Dụng cụ vệ sinh",
    "Bàn ghế": "Bàn ghế / Nội thất",
    "Tủ, kệ": "Bàn ghế / Nội thất",
    "Thiết bị điện gia dụng": "Thiết bị điện gia dụng",
    "Máy lọc nước": "Thiết bị điện gia dụng",
    "ổ cắm chuyền": "Thiết bị điện gia dụng",
    "Loa kéo": "Thiết bị điện gia dụng",
    "Công cụ dụng cụ điện lạnh": "Điện lạnh",
    "Dụng cụ sửa chữa cây nóng lạnh phòng bảo Hành": "Điện lạnh",
    "Vật tư tiêu hao nạp ga": "Điện lạnh",
    "Công cụ lọc tổng": "Điện lạnh",
    "Biên bản khảo sát hệ thống lọc tổng": "Điện lạnh (CẦN XÁC NHẬN - đây có vẻ là CHỨNG TỪ, không phải CCDC vật lý?)",
    "Dụng cụ đóng hàng": "Đóng gói / vận chuyển",
    "chốt đai": "Đóng gói / vận chuyển",
    "Quần áo": "Đồng phục / bảo hộ",
    "Bảng báo giá phòng Phát triển dịch vụ": "Hồ sơ/chứng từ phòng PTDV (CẦN XÁC NHẬN - chứng từ hay CCDC?)",
    "Hợp đồng phòng Phát triển dịch vụ": "Hồ sơ/chứng từ phòng PTDV (CẦN XÁC NHẬN - chứng từ hay CCDC?)",
    "Ấn phẩm cho phòng đào tạo": "Hồ sơ/chứng từ phòng PTDV (CẦN XÁC NHẬN - chứng từ hay CCDC?)",
    "Phiếu thu": "Hồ sơ/chứng từ phòng PTDV (CẦN XÁC NHẬN - chứng từ hay CCDC?)",
    "Laptop": "Thiết bị CNTT",
    "Bộ camera": "Thiết bị CNTT",
    "Khác": "Khác",
    "Phong thủy": "Khác",
}
# Cac nhom con lai (khong co trong dict tren) = de xuat GIU NGUYEN vi mang tinh phan phoi theo
# doi tuong su dung (KTV/B2B/tram 24h/PTDV...), gop se mat thong tin phan bo theo bo phan.


def main():
    wb = openpyxl.load_workbook(SRC, read_only=True, data_only=True)
    employees, pseudo_names, ragged = load_employees(wb)

    out = openpyxl.Workbook()
    out.remove(out.active)
    bold = Font(bold=True)
    warn_fill = PatternFill(start_color="FFF3CD", end_color="FFF3CD", fill_type="solid")

    def new_sheet(name, headers):
        ws = out.create_sheet(name)
        ws.append(headers)
        for c in ws[1]:
            c.font = bold
        return ws

    # ---- README ----
    readme = new_sheet("README", ["Nội dung"])
    readme.column_dimensions["A"].width = 120
    for line in [
        "File này là KẾT QUẢ LÀM SẠCH TỰ ĐỘNG từ 'Database QL CCDC v2.0 3T.xlsx' - dùng để RÀ SOÁT trước khi import vào hệ mới, KHÔNG phải import thẳng.",
        "",
        "Các sheet:",
        "- Danh_muc_co_dinh / Danh_muc_tieu_hao: catalog đã tách theo 2 mô hình (cố định vs tiêu hao), đơn vị tính đã chuẩn hoá hoa/thường theo tần suất.",
        "- QL_tai_san_sach: 1.123 dòng tài sản cố định, cột 'Kho đến' gốc đã tách thành loai_nguoi_giu (NGUOI/DIA_DIEM/CHUA_BAN_GIAO/KHONG_XAC_DINH) + nguoi_giu_ten.",
        "- QL_tieu_hao_sach: 7.350 giao dịch tiêu hao, tương tự tách Kho đi/Kho đến.",
        "- Nhan_vien_sach: danh bạ nhân viên THẬT (đã loại các dòng đại diện kho/địa điểm giả).",
        "- Can_kiem_tra_thu_cong: các dòng có giá trị 'Kho đến'/'Kho đi' KHÔNG khớp được danh bạ nhân sự và KHÔNG khớp từ khoá địa điểm đã biết - cần người biết nghiệp vụ xác nhận tay (không đoán).",
        "- De_xuat_gop_nhom (CẦN DUYỆT): đề xuất gộp 50 'Nhóm dụng cụ' hiện tại thành nhóm gọn hơn - ĐÂY LÀ QUYẾT ĐỊNH NGHIỆP VỤ, KHÔNG được áp dụng vào 2 sheet Danh_muc ở trên. Cột tô vàng = tôi không chắc, cần 3T xác nhận trực tiếp.",
        "",
        "Loại trừ theo yêu cầu: sheet 'Latop thuê tách ra' KHÔNG được đưa vào file này.",
    ]:
        readme.append([line])

    # ---- Danh muc: tach 2 mo hinh ----
    ws_dm = wb["Danh mục"]
    rows_dm = list(ws_dm.iter_rows(values_only=True))
    header_dm = rows_dm[0]
    idx_dm = {name: i for i, name in enumerate(header_dm)}
    real_dm = [r for r in rows_dm[1:] if r[idx_dm["ID tài sản"]]]

    unit_canon = build_unit_normalizer(r[idx_dm["Đơn vị tính"]] for r in real_dm)

    cols_common = ["ID tài sản", "Tên tài sản", "Nhóm dụng cụ (gốc)", "Đơn vị tính (đã chuẩn hoá)",
                   "Giá mua", "Mô tả chi tiết", "Chu kỳ kiểm định (tháng)", "Tuổi thọ dụng cụ (tháng)",
                   "Người khai báo", "Ngày tạo", "THIẾU GIÁ MUA?"]
    ws_codinh = new_sheet("Danh_muc_co_dinh", cols_common)
    ws_tieuhao = new_sheet("Danh_muc_tieu_hao", cols_common)

    for r in real_dm:
        gia = r[idx_dm["Giá mua"]]
        row_out = [
            r[idx_dm["ID tài sản"]], r[idx_dm["Tên tài sản"]], r[idx_dm["Nhóm dụng cụ"]],
            norm_unit(r[idx_dm["Đơn vị tính"]], unit_canon), gia, r[idx_dm["Mô tả chi tiết"]],
            r[idx_dm["Chu kỳ kiểm định (tháng)"]], r[idx_dm["Tuổi thọ dụng cụ (tháng)"]],
            r[idx_dm["Người khai báo"]], r[idx_dm["Ngày tạo"]],
            "X" if (gia is None or gia == 0) else "",
        ]
        target = ws_codinh if r[idx_dm["Phân loại tài sản"]] == "Tài sản cố định" else ws_tieuhao
        target.append(row_out)

    # ---- Nhan vien sach ----
    ws_nv = new_sheet("Nhan_vien_sach", ["Họ và tên", "MSNV", "Bộ phận", "Quản lý trực tiếp",
                                          "Cấp độ", "Mail", "Đang hoạt động", "Mail quản lý"])
    for rec in employees.values():
        ws_nv.append([rec["ten"], rec["msnv"], rec["bo_phan"], rec["qltt"], rec["cap_do"],
                      rec["mail"], rec["hoat_dong"], rec["mail_quan_ly"]])

    # ---- QL tai san sach ----
    ws_qlts = wb["QL tài sản"]
    rows_qlts = list(ws_qlts.iter_rows(values_only=True))
    header_qlts = rows_qlts[0]
    idx_qlts = {name: i for i, name in enumerate(header_qlts)}
    real_qlts = [r for r in rows_qlts[1:] if r[idx_qlts["Key, serial tài sản"]]]

    ws_qlts_out = new_sheet("QL_tai_san_sach", [
        "Key, serial tài sản", "ID tài sản", "Tên tài sản", "Kho đi (gốc)",
        "Kho đến (gốc)", "loai_nguoi_giu", "nguoi_giu_ten", "ghi_chu_phan_loai",
        "Kết quả bàn giao", "Ngày mua", "% Giá trị hiện tại", "Quản lý (email)",
        "Thuộc về kho (email)", "Ghi chú",
    ])
    can_kiem_tra = new_sheet("Can_kiem_tra_thu_cong", [
        "Nguồn sheet", "Key/ID giao dịch", "Trường", "Giá trị gốc", "Lý do cần kiểm tra tay",
    ])
    for c in can_kiem_tra[1]:
        c.font = bold

    for r in real_qlts:
        loai, ten, ghichu = classify_holder(r[idx_qlts["Kho đến"]], employees, pseudo_names)
        ws_qlts_out.append([
            r[idx_qlts["Key, serial tài sản"]], r[idx_qlts["ID Tài sản"]], r[idx_qlts["Tên tài sản"]],
            r[idx_qlts["Kho đi"]], r[idx_qlts["Kho đến"]], loai, ten, ghichu,
            r[idx_qlts["Kết quả bàn giao"]], r[idx_qlts["Ngày mua"]], r[idx_qlts["% Giá trị hiện tại"]],
            r[idx_qlts["Quản lý"]], r[idx_qlts["Thuộc về kho"]], r[idx_qlts["Ghi chú"]],
        ])
        if loai == "KHONG_XAC_DINH":
            can_kiem_tra.append(["QL tài sản", r[idx_qlts["Key, serial tài sản"]], "Kho đến",
                                  r[idx_qlts["Kho đến"]], ghichu])

    # ---- QL tieu hao sach ----
    ws_qlth = wb["QL tiêu hao"]
    rows_qlth = list(ws_qlth.iter_rows(values_only=True))
    header_qlth = rows_qlth[0]
    idx_qlth = {name: i for i, name in enumerate(header_qlth)}
    real_qlth = [r for r in rows_qlth[1:] if r[idx_qlth["ID"]]]

    ws_qlth_out = new_sheet("QL_tieu_hao_sach", [
        "ID giao dịch", "ID tài sản", "Tên tài sản", "Phân loại (Nhập/Xuất)",
        "Kho đi (gốc)", "loai_kho_di", "nguoi_kho_di", "Kho đến (gốc)", "loai_kho_den",
        "nguoi_kho_den", "Số lượng", "Đơn giá", "Thành tiền", "Trạng thái", "Tháng tạo",
    ])
    for r in real_qlth:
        loai_di, ten_di, _ = classify_holder(r[idx_qlth["Kho đi"]], employees, pseudo_names)
        loai_den, ten_den, ghichu_den = classify_holder(r[idx_qlth["Kho đến"]], employees, pseudo_names)
        ws_qlth_out.append([
            r[idx_qlth["ID"]], r[idx_qlth["ID tài sản"]], r[idx_qlth["Tên tài sản"]],
            r[idx_qlth["Phân loại"]], r[idx_qlth["Kho đi"]], loai_di, ten_di,
            r[idx_qlth["Kho đến"]], loai_den, ten_den, r[idx_qlth["Số lượng"]],
            r[idx_qlth["Đơn giá"]], r[idx_qlth["Thành tiền"]], r[idx_qlth["Trạng thái"]],
            r[idx_qlth["Tháng tạo"]],
        ])
        if loai_den == "KHONG_XAC_DINH":
            can_kiem_tra.append(["QL tiêu hao", r[idx_qlth["ID"]], "Kho đến",
                                  r[idx_qlth["Kho đến"]], ghichu_den])

    # ---- De xuat gop nhom (CAN DUYET) ----
    ws_group = new_sheet("De_xuat_gop_nhom (CAN DUYET)", [
        "Nhóm dụng cụ (gốc, 50 nhóm)", "Số dòng danh mục", "Đề xuất gộp thành", "Trạng thái",
    ])
    nhom_counts = collections.Counter(r[idx_dm["Nhóm dụng cụ"]] for r in real_dm if r[idx_dm["Nhóm dụng cụ"]])
    for nhom, count in nhom_counts.most_common():
        proposal = GROUP_PROPOSAL.get(nhom, nhom + " (đề xuất: giữ nguyên - mang tính phân phối theo đối tượng)")
        status = "CẦN XÁC NHẬN" if "CẦN XÁC NHẬN" in proposal else ("Giữ nguyên" if proposal.startswith(nhom + " (") else "Đề xuất gộp")
        row = ws_group.max_row + 1
        ws_group.append([nhom, count, proposal, status])
        if status == "CẦN XÁC NHẬN":
            for col in range(1, 5):
                ws_group.cell(row=row, column=col).fill = warn_fill

    for ws in out.worksheets:
        ws.freeze_panes = "A2"
        for col_cells in ws.columns:
            length = max((len(str(c.value)) if c.value is not None else 0) for c in col_cells)
            ws.column_dimensions[col_cells[0].column_letter].width = min(max(length + 2, 10), 60)

    out.save(OUT)
    print(f"Da ghi {OUT}")
    print(f"Nhan vien that: {len(employees)}, pseudo/dia diem loc bo: {len(pseudo_names)}, dong rach (thieu cot): {ragged}")
    print(f"QL tai san: {len(real_qlts)} dong, can kiem tra tay: {sum(1 for r in real_qlts if classify_holder(r[idx_qlts['Kho đến']], employees, pseudo_names)[0]=='KHONG_XAC_DINH')}")


if __name__ == "__main__":
    main()
