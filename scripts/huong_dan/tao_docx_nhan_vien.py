# Tao tai lieu "Huong dan su dung CCDC 3T - vai tro NHAN VIEN" (DOCX). Anh chup: xem tao_docx_quan_ly.py.
#   python tao_docx_nhan_vien.py ; powershell -File cap_nhat_word.ps1 -Docx <duong dan docx>
from docx_lib import TaiLieu

ANH = 'F:/claude/QLBH 3T/.wrangler/huong_dan/anh/'
GOC = 'F:/claude/QLBH 3T/CCDC 3T/'
URL = 'https://ccdc.dichvu3t.workers.dev'

t = TaiLieu(ANH)
t.bia(
    GOC + 'frontend/public/icon-512.png',
    'HƯỚNG DẪN SỬ DỤNG\nHỆ THỐNG QUẢN LÝ CÔNG CỤ DỤNG CỤ',
    'Tài liệu đào tạo dành cho Nhân viên',
    [f'Địa chỉ truy cập: **{URL}**', 'Phiên bản 1.0 – Tháng 10/2026', 'Công ty 3T – Lưu hành nội bộ'],
)
t.chan_trang('Hướng dẫn sử dụng CCDC 3T – Nhân viên')
t.muc_luc()

# =====================================================================================================
t.h1('1. Giới thiệu')
t.h2('1.1. Mục đích tài liệu')
t.p('Tài liệu hướng dẫn **mọi nhân viên** công ty 3T dùng hệ thống **3T Asset Management** để: xác nhận đã nhận tài sản, vật tư được cấp; '
    'xem tài sản mình đang giữ; báo hỏng tài sản kèm ảnh bằng chứng. Hệ thống dùng tốt trên **điện thoại** – nhân viên không cần máy tính.')
t.p('Hình minh họa được chụp trực tiếp từ hệ thống. Các mục có chữ *“(đào tạo)”* (nhân viên *Lê Văn Nhân Viên (đào tạo)*, quản lý '
    '*Phạm Văn Quản Lý (đào tạo)*, tài sản *TS3T-DT-…*) là dữ liệu mẫu.')
t.h2('1.2. Trách nhiệm của nhân viên')
t.gach('**Xác nhận đã nhận** ngay khi cầm tài sản / vật tư được giao – xác nhận là bằng chứng bạn đã nhận đủ, đúng hàng.',
       '**Giữ gìn** tài sản được giao; tài sản gắn tên bạn cho tới khi được thu hồi hoặc điều chuyển cho người khác.',
       '**Báo hỏng** ngay khi tài sản hư hỏng, kèm ảnh chụp tình trạng.',
       'Khi nghỉ việc / chuyển bộ phận: bàn giao lại tài sản cho HCNS hoặc Quản lý **trước** ngày nghỉ.')
t.bang(['Loại', 'Ví dụ', 'Bạn cần làm'], [
    ['**Tài sản cố định** (mã TS3T-…)', 'Laptop, điện thoại, máy khoan, máy đo…', 'Xác nhận nhận, giữ gìn, báo hỏng, trả lại khi được thu hồi'],
    ['**Vật tư tiêu hao**', 'Giấy in, băng keo, dây cáp, linh kiện dùng hết…', 'Xác nhận đã nhận đủ số lượng'],
], rong=[4.5, 5.5, 6.5])

# =====================================================================================================
t.h1('2. Đăng nhập')
t.buoc(f'Mở trình duyệt (Chrome / Safari) trên điện thoại hoặc máy tính, vào **{URL}**.',
       'Bấm **Đăng nhập bằng Google**, chọn **Gmail cá nhân bạn đã khai báo trên ETX nhân sự**.',
       'Tài khoản được hệ thống **tự cấp** từ hồ sơ ETX – không cần đăng ký. Nếu báo *chưa có quyền* / *chờ duyệt*: kiểm tra đúng Gmail đã khai trên ETX, hoặc liên hệ HCNS.')
t.anh('01_dang_nhap', 'Màn hình đăng nhập', cat=(700, 370, 1460, 980), rong=9)
t.hop('Cài ứng dụng lên điện thoại', ['Bấm **Cài đặt ứng dụng** ở cuối menu (Android – Chrome) để thêm biểu tượng **3T Asset** ra màn hình chính.',
                                     'iPhone: mở bằng Safari → nút **Chia sẻ** → **Thêm vào Màn hình chính**.',
                                     'Lần sau chỉ cần bấm biểu tượng, không phải gõ địa chỉ.'], 'meo')

# =====================================================================================================
t.h1('3. Giao diện')
t.h2('3.1. Trên máy tính')
t.anh('nv_01_viec_can_lam', 'Màn hình Việc cần làm của nhân viên – menu bên trái (khung đỏ)')
t.bang(['Mục menu', 'Dùng để'], [
    ['**Việc cần làm**', 'Mọi phiếu đang chờ bạn xác nhận. Số đỏ trên menu = số việc đang chờ. Bấm **Xác nhận** ngay trên dòng.'],
    ['**Tài sản → Tài sản của tôi**', 'Tài sản đang giữ, vật tư đã nhận, lịch sử giao nhận; báo hỏng.'],
    ['**Báo hỏng**', 'Báo hỏng tài sản và theo dõi phiếu báo hỏng của bạn.'],
    ['Cài đặt ứng dụng', 'Thêm biểu tượng ra màn hình chính điện thoại / máy tính.'],
], rong=[4.8, 11.7])
t.p('Phía trên: ô **tìm kiếm**, nút **Quét QR** (mở tài sản bằng cách quét tem QR dán trên tài sản), **chuông** thông báo việc mới, tên và vai trò của bạn.')
t.h2('3.2. Trên điện thoại')
t.p('Trên điện thoại, menu chính nằm ở **thanh dưới cùng**: *Việc cần làm*, *Tài sản*, *Quét QR*, *Báo hỏng*, *Menu*. Bấm **☰** (góc trên trái) hoặc **Menu** để mở menu đầy đủ.')
t.anh_doi('nv_40_mobile_viec', 'nv_41_mobile_menu', 'Việc cần làm trên điện thoại', 'Menu mở rộng', rong=5.6)

# =====================================================================================================
t.h1('4. Xác nhận đã nhận tài sản, vật tư')
t.p('Mỗi khi HCNS, thủ kho hoặc Quản lý giao tài sản / vật tư cho bạn, hệ thống tạo phiếu và báo trong **Việc cần làm**, **chuông** và '
    'mục **Cần xác nhận đã nhận** ở *Tài sản của tôi*.')
t.hop('Quan trọng:', ['Chỉ bấm xác nhận **sau khi đã cầm hàng thực tế** và kiểm tra đúng tên, mã tài sản, số lượng.',
                      'Hàng sai / thiếu / hỏng: **không xác nhận**, báo ngay cho người giao (tên người giao ở cột *Đơn vị / Người tạo*).',
                      'Chỉ chính bạn xác nhận được phiếu giao cho bạn – không ai xác nhận hộ.'], 'luu_y')
t.h2('4.1. Xem và xác nhận trong chi tiết phiếu')
t.buoc('Vào **Tài sản → Tài sản của tôi**. Khung **Cần xác nhận đã nhận** liệt kê các phiếu đang chờ bạn.')
t.anh('nv_02_tai_san_cua_toi', 'Tài sản của tôi – thẻ “Chờ tôi xác nhận đã nhận” và danh sách phiếu cần xác nhận')
t.buoc('Bấm **mã phiếu** (vd *GN-2610-0002*) để xem: ai giao, giao từ đâu, tài sản / vật tư nào, ghi chú.',
       'Đối chiếu với hàng thực tế, bấm **Xác nhận đã nhận**.')
t.anh('nv_10_popup_xac_nhan', 'Chi tiết phiếu cấp phát laptop – nút Xác nhận đã nhận')
t.h2('4.2. Xác nhận nhanh trên danh sách')
t.p('Khi đã kiểm tra hàng, có thể bấm **Đã nhận** (ở *Tài sản của tôi*) hoặc **Xác nhận** (ở *Việc cần làm*) ngay trên dòng phiếu.')
t.anh('nv_11_xac_nhan_nhanh', 'Nút Đã nhận ngay trên dòng phiếu vật tư tiêu hao')
t.anh('nv_12_sau_xac_nhan', 'Sau khi xác nhận – phiếu rời khỏi danh sách chờ, tài sản / vật tư hiện ở các tab bên dưới')
t.bang(['Tab ở Tài sản của tôi', 'Nội dung'], [
    ['Tài sản cố định', 'Tài sản bạn đang giữ, nguyên giá, trạng thái; nút *Báo hỏng*.'],
    ['Tiêu hao đã nhận', 'Các phiếu vật tư bạn đã nhận, giá trị, đã / chưa xác nhận.'],
    ['Lịch sử giao nhận', 'Toàn bộ phiếu giao, thu hồi, điều chuyển tài sản liên quan đến bạn.'],
], rong=[4.5, 12])

# =====================================================================================================
t.h1('5. Xem thông tin tài sản')
t.p('Bấm **mã tài sản** (vd *TS3T-DT-0004*) hoặc **Quét QR** tem dán trên tài sản để mở thông tin chi tiết: tên, nhóm, số seri, nguyên giá, '
    'ngày mua, nhà cung cấp, hạn bảo hành, người đang giữ, **hóa đơn / chứng từ / ảnh** và **lịch sử** giao nhận.')
t.anh('nv_20_popup_tai_san', 'Chi tiết tài sản đang giữ')
t.anh('nv_21_chung_tu_tai_san', 'Hóa đơn mua tài sản (đính kèm từ phiếu nhập NT-…) – bấm ảnh để xem bản đầy đủ')
t.p('Hóa đơn, chứng từ đính kèm ở các phiếu liên quan (phiếu nhập, giao nhận, báo hỏng…) đều hiện ở đây kèm mã phiếu nguồn. '
    'Dùng khi cần tra **hạn bảo hành** hoặc mang hóa đơn đi bảo hành.')
t.anh_doi('nv_42_mobile_tai_san', 'nv_43_mobile_popup', 'Tài sản của tôi trên điện thoại', 'Chi tiết tài sản trên điện thoại', rong=5.6)

# =====================================================================================================
t.h1('6. Báo hỏng tài sản')
t.p('Khi tài sản bạn giữ bị hư hỏng (rơi vỡ, không lên nguồn, mất chức năng…), hãy báo hỏng **ngay** trên hệ thống thay vì chỉ báo miệng.')
t.h2('6.1. Gửi báo hỏng')
t.buoc('Ở **Tài sản của tôi**, bấm **Báo hỏng** trên dòng tài sản (hoặc bấm mã tài sản) để mở chi tiết tài sản, rồi bấm nút **Báo hỏng** màu đỏ.',
       'Nhập **Mô tả hư hỏng**: hiện tượng, thời điểm, nguyên nhân (nếu biết).',
       'Bấm **Gửi báo hỏng**.')
t.anh('nv_30_form_bao_hong', 'Nhập mô tả hư hỏng rồi bấm Gửi báo hỏng')
t.anh('nv_31_da_bao_hong', 'Đã gửi báo hỏng – tài sản chuyển trạng thái “Chờ KT duyệt báo hỏng”')
t.h2('6.2. Đính kèm ảnh bằng chứng')
t.p('Ảnh chụp tình trạng hư hỏng giúp Kế toán duyệt nhanh. Sau khi gửi, mở phiếu báo hỏng: menu **Báo hỏng** → bấm mã phiếu **BH-…** (hoặc bấm mã BH-… ở bảng *Lịch sử* của tài sản):')
t.anh('nv_32_man_bao_hong', 'Màn Báo hỏng – phiếu vừa gửi đang chờ Kế toán duyệt')
t.buoc('Ở khung **Hóa đơn, chứng từ & ảnh**, chọn loại **Ảnh bằng chứng**.',
       'Bấm **Chụp ảnh** để chụp trực tiếp bằng camera điện thoại, hoặc **Chọn tệp** để chọn ảnh có sẵn (chọn được nhiều ảnh cùng lúc).',
       'Chờ dòng *Đang tải…* chạy xong – ảnh hiện ngay trong phiếu.')
t.anh('nv_33_dinh_kem_bao_hong', 'Ảnh bằng chứng đã đính kèm vào phiếu báo hỏng')
t.gach('Chụp **rõ chỗ hỏng** và **tem mã tài sản / số seri** trong cùng ảnh hoặc ảnh riêng.',
       'Muốn thêm ảnh: bấm tiếp *Chụp ảnh* / *Chọn tệp*. Ảnh tự thu nhỏ trước khi tải, không tốn nhiều dung lượng.',
       'Ảnh tải nhầm: bấm **×** trên ảnh để xoá (chỉ xoá được ảnh do chính bạn tải).')
t.h2('6.3. Sau khi báo hỏng')
t.p('Kế toán xem và **duyệt** phiếu: tài sản được thu về Kho tổng HCNS để sửa chữa hoặc thanh lý, **không còn tính là bạn đang giữ**. '
    'Nếu Kế toán **từ chối** (vd mô tả chưa rõ), tài sản trở về trạng thái cũ – xem lý do trong nhật ký phiếu và báo lại nếu cần. '
    'Theo dõi số phiếu chờ ở thẻ **Báo hỏng chờ kế toán duyệt** (Tài sản của tôi).')

# =====================================================================================================
t.h1('7. Câu hỏi thường gặp')
t.bang(['Tình huống', 'Cách xử lý'], [
    ['Đăng nhập báo chưa có quyền / chờ duyệt', 'Dùng đúng Gmail đã khai trên ETX. Nếu ETX chưa có Gmail của bạn, báo HCNS bổ sung – hệ thống tự cấp tài khoản sau lần đồng bộ (hằng ngày).'],
    ['Được giao tài sản nhưng không thấy phiếu', 'Bấm *Cập nhật lúc…* để tải lại; nếu vẫn không có, hỏi người giao đã lập phiếu cho đúng tên bạn chưa.'],
    ['Phiếu giao sai tài sản / số lượng', 'Không bấm xác nhận; báo người giao để họ lập lại phiếu đúng.'],
    ['Lỡ bấm xác nhận nhầm', 'Báo ngay HCNS / Quản lý để lập phiếu điều chỉnh.'],
    ['Tài sản đang giữ nhưng không có trong danh sách', 'Báo HCNS kiểm tra – có thể tài sản chưa được ghi nhận giao cho bạn.'],
    ['Không tải được ảnh', 'Chỉ nhận ảnh hoặc PDF, tối đa 10MB; kiểm tra kết nối mạng rồi thử lại.'],
    ['Camera không mở khi Quét QR', 'Cho phép trình duyệt dùng camera; hoặc gõ mã tài sản vào ô tìm kiếm.'],
    ['Mất / thất lạc tài sản', 'Báo ngay Quản lý và HCNS bằng văn bản; không tự xử lý trên hệ thống.'],
], rong=[5.5, 11])

t.h1('8. Tóm tắt nhanh')
t.bang(['Tôi muốn…', 'Vào đâu', 'Bấm'], [
    ['Xác nhận đã nhận hàng', 'Việc cần làm / Tài sản của tôi', '**Xác nhận** / **Đã nhận**'],
    ['Xem tài sản đang giữ', 'Tài sản → Tài sản của tôi', 'Bấm mã tài sản'],
    ['Báo hỏng', 'Tài sản của tôi (dòng tài sản)', '**Báo hỏng** → mô tả → **Gửi báo hỏng**'],
    ['Thêm ảnh hư hỏng', 'Báo hỏng → mã phiếu BH-…', '**Chụp ảnh** / **Chọn tệp**'],
    ['Tra tài sản bằng tem', 'Thanh dưới / trên cùng', '**Quét QR**'],
], rong=[4.5, 6, 6])

ra = GOC + 'docs/Huong_dan_su_dung_CCDC_3T_Nhan_vien.docx'
t.luu(ra)
print('Da tao', ra, 'so hinh', t.so_hinh)
