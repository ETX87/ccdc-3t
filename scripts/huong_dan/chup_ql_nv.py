# Kich ban chup man hinh tai lieu huong dan vai tro QUAN LY + NHAN VIEN. Chay: python chup_ql_nv.py <canh1> <canh2> ...
# Truoc do: python nap_ql_nv.py (worker tat) roi bat worker ccdc-huong-dan; canh `chuan_bi` chay 1 lan (tao phieu qua API).
# Ban local khong ket noi Drive that: Playwright gia lap POST /api/dinh-kem (ghi thang dong dinh_kem vao state_hd) va
# thay anh thumbnail Drive bang anh mau (tao_anh_mau.py) - giao dien va luong thao tac giong het ban that.
import sys, uuid
from urllib.parse import urlparse, parse_qs
from hd import *
import hd
from db import db

HCNS, KT, QL, NV = 'hcns@test.local', 'kt@test.local', 'ql@test.local', 'nv@test.local'
VT = 'VT-DT-A4'
MAU = 'F:/claude/QLBH 3T/.wrangler/huong_dan/mau/'
ANH_DRIVE = {'mau-hoa-don': MAU + 'hoa_don.jpg', 'mau-hu-hong': MAU + 'anh_hu_hong.jpg'}


def api(pg, method, path, body=None):
    r = pg.request.fetch(BASE + '/api' + path, method=method, data=body)
    if not r.ok:
        raise RuntimeError(f'{method} {path} -> {r.status} {r.text()}')
    return r.json()


def kho_ql():
    return db.execute("SELECT id FROM kho WHERE nhan_vien_id='DT-QL'").fetchone()[0]


def gia_lap_drive(pg, email):
    def thumb(route):
        id_ = parse_qs(urlparse(route.request.url).query).get('id', [''])[0]
        route.fulfill(path=ANH_DRIVE.get(id_, MAU + 'anh_hu_hong.jpg'), content_type='image/jpeg')

    def tai_len(route):
        rq = route.request
        if rq.method != 'POST':
            return route.continue_()
        q = {k: v[0] for k, v in parse_qs(urlparse(rq.url).query).items()}
        mime = rq.headers.get('content-type', 'image/jpeg')
        drive = 'mau-hoa-don' if q['loai'] in ('Hoa don', 'Chung tu') else 'mau-hu-hong'
        id_ = str(uuid.uuid4())
        db.execute("INSERT INTO dinh_kem (id,doi_tuong,doi_tuong_id,loai,drive_file_id,ten_file,mime,kich_thuoc,nguoi_tai,created_at) "
                   "VALUES (?,?,?,?,?,?,?,?,?,datetime('now','+7 hours'))",
                   (id_, q['doi_tuong'], q['id'], q['loai'], drive, q.get('ten') or 'anh.jpg', mime, len(rq.post_data_buffer or b''), email))
        db.commit()
        route.fulfill(status=200, content_type='application/json', body='{"ok":true,"id":"%s"}' % id_)

    pg.route('https://drive.google.com/thumbnail**', thumb)
    pg.route('**/api/dinh-kem?**', tai_len)


def vao(email, w=1440, h=900, mobile=False) -> Page:
    if mobile:
        ctx = hd._browser.new_context(viewport={'width': w, 'height': h}, device_scale_factor=2.5, is_mobile=True, has_touch=True, locale='vi-VN')
        pg = ctx.new_page()
        pg.goto(BASE + '/')
        pg.request.get(BASE + '/api/auth/dev-login?email=' + email, max_redirects=0)
        pg.goto(BASE + '/')
        cho(pg)
    else:
        pg = dang_nhap(email, w, h)
    gia_lap_drive(pg, email)
    return pg


def mo_ma(pg, chua: str):
    pg.locator('main tr', has_text=chua).locator('.code-link').first.click()
    cho(pg)


# ------------------------------------------------------------------------------------------------
def c_chuan_bi():
    hc = vao(HCNS)
    kt = vao(KT)
    ts = {}
    for id_, ten, nhom, gia, seri in [
        ('TS3T-DT-0004', 'Laptop Lenovo ThinkPad E14 (đào tạo)', 2, 18500000, 'LNV-E14-90KX'),
        ('TS3T-DT-0005', 'Điện thoại Samsung Galaxy A15 (đào tạo)', 2, 4290000, 'SM-A155-3311'),
        ('TS3T-DT-0006', 'Máy khoan Bosch GSB 550 (đào tạo)', 2, 1250000, 'BSC-550-0721'),
    ]:
        r = api(hc, 'POST', '/ccdc', {'id': id_, 'ten_ccdc': ten, 'nhom_id': nhom, 'don_vi_tinh': 'Chiếc', 'so_seri': seri,
                                      'nguyen_gia': gia, 'ngay_mua': '2026-10-01', 'nha_cung_cap': 'Công ty TNHH ABC',
                                      'han_bao_hanh': '2027-10-01', 'tinh_trang': 'Tot'})
        ts[id_] = r['phieu_id']
        api(kt, 'POST', f"/phieu-xu-ly-ts/{r['phieu_id']}/ke-toan-duyet", {})
    # Hoa don dinh kem phieu nhap laptop (HCNS tai luc lap) - hien trong popup tai san cua nhan vien.
    db.execute("INSERT INTO dinh_kem (id,doi_tuong,doi_tuong_id,loai,drive_file_id,ten_file,mime,kich_thuoc,nguoi_tai,created_at) "
               "VALUES (?,?,?,?,?,?,?,?,?,datetime('now','+7 hours'))",
               (str(uuid.uuid4()), 'xu_ly', ts['TS3T-DT-0004'], 'Hoa don', 'mau-hoa-don', 'hoa-don-0001234.jpg', 'image/jpeg', 184000, HCNS))
    db.commit()
    gn = lambda ccdc, nv, ghi: api(hc, 'POST', '/phieu-giao-nhan', {'loai_phieu': 'Cap phat', 'tu_kho_id': 2, 'den_kho_id': None, 'nhan_vien_id': nv,
                                                                    'nhan_vien_nhan_moi_id': None, 'ghi_chu': ghi, 'items': [{'ccdc_id': ccdc}]})['id']
    gn('TS3T-DT-0004', 'DT-NV01', 'Cấp laptop làm việc cho kỹ thuật viên mới')
    p = gn('TS3T-DT-0005', 'DT-NV01', 'Điện thoại liên lạc với khách hàng')
    api(vao(NV), 'POST', f'/phieu-giao-nhan/{p}/xac-nhan', {})
    p = gn('TS3T-DT-0006', 'DT-QL', 'Máy khoan dùng chung của nhóm kỹ thuật')
    api(vao(QL), 'POST', f'/phieu-giao-nhan/{p}/xac-nhan', {})
    api(hc, 'POST', '/phieu-chuyen-kho', {'loai': 'Chuyen kho', 'tu_kho_id': 2, 'den_kho_id': kho_ql(), 'ghi_chu': 'Cấp giấy in cho nhóm kỹ thuật tháng 10',
                                          'items': [{'vt_id': VT, 'so_luong': 30, 'don_gia': None}]})
    print('da chuan bi du lieu QL/NV')


def c_them_ck():
    api(vao(HCNS), 'POST', '/phieu-chuyen-kho', {'loai': 'Chuyen kho', 'tu_kho_id': 2, 'den_kho_id': kho_ql(), 'ghi_chu': 'Cấp giấy in cho nhóm kỹ thuật tháng 10',
                                                 'items': [{'vt_id': VT, 'so_luong': 30, 'don_gia': None}]})


# ------------------------------------------------------------------------------------------------ QUAN LY
def c_ql_giao_dien():
    pg = vao(QL)
    danh_dau(pg.locator('aside'))
    chup(pg, 'ql_01_giao_dien')
    chup(pg, 'ql_02_tong_quan', full=True)
    menu(pg, 'Việc cần làm')
    chup(pg, 'ql_03_viec_can_lam')


def c_ql_nhan_hang():
    pg = vao(QL)
    menu(pg, 'Cấp phát', 'Phiếu cấp phát & chuyển kho')
    r = pg.locator('main tr', has_text='Đang chuyển').first
    danh_dau(r)
    chup(pg, 'ql_10_phieu_cho_nhan')
    r.locator('.code-link').first.click()
    cho(pg)
    m = modal(pg)
    danh_dau(m.get_by_role('button', name='Xác nhận đã nhận'), m.get_by_role('button', name='Từ chối nhận'))
    chup(pg, 'ql_11_popup_nhan', m)
    m.get_by_role('button', name='Xác nhận đã nhận').click()
    cho(pg)
    chup(pg, 'ql_12_da_nhan', modal(pg))
    pg.keyboard.press('Escape')
    menu(pg, 'Cấp phát', 'Tồn kho tiêu hao')
    chup(pg, 'ql_13_ton_kho')


def c_ql_cap_phat():
    pg = vao(QL)
    menu(pg, 'Cấp phát', 'Phiếu cấp phát & chuyển kho')
    b = pg.locator('main').get_by_role('button', name='Cấp phát NV', exact=True).first
    danh_dau(b)
    chup(pg, 'ql_20_nut_cap_phat')
    b.click()
    pg.wait_for_timeout(500)
    m = modal(pg)
    chon_search(o(m, 'Người nhận'), 'Lê Văn Nhân Viên', pg)
    chon_search(m.locator('.dong-hang').first, 'Giấy A4 Double A', pg)
    m.locator('input[type=number]').first.fill('5')
    o(m, 'Ghi chú').locator('textarea').fill('Giấy in cho công việc báo cáo hiện trường')
    chup(pg, 'ql_21_form_cap_phat', m)
    m.locator('.modal-actions .btn-primary').last.click()
    cho(pg)
    chup(pg, 'ql_22_sau_cap_phat', modal(pg))
    pg.keyboard.press('Escape')


def c_ql_tra_hang():
    pg = vao(QL)
    menu(pg, 'Cấp phát', 'Phiếu cấp phát & chuyển kho')
    pg.locator('main').get_by_role('button', name='Chuyển kho', exact=True).first.click()
    pg.wait_for_timeout(500)
    m = modal(pg)
    o(m, 'Kho đích').locator('select').select_option('2')
    chon_search(m.locator('.dong-hang').first, 'Giấy A4 Double A', pg)
    m.locator('input[type=number]').first.fill('2')
    o(m, 'Ghi chú').locator('textarea').fill('Trả lại giấy in dư sau khi kết thúc dự án')
    chup(pg, 'ql_23_form_tra_hang', m)
    m.locator('.modal-actions .btn-primary').last.click()
    cho(pg)
    chup(pg, 'ql_24_sau_tra_hang', modal(pg))


def c_ql_nhom():
    pg = vao(QL)
    menu(pg, 'Tài sản', 'Nhóm của tôi')
    chup(pg, 'ql_30_nhom', full=True)
    r = pg.locator('main tr', has_text='TS3T-DT-0006').first
    danh_dau(r.get_by_role('button', name='Điều chuyển'), r.get_by_role('button', name='Báo hỏng'))
    chup(pg, 'ql_31_tai_san_thanh_vien')
    r.get_by_role('button', name='Điều chuyển').click()
    pg.wait_for_timeout(400)
    m = modal(pg)
    m.locator('select').select_option(label='Lê Văn Nhân Viên (đào tạo)')
    m.locator('input[type=text]').fill('Bàn giao máy khoan cho kỹ thuật viên đi công trình')
    chup(pg, 'ql_32_dieu_chuyen_nhom', m)
    m.get_by_role('button', name='Lập phiếu điều chuyển').click()
    cho(pg)
    pg.locator('main tr', has_text='Lê Văn Nhân Viên').first.click()
    cho(pg, 500)
    chup(pg, 'ql_33_sau_dieu_chuyen')


def c_ql_khac():
    pg = vao(QL)
    menu(pg, 'Điều chuyển')
    chup(pg, 'ql_40_dieu_chuyen')
    menu(pg, 'Kho & tồn')
    chup(pg, 'ql_41_kho')
    menu(pg, 'Báo cáo', 'Theo nhân viên')
    chup(pg, 'ql_42_bao_cao_nv')
    menu(pg, 'Cảnh báo')
    chup(pg, 'ql_43_canh_bao')


# ------------------------------------------------------------------------------------------------ NHAN VIEN
def c_nv_giao_dien():
    pg = vao(NV)
    danh_dau(pg.locator('aside'))
    chup(pg, 'nv_01_viec_can_lam')
    menu(pg, 'Tài sản', 'Tài sản của tôi')
    chup(pg, 'nv_02_tai_san_cua_toi', full=True)


def c_nv_xac_nhan():
    pg = vao(NV)
    menu(pg, 'Tài sản', 'Tài sản của tôi')
    mo_ma(pg, 'Laptop Lenovo')
    m = modal(pg)
    danh_dau(m.get_by_role('button', name='Xác nhận đã nhận'))
    chup(pg, 'nv_10_popup_xac_nhan', m)
    m.get_by_role('button', name='Xác nhận đã nhận').click()
    cho(pg)
    pg.keyboard.press('Escape')
    cho(pg, 400)
    r = pg.locator('main tr', has_text='Tiêu hao').first
    danh_dau(r.get_by_role('button', name='Đã nhận'))
    chup(pg, 'nv_11_xac_nhan_nhanh')
    r.get_by_role('button', name='Đã nhận').click()
    cho(pg)
    chup(pg, 'nv_12_sau_xac_nhan', full=True)


def c_nv_tai_san():
    pg = vao(NV)
    menu(pg, 'Tài sản', 'Tài sản của tôi')
    pg.locator('main tr', has_text='TS3T-DT-0004').locator('.code-link').first.click()
    cho(pg, 1200)
    chup(pg, 'nv_20_popup_tai_san', modal(pg))
    dk = modal(pg).locator('.dinh-kem')
    dk.scroll_into_view_if_needed()
    danh_dau(dk)
    chup(pg, 'nv_21_chung_tu_tai_san', modal(pg))


def c_nv_bao_hong():
    pg = vao(NV)
    menu(pg, 'Tài sản', 'Tài sản của tôi')
    pg.locator('main tr', has_text='TS3T-DT-0004').locator('.code-link').first.click()
    cho(pg, 800)
    m = modal(pg)
    m.get_by_role('button', name='Báo hỏng', exact=True).click()
    pg.wait_for_timeout(300)
    m.locator('.action-panel input[type=text]').fill('Màn hình bị nứt sau khi rơi, không hiển thị được')
    danh_dau(m.get_by_role('button', name='Gửi báo hỏng'))
    chup(pg, 'nv_30_form_bao_hong', m)
    m.get_by_role('button', name='Gửi báo hỏng').click()
    cho(pg)
    chup(pg, 'nv_31_da_bao_hong', m)
    pg.keyboard.press('Escape')
    menu(pg, 'Báo hỏng')
    chup(pg, 'nv_32_man_bao_hong')
    mo_ma(pg, 'BH-')
    m = modal(pg)
    dk = m.locator('.dinh-kem')
    dk.locator('select').select_option('Bang chung')
    with pg.expect_file_chooser() as fc:
        dk.get_by_role('button', name='Chọn tệp').click()
    fc.value.set_files(MAU + 'anh_hu_hong.jpg')
    cho(pg, 1500)
    dk.scroll_into_view_if_needed()
    danh_dau(dk)
    chup(pg, 'nv_33_dinh_kem_bao_hong', m)


def c_nv_mobile():
    pg = vao(NV, 390, 844, mobile=True)
    chup(pg, 'nv_40_mobile_viec')
    pg.locator('.mobile-menu-btn, .menu-toggle, button[aria-label*="enu"]').first.click()
    pg.wait_for_timeout(500)
    chup(pg, 'nv_41_mobile_menu')
    menu(pg, 'Tài sản', 'Tài sản của tôi')
    chup(pg, 'nv_42_mobile_tai_san')
    pg.locator('main .code-link', has_text='TS3T-DT-0006').first.click()
    cho(pg, 1000)
    chup(pg, 'nv_43_mobile_popup')


if __name__ == '__main__':
    mo_trinh_duyet()
    try:
        for ten in sys.argv[1:]:
            globals()['c_' + ten]()
    finally:
        dong_trinh_duyet()
