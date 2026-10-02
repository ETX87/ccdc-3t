# Kich ban chup man hinh tai lieu huong dan vai tro KE TOAN. Chay: python chup_ke_toan.py <canh1> <canh2> ...
# Canh `chuan_bi` (chay 1 lan): HCNS tao san cac phieu cho KT duyet qua API.
import sys
from hd import *

HCNS = 'hcns@test.local'
KT = 'kt@test.local'
VT = 'VT-DT-A4'
P = 'kt_'  # tien to ten anh


def api(pg, method, path, body=None):
    r = pg.request.fetch(BASE + '/api' + path, method=method, data=body)
    if not r.ok:
        raise RuntimeError(f'{method} {path} -> {r.status} {r.text()}')
    return r.json()


def c_chuan_bi():
    pg = dang_nhap(HCNS)
    ts = lambda id, ten, nhom, gia, ncc, seri: api(pg, 'POST', '/ccdc', {
        'id': id, 'ten_ccdc': ten, 'nhom_id': nhom, 'don_vi_tinh': 'Chiếc', 'so_seri': seri, 'nguyen_gia': gia,
        'ngay_mua': '2026-10-01', 'nha_cung_cap': ncc, 'han_bao_hanh': '2027-10-01', 'tinh_trang': 'Tot'})
    ts('TS3T-DT-0002', 'Máy in Canon LBP 2900 (đào tạo)', 2, 3990000, 'Công ty TNHH Phong Vũ', 'CN2900-77K1')
    ts('TS3T-DT-0003', 'Màn hình Dell P2422H (đào tạo)', 2, 45900000, 'Công ty TNHH Phong Vũ', 'DLP24-55X0')
    nm = lambda gia, sl, ghi: api(pg, 'POST', '/phieu-chuyen-kho', {
        'loai': 'Nhap mua', 'tu_kho_id': 1, 'den_kho_id': 2, 'nha_cung_cap': 'Văn phòng phẩm Hồng Hà',
        'ghi_chu': ghi, 'items': [{'vt_id': VT, 'so_luong': sl, 'don_gia': gia}]})
    nm(70000, 50, 'Bổ sung giấy in tháng 10/2026')
    nm(700000, 20, 'Mua giấy in cho văn phòng Hà Nội')
    api(pg, 'POST', '/phieu-xu-ly-ts', {'loai': 'Bao hong', 'ccdc_ids': ['TS3T-000003-001'], 'ly_do': 'Gãy chân bàn, không sử dụng được'})
    api(pg, 'POST', '/phieu-xu-ly-ts', {'loai': 'Tieu huy', 'ccdc_ids': ['TS3T-000137-001'], 'ly_do': 'Sim hỏng, nhà mạng đã thu hồi số'})
    api(pg, 'POST', '/phieu-xu-ly-ts', {'loai': 'Thanh ly', 'ccdc_ids': ['TS3T-000025-012', 'TS3T-000025-079'], 'ly_do': 'Laptop thuê hỏng main, hết hạn thuê - trả/thanh lý'})
    print('da tao phieu cho duyet')


def mo_ma(pg, chua: str):
    pg.locator('tr', has_text=chua).locator('.code-link').first.click()
    cho(pg)


def dong_viec(pg, chua):
    return pg.locator('main tr', has_text=chua).first


def c_giao_dien():
    pg = dang_nhap(KT)
    danh_dau(pg.locator('aside'))
    chup(pg, P + '01_giao_dien')
    chup(pg, P + '02_tong_quan', full=True)


def c_viec():
    pg = dang_nhap(KT)
    menu(pg, 'Việc cần làm')
    chup(pg, P + '03_viec_can_lam')
    pg.locator('main').get_by_role('button', name='Chờ duyệt').first.click() if pg.locator('main').get_by_role('button', name='Chờ duyệt').count() else None
    cho(pg, 500)
    r = dong_viec(pg, 'Máy in Canon')
    danh_dau(r.get_by_role('button', name='Duyệt'), r.get_by_role('button', name='Từ chối'))
    chup(pg, P + '04_duyet_nhanh')
    # Duyet nhanh phieu nhap may in
    r.get_by_role('button', name='Duyệt').click()
    cho(pg)
    chup(pg, P + '05_sau_duyet_nhanh')
    # Tu choi phieu nhap man hinh (nguyen gia sai)
    r = dong_viec(pg, 'Màn hình Dell')
    r.get_by_role('button', name='Từ chối').click()
    cho(pg, 400)
    m = modal(pg)
    m.locator('input[type=text]').fill('Nguyên giá 45.900.000 không khớp hoá đơn (4.590.000) - đề nghị HCNS nhập lại')
    danh_dau(m.get_by_role('button', name='Từ chối', exact=True))
    chup(pg, P + '06_tu_choi_nhanh', m)
    m.get_by_role('button', name='Từ chối', exact=True).click()
    cho(pg)


def c_hcns_bi_tu_choi():
    pg = dang_nhap(HCNS)
    menu(pg, 'Việc cần làm')
    r = pg.locator('main tr', has_text='từ chối').first
    if r.count():
        danh_dau(r.locator('.code-link'), r.get_by_role('button', name='Xem'))
    chup(pg, P + '07_hcns_thay_tu_choi')
    menu(pg, 'Tài sản', 'Danh mục tài sản cố định')
    pg.get_by_placeholder('Tìm mã, tên, số seri...').fill('TS3T-DT-0003')
    cho(pg, 900)
    mo_ma(pg, 'TS3T-DT-0003') if pg.locator('tr', has_text='TS3T-DT-0003').count() else None


def c_duyet_nhap_mua():
    pg = dang_nhap(KT)
    menu(pg, 'Cấp phát', 'Phiếu cấp phát & chuyển kho')
    the = pg.locator('main .kpi-card', has_text='Chờ Kế toán duyệt').first
    danh_dau(the)
    chup(pg, P + '10_cap_phat')
    the.click()
    cho(pg)
    chup(pg, P + '11_loc_cho_duyet')
    mo_ma(pg, 'NM-2610-0002')
    m = modal(pg)
    danh_dau(m.get_by_role('button', name='Duyệt', exact=True), m.get_by_role('button', name='Từ chối', exact=True))
    chup(pg, P + '12_popup_nhap_mua', m)
    m.get_by_role('button', name='Duyệt', exact=True).click()
    cho(pg)
    chup(pg, P + '13_nhap_mua_da_duyet', modal(pg))


def c_canh_bao_gia():
    pg = dang_nhap(KT)
    menu(pg, 'Cảnh báo')
    chup(pg, P + '20_canh_bao', full=True)
    pg.locator('main').get_by_text('Đơn giá bất thường', exact=True).first.click()
    cho(pg)
    chup(pg, P + '21_don_gia_bat_thuong')


def c_tu_choi_popup():
    pg = dang_nhap(KT)
    menu(pg, 'Cấp phát', 'Phiếu cấp phát & chuyển kho')
    pg.locator('main .kpi-card', has_text='Chờ Kế toán duyệt').first.click()
    cho(pg)
    mo_ma(pg, 'NM-2610-0003')
    m = modal(pg)
    m.get_by_role('button', name='Từ chối', exact=True).click()
    pg.wait_for_timeout(300)
    m.locator('.action-panel input[type=text]').fill('Đơn giá 700.000đ/ram sai (giá thường 68.000-72.000đ) - HCNS kiểm tra hoá đơn và lập lại phiếu')
    danh_dau(m.get_by_role('button', name='Xác nhận: Từ chối'))
    chup(pg, P + '22_tu_choi_popup', m)
    m.get_by_role('button', name='Xác nhận: Từ chối').click()
    cho(pg)
    chup(pg, P + '23_da_tu_choi', modal(pg))


def c_bao_hong():
    pg = dang_nhap(KT)
    menu(pg, 'Báo hỏng')
    chup(pg, P + '30_bao_hong')
    mo_ma(pg, 'BH-')
    m = modal(pg)
    danh_dau(m.get_by_role('button', name='Duyệt', exact=True))
    chup(pg, P + '31_popup_bao_hong', m)
    m.get_by_role('button', name='Duyệt', exact=True).click()
    cho(pg)
    chup(pg, P + '32_bao_hong_da_duyet', modal(pg))


def c_thanh_ly():
    pg = dang_nhap(KT)
    menu(pg, 'Thanh lý & tiêu hủy')
    chup(pg, P + '40_thanh_ly')
    for tt, ten in [('TL-', '41_popup_thanh_ly'), ('TH-', '42_popup_tieu_huy')]:
        pg.locator('main tr', has_text=tt).filter(has_text='Chờ').locator('.code-link').first.click()
        cho(pg)
        m = modal(pg)
        danh_dau(m.get_by_role('button', name='Duyệt', exact=True))
        chup(pg, P + ten, m)
        m.get_by_role('button', name='Duyệt', exact=True).click()
        cho(pg)
        pg.keyboard.press('Escape')
        cho(pg, 300)
    chup(pg, P + '43_sau_duyet_tl')


def c_xem():
    pg = dang_nhap(KT)
    menu(pg, 'Tài sản', 'Danh mục tài sản cố định')
    chup(pg, P + '50_ds_tai_san')
    menu(pg, 'Kho & tồn')
    chup(pg, P + '51_kho_ton')
    menu(pg, 'Cấp phát', 'Tồn kho tiêu hao')
    chup(pg, P + '52_ton_tieu_hao')
    menu(pg, 'Điều chuyển')
    chup(pg, P + '53_dieu_chuyen')
    menu(pg, 'Kiểm kê')
    chup(pg, P + '54_kiem_ke')
    for i, t in enumerate(['Tổng hợp', 'Theo bộ phận', 'Đã thanh lý / tiêu hủy', 'Chênh lệch kiểm kê']):
        menu(pg, 'Báo cáo', t)
        chup(pg, P + f'6{i}_bao_cao')
    menu(pg, 'Tài sản', 'Tài sản của tôi')
    chup(pg, P + '70_tai_san_cua_toi')


if __name__ == '__main__':
    mo_trinh_duyet()
    try:
        for ten in sys.argv[1:]:
            globals()['c_' + ten]()
    finally:
        dong_trinh_duyet()
