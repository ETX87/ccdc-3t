# Kich ban chup man hinh tai lieu huong dan vai tro HCNS. Chay: python chup_hcns.py <canh1> <canh2> ...
import sys
from hd import *

HCNS = 'hcns@test.local'
KT = 'kt@test.local'
NV = 'nv@test.local'
TK_BAC = 'phungdoanh1983@gmail.com'  # thu kho Kho van Mien Bac
TS_MOI = 'TS3T-DT-0001'


def c_dang_nhap():
    ctx = hd_ctx()
    pg = ctx.new_page()
    pg.goto(BASE + '/')
    cho(pg)
    chup(pg, '01_dang_nhap')


def hd_ctx():
    import hd
    return hd._browser.new_context(viewport={'width': 1440, 'height': 900}, device_scale_factor=1.5, locale='vi-VN')


def c_giao_dien():
    pg = dang_nhap(HCNS)
    danh_dau(pg.locator('aside'))
    chup(pg, '02_giao_dien_tong')
    # Tim kiem toan cuc
    s = pg.get_by_placeholder('Tìm kiếm tài sản, phiếu, nhân viên...')
    s.click()
    s.fill('máy tính')
    pg.wait_for_timeout(1200)
    chup(pg, '03_tim_kiem')
    pg.keyboard.press('Escape')
    # Chuong thong bao
    pg.locator('.notification-bell-btn').first.click()
    pg.wait_for_timeout(800)
    chup(pg, '04_chuong')


def c_tong_quan():
    pg = dang_nhap(HCNS)
    chup(pg, '05_tong_quan', full=True)
    menu(pg, 'Việc cần làm')
    chup(pg, '06_viec_can_lam')
    menu(pg, 'Cảnh báo')
    chup(pg, '07_canh_bao', full=True)


def c_tai_san():
    pg = dang_nhap(HCNS)
    menu(pg, 'Tài sản', 'Danh mục tài sản cố định')
    danh_dau(pg.get_by_role('button', name='Nhập tài sản mới'), pg.get_by_role('button', name='Quản lý nhóm'), pg.get_by_role('button', name='In tem QR'))
    chup(pg, '10_ds_tai_san')
    pg.get_by_role('button', name='Quản lý nhóm').click()
    cho(pg, 400)
    chup(pg, '11_quan_ly_nhom', modal(pg))
    pg.keyboard.press('Escape')
    # Chi tiet 1 tai san (bam ma)
    pg.locator('main .code-link').first.click()
    cho(pg)
    chup(pg, '12_chi_tiet_tai_san', modal(pg))
    pg.keyboard.press('Escape')


def c_nhap_ts():
    pg = dang_nhap(HCNS)
    menu(pg, 'Tài sản', 'Danh mục tài sản cố định')
    pg.get_by_role('button', name='Nhập tài sản mới').click()
    cho(pg, 400)
    m = modal(pg)
    o(m, 'Mã tài sản').locator('input').fill(TS_MOI)
    o(m, 'Tên tài sản').locator('input').fill('Laptop Dell Latitude 3540 (đào tạo)')
    o(m, 'Nhóm tài sản').locator('select').select_option(label='Laptop')
    o(m, 'Đơn vị tính').locator('input').fill('Chiếc')
    o(m, 'Số seri').locator('input').fill('DL3540-8H2K9')
    o(m, 'Nguyên giá').locator('input').fill('15900000')
    o(m, 'Ngày mua').locator('input').fill('2026-10-01')
    o(m, 'Nhà cung cấp').locator('input').fill('Công ty TNHH Phong Vũ')
    o(m, 'Hạn bảo hành').locator('input').fill('2028-10-01')
    danh_dau(m.get_by_role('button', name='Tạo & gửi Kế toán duyệt'))
    chup(pg, '13_form_nhap_ts', m)
    m.get_by_role('button', name='Tạo & gửi Kế toán duyệt').click()
    cho(pg)
    chup(pg, '14_sau_nhap_ts')


def mo_ma(pg, chua: str):
    """Bam ma phieu/ma tai san (code-link) tren dong bang co chua `chua`."""
    pg.locator('tr', has_text=chua).locator('.code-link').first.click()
    cho(pg)


def c_kt_duyet_nt():
    pg = dang_nhap(KT)
    menu(pg, 'Việc cần làm')
    danh_dau(pg.locator('tr', has_text='NT-').first)
    chup(pg, '15_kt_viec_can_lam')
    mo_ma(pg, 'NT-')
    danh_dau(modal(pg).get_by_role('button', name='Duyệt', exact=True))
    chup(pg, '16_kt_popup_duyet', modal(pg))
    modal(pg).get_by_role('button', name='Duyệt', exact=True).click()
    cho(pg)
    chup(pg, '17_kt_da_duyet', modal(pg))


def c_cap_phat_ts():
    pg = dang_nhap(HCNS)
    menu(pg, 'Điều chuyển')
    danh_dau(pg.get_by_role('button', name='Lập phiếu giao nhận'))
    chup(pg, '20_dieu_chuyen')
    pg.get_by_role('button', name='Lập phiếu giao nhận').click()
    cho(pg, 400)
    m = modal(pg)
    o(m, 'Loại phiếu').locator('select').select_option('Cap phat')
    chon_search(o(m, 'Nhân viên nhận'), 'DT-NV01', pg)
    m.get_by_placeholder('Lọc theo mã, tên tài sản...').fill(TS_MOI)
    pg.wait_for_timeout(400)
    m.locator('label.check-label', has_text=TS_MOI).locator('input').check()
    m.locator('textarea').fill('Cấp laptop cho nhân viên mới')
    danh_dau(m.get_by_role('button', name='Tạo phiếu (1 TS)'))
    chup(pg, '21_form_cap_phat_ts', m)
    m.get_by_role('button', name='Tạo phiếu (1 TS)').click()
    cho(pg)
    chup(pg, '22_sau_cap_phat_ts')


def c_nv_xac_nhan_ts():
    pg = dang_nhap(NV)
    menu(pg, 'Tài sản', 'Tài sản của tôi')
    chup(pg, '23_nv_tai_san_cua_toi')
    b = pg.locator('main button.btn-primary', has_text='Đã nhận').first
    danh_dau(b)
    chup(pg, '24_nv_bam_xac_nhan')
    b.click()
    cho(pg)
    chup(pg, '25_nv_da_xac_nhan')


VT = 'VT-DT-A4'
VT_TEN = 'Giấy A4 Double A 70gsm (đào tạo)'


def c_vat_tu():
    pg = dang_nhap(HCNS)
    menu(pg, 'Cấp phát', 'Danh mục vật tư')
    danh_dau(pg.get_by_role('button', name='Thêm vật tư'))
    chup(pg, '30_danh_muc_vat_tu')
    pg.get_by_role('button', name='Thêm vật tư').click()
    cho(pg, 400)
    m = modal(pg)
    o(m, 'Mã vật tư').locator('input').fill(VT)
    o(m, 'Tên vật tư').locator('input').fill(VT_TEN)
    sel = o(m, 'Nhóm').locator('select')
    opts = sel.locator('option').all_inner_texts()
    giay = [x for x in opts if 'giấy' in x.lower() or 'văn phòng' in x.lower()]
    if giay: sel.select_option(label=giay[0])
    o(m, 'Đơn vị tính').locator('input').fill('Ram')
    o(m, 'Giá tham khảo').locator('input').fill('68000')
    danh_dau(m.get_by_role('button', name='Lưu'))
    chup(pg, '31_form_vat_tu', m)
    m.get_by_role('button', name='Lưu').click()
    cho(pg)


def form_ck(pg, nut):
    menu(pg, 'Cấp phát', 'Phiếu cấp phát & chuyển kho')
    pg.locator('main').get_by_role('button', name=nut, exact=True).click()
    cho(pg, 500)
    return modal(pg)


def dong_hang(m, pg, sl, gia=None):
    chon_search(m.locator('.dong-hang').first, VT_TEN, pg)
    m.locator('.dong-hang').first.get_by_placeholder('SL').fill(str(sl))
    if gia is not None:
        m.locator('.dong-hang').first.get_by_placeholder('Đơn giá').fill(str(gia))


def c_nhap_mua():
    pg = dang_nhap(HCNS)
    menu(pg, 'Cấp phát', 'Phiếu cấp phát & chuyển kho')
    danh_dau(pg.locator('main').get_by_role('button', name='Nhập mua', exact=True), pg.locator('main').get_by_role('button', name='Chuyển kho', exact=True), pg.locator('main').get_by_role('button', name='Cấp phát NV', exact=True))
    chup(pg, '32_phieu_cap_phat')
    m = form_ck(pg, 'Nhập mua')
    o(m, 'Nhà cung cấp').locator('input').fill('Văn phòng phẩm Hồng Hà')
    dong_hang(m, pg, 100, 68000)
    m.locator('textarea').fill('Mua giấy in quý IV/2026')
    danh_dau(m.get_by_role('button', name='Lập phiếu'))
    chup(pg, '33_form_nhap_mua', m)
    m.get_by_role('button', name='Lập phiếu').click()
    cho(pg)
    chup(pg, '34_sau_nhap_mua')


def c_kt_duyet_nm():
    pg = dang_nhap(KT)
    menu(pg, 'Việc cần làm')
    mo_ma(pg, 'NM-')
    danh_dau(modal(pg).get_by_role('button', name='Duyệt', exact=True))
    chup(pg, '35_kt_duyet_nhap_mua', modal(pg))
    modal(pg).get_by_role('button', name='Duyệt', exact=True).click()
    cho(pg)


def c_chuyen_kho():
    pg = dang_nhap(HCNS)
    m = form_ck(pg, 'Chuyển kho')
    o(m, 'Kho đích').locator('select').select_option(label='Kho vận Miền Bắc (Kho miền)')
    dong_hang(m, pg, 40)
    m.locator('textarea').fill('Bổ sung giấy cho kho miền Bắc')
    danh_dau(m.get_by_role('button', name='Lập phiếu'))
    chup(pg, '36_form_chuyen_kho', m)
    m.get_by_role('button', name='Lập phiếu').click()
    cho(pg)
    chup(pg, '37_sau_chuyen_kho')


def c_tk_nhan():
    pg = dang_nhap(TK_BAC)
    menu(pg, 'Việc cần làm')
    chup(pg, '38_tk_viec_can_lam')
    mo_ma(pg, 'CK-')
    danh_dau(modal(pg).get_by_role('button', name='Xác nhận đã nhận', exact=True))
    chup(pg, '39_tk_xac_nhan_nhan', modal(pg))
    modal(pg).get_by_role('button', name='Xác nhận đã nhận', exact=True).click()
    cho(pg)


def c_cap_phat_th():
    pg = dang_nhap(HCNS)
    m = form_ck(pg, 'Cấp phát NV')
    chon_search(o(m, 'Người nhận'), 'DT-NV01', pg)
    dong_hang(m, pg, 2)
    danh_dau(m.get_by_role('button', name='Lập phiếu'))
    chup(pg, '40_form_cap_phat_nv', m)
    m.get_by_role('button', name='Lập phiếu').click()
    cho(pg)


def c_ton_kho():
    pg = dang_nhap(HCNS)
    menu(pg, 'Cấp phát', 'Tồn kho tiêu hao')
    chup(pg, '41_ton_kho_tieu_hao')


def c_kho():
    pg = dang_nhap(HCNS)
    menu(pg, 'Kho & tồn')
    chup(pg, '45_kho_ton')
    pg.locator('main').get_by_text('Cấu hình kho & thủ kho', exact=True).click()
    cho(pg)
    danh_dau(pg.get_by_role('button', name='Thêm kho mới'), pg.get_by_placeholder('Email thủ kho…').first)
    chup(pg, '46_kho_thu_kho')
    pg.get_by_role('button', name='Thêm kho mới').click()
    cho(pg, 300)
    modal(pg).get_by_placeholder('vd: Kho vận Miền Trung').fill('Kho vận Miền Trung')
    chup(pg, '47_them_kho', modal(pg))



def de_xuat(pg, nut, ly_do, ten_anh):
    pg.locator('main').get_by_role('button', name=nut).first.click()
    cho(pg, 800)
    m = modal(pg)
    m.get_by_placeholder('Tìm mã, tên, người giữ, kho...').fill(TS_MOI)
    pg.wait_for_timeout(400)
    m.locator('label.check-label', has_text=TS_MOI).locator('input').check()
    m.locator('textarea').fill(ly_do)
    b = m.get_by_role('button', name='Gửi Kế toán duyệt (1 TS)')
    danh_dau(b)
    chup(pg, ten_anh, m)
    b.click()
    cho(pg)


def kt_duyet(tien_to, ten_anh):
    pg = dang_nhap(KT)
    menu(pg, 'Việc cần làm')
    mo_ma(pg, tien_to)
    danh_dau(modal(pg).get_by_role('button', name='Duyệt', exact=True))
    chup(pg, ten_anh, modal(pg))
    modal(pg).get_by_role('button', name='Duyệt', exact=True).click()
    cho(pg)


def c_bao_hong():
    pg = dang_nhap(HCNS)
    menu(pg, 'Báo hỏng')
    chup(pg, '50_bao_hong')
    de_xuat(pg, 'Báo hỏng', 'Màn hình laptop bị sọc ngang, không hiển thị được', '51_form_bao_hong')
    pg.keyboard.press('Escape')
    chup(pg, '52_sau_bao_hong')
    kt_duyet('BH-', '53_kt_duyet_bao_hong')
    pg = dang_nhap(HCNS)
    menu(pg, 'Báo hỏng')
    r = pg.locator('tr', has_text=TS_MOI).first
    r.scroll_into_view_if_needed()
    danh_dau(r.get_by_role('button', name='Sửa xong'), r.get_by_role('button', name='Thanh lý / tiêu hủy…'))
    chup(pg, '54_ts_hong_cho_xu_ly')
    r.get_by_role('button', name='Sửa xong').click()
    cho(pg, 400)
    chup(pg, '55_xac_nhan_sua_xong', modal(pg))
    pg.keyboard.press('Escape')


def c_thanh_ly():
    pg = dang_nhap(HCNS)
    menu(pg, 'Thanh lý & tiêu hủy')
    danh_dau(pg.locator('main').get_by_role('button', name='Đề xuất thanh lý'), pg.locator('main').get_by_role('button', name='Đề xuất tiêu hủy'))
    chup(pg, '60_thanh_ly')
    de_xuat(pg, 'Đề xuất thanh lý', 'Laptop hỏng màn hình, chi phí sửa cao hơn giá trị còn lại', '61_form_thanh_ly')
    kt_duyet('TL-', '62_kt_duyet_thanh_ly')
    pg = dang_nhap(HCNS)
    menu(pg, 'Thanh lý & tiêu hủy')
    mo_ma(pg, 'TL-')
    m = modal(pg)
    m.get_by_role('button', name='Hoàn tất thanh lý').click()
    pg.wait_for_timeout(300)
    o(m, 'Giá trị thu hồi').locator('input').fill('2500000')
    o(m, 'Ghi chú').locator('input').fill('Bán thanh lý cho cửa hàng máy cũ, đã thu tiền')
    danh_dau(m.get_by_role('button', name='Xác nhận: Hoàn tất thanh lý'))
    chup(pg, '63_hoan_tat_thanh_ly', m)
    m.get_by_role('button', name='Xác nhận: Hoàn tất thanh lý').click()
    cho(pg)
    chup(pg, '64_da_thanh_ly', modal(pg))



def ghi_kk(pg, ma, tinh_trang, ghi_chu, anh=None):
    card = pg.locator('.content-card', has_text='Ghi nhận kiểm kê')
    chon_search(o(card, 'Tài sản'), ma, pg)
    o(card, 'Tình trạng thực tế').locator('select').select_option(label=tinh_trang)
    o(card, 'Ghi chú').locator('input').fill(ghi_chu)
    if anh:
        danh_dau(card.get_by_role('button', name='Ghi nhận'), card.get_by_role('button', name='Quét tem QR'))
        chup(pg, anh, card)
    card.get_by_role('button', name='Ghi nhận').click()
    cho(pg)


def c_kiem_ke():
    pg = dang_nhap(HCNS)
    menu(pg, 'Kiểm kê')
    danh_dau(pg.get_by_role('button', name='Tạo đợt kiểm kê'))
    chup(pg, '70_kiem_ke')
    pg.get_by_role('button', name='Tạo đợt kiểm kê').click()
    cho(pg, 400)
    m = modal(pg)
    o(m, 'Tên đợt').locator('input').fill('Kiểm kê quý IV/2026 (đào tạo)')
    chup(pg, '71_tao_dot', m)
    m.get_by_role('button', name='Tạo đợt').last.click()
    cho(pg)
    ghi_kk(pg, 'TS3T-000002-002', 'Đúng vị trí', 'Bàn họp phòng lớn', '72_ghi_nhan')
    ghi_kk(pg, 'TS3T-000003-001', 'Hỏng', 'Gãy chân bàn')
    ghi_kk(pg, 'TS3T-000003-002', 'Thiếu', 'Không tìm thấy tại kho')
    pg.mouse.wheel(0, 900)
    cho(pg, 300)
    chup(pg, '73_dot_dang_kiem', full=True)
    pg.locator('main').get_by_role('button', name='Kết thúc đợt').first.click() if pg.locator('main').get_by_role('button', name='Kết thúc đợt').count() else None
    cho(pg, 400)
    if pg.locator('.modal-box').count():
        chup(pg, '74_hoan_tat_dot', modal(pg))
        pg.keyboard.press('Escape')


def c_bao_cao():
    pg = dang_nhap(HCNS)
    for i, t in enumerate(['Tổng hợp', 'Theo nhân viên', 'Theo bộ phận', 'Sắp hết bảo hành', 'Chênh lệch kiểm kê', 'Đã thanh lý / tiêu hủy']):
        menu(pg, 'Báo cáo', t)
        chup(pg, f'8{i}_bao_cao')


def c_nhan_vien():
    pg = dang_nhap(HCNS)
    menu(pg, 'Cấu hình', 'Nhân viên & sơ đồ quản lý')
    danh_dau(pg.get_by_role('button', name='Đồng bộ ETX'), pg.get_by_role('button', name='Thêm nhân viên'))
    chup(pg, '90_nhan_vien')
    pg.get_by_placeholder('Tìm mã, tên, bộ phận, email...').fill('DT-NV01')
    cho(pg, 900)
    r = pg.locator('tr', has_text='DT-NV01').first
    danh_dau(r.get_by_role('button', name='Sửa'), r.get_by_role('button', name='Đổi mã / gộp'))
    chup(pg, '91_tim_nhan_vien')
    r.get_by_role('button', name='Sửa').click()
    cho(pg, 400)
    chup(pg, '92_sua_nhan_vien', modal(pg))
    pg.keyboard.press('Escape')
    cho(pg, 300)
    r.get_by_role('button', name='Đổi mã / gộp').click()
    cho(pg, 600)
    chup(pg, '93_doi_ma_gop', modal(pg))
    pg.keyboard.press('Escape')


def c_nv_nhan_th():
    pg = dang_nhap(NV)
    menu(pg, 'Tài sản', 'Tài sản của tôi')
    chup(pg, '26_nv_nhan_tieu_hao')



def c_kk_hoan_tat():
    pg = dang_nhap(HCNS)
    menu(pg, 'Kiểm kê')
    pg.locator('main .code-link', has_text='KK-').first.click()
    cho(pg)
    pg.get_by_role('button', name='Hoàn tất đợt').click()
    cho(pg, 400)
    chup(pg, '74_hoan_tat_dot', modal(pg))



def c_form_gn():
    pg = dang_nhap(HCNS)
    menu(pg, 'Điều chuyển')
    for loai, ten, nv in [('Thu hoi', '27_form_thu_hoi', 'T090000021'), ('Dieu chuyen', '28_form_dieu_chuyen', 'T090000021'), ('Chuyen kho', '29_form_chuyen_kho_ts', None)]:
        pg.get_by_role('button', name='Lập phiếu giao nhận').click()
        cho(pg, 500)
        m = modal(pg)
        o(m, 'Loại phiếu').locator('select').select_option(loai)
        pg.wait_for_timeout(300)
        if nv:
            chon_search(o(m, 'Nhân viên đang giữ'), nv, pg)
            cho(pg, 600)
        if loai == 'Dieu chuyen':
            chon_search(o(m, 'Nhân viên nhận mới'), 'DT-NV01', pg)
        if nv:
            m.locator('label.check-label input').nth(1).check()
        if loai == 'Thu hoi':
            o(m, 'Kho nhận').locator('select').select_option(label='Kho tổng HCNS (Kho HCNS)')
        if loai == 'Chuyen kho':
            o(m, 'Kho nhận').locator('select').select_option(label='Kho vận Miền Bắc (Kho miền)')
        chup(pg, ten, m)
        pg.keyboard.press('Escape')
        cho(pg, 300)


def c_dien_thoai():
    pg = dang_nhap(HCNS, 390, 844)
    chup(pg, '08_dien_thoai')
    pg.locator('.topbar-menu-btn').click()
    pg.wait_for_timeout(500)
    chup(pg, '09_dien_thoai_menu')



def c_in_tem():
    pg = dang_nhap(HCNS)
    menu(pg, 'Tài sản', 'Danh mục tài sản cố định')
    hop = pg.locator('main tbody input[type=checkbox]')
    for i in range(3):
        hop.nth(i).check()
    danh_dau(pg.get_by_role('button', name='In tem QR'))
    chup(pg, '18_chon_in_tem')
    with pg.expect_popup() as pop:
        pg.get_by_role('button', name='In tem QR').click()
    w = pop.value
    w.wait_for_load_state()
    w.wait_for_timeout(1500)
    w.set_viewport_size({'width': 900, 'height': 300})
    w.screenshot(path=ANH + '19_tem_qr.png')
    print('chup 19_tem_qr')


if __name__ == '__main__':
    mo_trinh_duyet()
    try:
        for ten in sys.argv[1:]:
            globals()['c_' + ten]()
    finally:
        dong_trinh_duyet()
