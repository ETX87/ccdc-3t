# Tao tai lieu "Huong dan su dung CCDC 3T - vai tro HCNS" (DOCX).
#   1) Chup anh: python chup_hcns.py <canh...> (ban sao local, xem hd.py)
#   2) python tao_docx_hcns.py  -> docs/Huong_dan_su_dung_CCDC_3T_HCNS.docx
from docx_lib import TaiLieu

ANH = 'F:/claude/QLBH 3T/.wrangler/huong_dan/anh/'
GOC = 'F:/claude/QLBH 3T/CCDC 3T/'
URL = 'https://ccdc.dichvu3t.workers.dev'

t = TaiLieu(ANH)
t.bia(
    GOC + 'frontend/public/icon-512.png',
    'HƯỚNG DẪN SỬ DỤNG\nHỆ THỐNG QUẢN LÝ CÔNG CỤ DỤNG CỤ',
    'Tài liệu đào tạo dành cho vai trò Hành chính – Nhân sự (HCNS)',
    [f'Địa chỉ truy cập: **{URL}**', 'Phiên bản 1.0 – Tháng 10/2026', 'Công ty 3T – Lưu hành nội bộ'],
)
t.chan_trang('Hướng dẫn sử dụng CCDC 3T – Vai trò HCNS')
t.muc_luc()

# =====================================================================================================
t.h1('1. Giới thiệu')
t.h2('1.1. Mục đích tài liệu')
t.p('Tài liệu hướng dẫn nhân sự **Hành chính – Nhân sự (HCNS)** sử dụng hệ thống **3T Asset Management** '
    '(quản lý công cụ dụng cụ – CCDC) để thực hiện đầy đủ các nghiệp vụ hằng ngày: nhập tài sản, cấp phát, '
    'điều chuyển, quản lý kho và vật tư tiêu hao, xử lý báo hỏng, thanh lý – tiêu hủy, kiểm kê và quản lý danh bạ nhân viên.')
t.p('Mọi hình minh họa trong tài liệu được chụp trực tiếp từ hệ thống với dữ liệu thật của công ty. Các mục có '
    'chữ *“(đào tạo)”* (ví dụ tài khoản *Nguyễn Thị HCNS (đào tạo)*, tài sản *TS3T-DT-0001*) là dữ liệu mẫu dùng để minh họa, không có trên hệ thống thật.')

t.h2('1.2. Vai trò HCNS làm được gì?')
t.bang(['Nhóm việc', 'HCNS được phép', 'Cần người khác'], [
    ['Tài sản cố định (TSCĐ)', 'Nhập tài sản mới, sửa thông tin, quản lý nhóm, in tem QR, vô hiệu hoá', 'Kế toán duyệt phiếu nhập (NT)'],
    ['Điều chuyển TSCĐ', 'Lập phiếu cấp phát / thu hồi / điều chuyển / chuyển kho', 'Người nhận xác nhận đã nhận'],
    ['Vật tư tiêu hao', 'Quản lý danh mục, lập phiếu nhập mua, chuyển kho, cấp phát nhân viên', 'Kế toán duyệt nhập mua; thủ kho nhận xác nhận'],
    ['Kho', 'Thêm kho, gán / bỏ thủ kho, ngừng kho', '–'],
    ['Báo hỏng', 'Lập phiếu báo hỏng, đánh dấu “Sửa xong”', 'Kế toán duyệt báo hỏng'],
    ['Thanh lý / tiêu hủy', 'Đề xuất và hoàn tất sau khi được duyệt', 'Kế toán duyệt'],
    ['Kiểm kê', 'Tạo đợt, ghi nhận, hoàn tất đợt', '–'],
    ['Nhân viên', 'Đồng bộ ETX, thêm / sửa hồ sơ, gán quản lý, đổi mã / gộp hồ sơ, đánh dấu nghỉ việc', '–'],
    ['Báo cáo, cảnh báo', 'Xem toàn hệ thống, xuất Excel, xử lý cảnh báo', '–'],
], rong=[3.6, 7.6, 5.3])
t.hop('Lưu ý:', 'Phân quyền tài khoản (gán vai trò Admin / Kế toán / HCNS / Quản lý) chỉ **Admin** thực hiện được. '
      'HCNS mặc định là thủ kho của **Kho tổng HCNS**.', 'luu_y')

t.h2('1.3. Các khái niệm cần nắm')
t.h3('Hai loại tài sản')
t.gach('**Tài sản cố định (TSCĐ)**: quản lý **từng chiếc** theo mã riêng (vd `TS3T-000025-001`), có tem QR, luân chuyển qua lại giữa kho và nhân viên '
       'cho đến khi thanh lý / tiêu hủy. Ví dụ: laptop, bàn ghế, tủ, điện thoại.',
       '**Vật tư tiêu hao**: quản lý theo **số lượng** (mã vật tư + số lượng), dùng hết là xong. Ví dụ: giấy in, mực, vỏ thẻ, ấn phẩm.')
t.h3('Chuỗi kho')
t.p('Hàng hoá đi theo chuỗi: **Kho mua hàng** (nguồn ảo khi nhập mua) → **Kho tổng HCNS** → **Kho miền** (Miền Bắc, Miền Nam) → '
    '**Kho quản lý** (mỗi quản lý 1 kho, tự tạo khi gán cấp dưới) → **Nhân viên**.')
t.bang(['Loại kho', 'Ý nghĩa', 'Ai là thủ kho'], [
    ['Kho mua hàng', 'Kho nguồn ảo – chỉ dùng cho phiếu nhập mua, không tính tồn', '–'],
    ['Kho HCNS (Kho tổng HCNS)', 'Kho trung tâm nhận hàng mua về, thu hồi tài sản, giữ tài sản hỏng', 'Mọi tài khoản HCNS / Admin'],
    ['Kho miền', 'Kho vận theo miền, phát hàng cho mọi nhân sự trong miền', 'Người được gán theo email (vd Kho vận Miền Bắc)'],
    ['Kho quản lý', 'Kho của từng quản lý, chỉ phát cho bản thân và cấp dưới trực tiếp', 'Chính quản lý đó'],
], rong=[4, 7.5, 5])
t.h3('Mã phiếu')
t.p('Mỗi phiếu có mã dễ đọc dạng `<Tiền tố>-<Năm Tháng>-<Số thứ tự>`, ví dụ `NM-2610-0001` là phiếu nhập mua số 1 của tháng 10/2026. '
    'Bấm vào mã phiếu (chữ xanh) ở bất kỳ đâu để mở chi tiết.')
t.bang(['Tiền tố', 'Loại phiếu', 'Tiền tố', 'Loại phiếu'], [
    ['NT', 'Nhập tài sản cố định mới', 'NM', 'Nhập mua vật tư tiêu hao'],
    ['GN', 'Giao nhận TSCĐ (cấp phát / thu hồi / điều chuyển / chuyển kho)', 'CK', 'Chuyển kho vật tư tiêu hao'],
    ['BH', 'Báo hỏng', 'CP', 'Cấp phát vật tư cho nhân viên'],
    ['TL', 'Thanh lý', 'TH', 'Tiêu hủy'],
    ['KK', 'Đợt kiểm kê', 'ID-…', 'Phiếu nhập từ dữ liệu cũ (AppSheet)'],
], rong=[1.6, 6.6, 1.6, 6.7])
t.h3('Các quy tắc chung')
t.gach('**Kế toán duyệt** mọi nghiệp vụ làm thay đổi giá trị tài sản: nhập mới (TSCĐ và tiêu hao), báo hỏng, thanh lý, tiêu hủy.',
       'Các bước chuyển giao còn lại chỉ cần **bên nhận xác nhận đã nhận**.',
       'Việc chờ quá **48 giờ** (chờ duyệt, chờ nhận, chờ bàn giao) bị đánh dấu **quá hạn** và hiện ở Cảnh báo.',
       'Mọi thời gian trong hệ thống tính theo **giờ Việt Nam (GMT+7)**.',
       'Hệ thống tự kiểm tra quyền: bạn chỉ thấy nút thao tác khi có quyền làm việc đó.')

# =====================================================================================================
t.h1('2. Bắt đầu sử dụng')
t.h2('2.1. Đăng nhập')
t.buoc(f'Mở trình duyệt (Chrome, Edge, Safari…) và truy cập **{URL}**.',
       'Bấm **Đăng nhập bằng Google** và chọn tài khoản **Gmail cá nhân đã đăng ký trên ETX nhân sự**.',
       'Lần đầu đăng nhập, hệ thống mở thẳng màn hình làm việc nếu tài khoản đã được cấp. Nếu thấy thông báo “chờ duyệt”, liên hệ Admin.')
t.anh('01_dang_nhap', 'Màn hình đăng nhập', cat=(700, 370, 1460, 980), rong=9)
t.hop('Tài khoản được cấp tự động:', 'Hằng đêm (0h) hệ thống đồng bộ danh bạ từ **ETX nhân sự** và tự tạo tài khoản cho mọi nhân sự đang làm việc có Gmail. '
      'Nhân sự nghỉ việc trên ETX sẽ tự bị khoá tài khoản. Vai trò HCNS do Admin gán ở *Cấu hình → Tài khoản & phân quyền*.', 'info')

t.h2('2.2. Giao diện chung')
t.anh('02_giao_dien_tong', 'Giao diện chính – menu bên trái (khung đỏ) theo vai trò HCNS')
t.bang(['Vùng', 'Chức năng'], [
    ['Menu trái', 'Các phân hệ. Số đỏ cạnh mục menu = số việc đang chờ bạn xử lý ở phân hệ đó.'],
    ['Ô tìm kiếm (trên cùng)', 'Tìm nhanh tài sản, phiếu, nhân viên theo mã hoặc tên.'],
    ['Quét QR', 'Dùng camera điện thoại quét tem QR trên tài sản để mở ngay thông tin tài sản.'],
    ['Chuông', 'Danh sách việc cần làm mới nhất; bấm vào để mở phiếu.'],
    ['Tên tài khoản (góc phải)', 'Xem vai trò, đăng xuất.'],
    ['Nút “Cập nhật lúc…”', 'Có ở mọi màn hình – bấm để tải lại số liệu mới nhất.'],
], rong=[4.5, 12])
t.h2('2.3. Tìm kiếm nhanh')
t.p('Gõ mã hoặc tên vào ô tìm kiếm, kết quả hiện theo nhóm *Tài sản / Phiếu / Nhân viên* kèm trạng thái và người đang giữ. Bấm một dòng để mở chi tiết.')
t.anh('03_tim_kiem', 'Tìm kiếm “máy tính” – kết quả kèm trạng thái và người giữ')
t.h2('2.4. Chuông thông báo')
t.anh('04_chuong', 'Chuông thông báo – các việc mới cần xử lý')
t.h2('2.5. Cửa sổ chi tiết')
t.p('Bấm vào **mã phiếu** hoặc **mã tài sản** (chữ xanh) ở bất kỳ màn hình nào sẽ mở cửa sổ chi tiết gồm thông tin, danh sách hàng, '
    '**nhật ký xử lý** (ai làm gì, lúc nào) và các **nút thao tác** phù hợp với quyền của bạn (Duyệt, Xác nhận đã nhận, Hoàn tất…).')
t.h2('2.6. Thao tác chung trên bảng')
t.gach('**Phân trang**: mỗi bảng hiển thị 50 dòng/trang, chuyển trang ở cuối bảng.',
       '**Lọc**: dùng các ô lọc (kho, nhóm, trạng thái, tháng) và các tab dạng nút tròn phía trên bảng; số trong ngoặc là số dòng tương ứng.',
       '**Bấm thẻ số liệu** (thẻ màu phía trên) để lọc nhanh danh sách theo đúng chỉ số đó.',
       '**Xuất Excel**: xuất toàn bộ danh sách theo bộ lọc hiện tại (không chỉ trang đang xem).')
t.h2('2.7. Dùng trên điện thoại & cài ứng dụng')
t.p('Hệ thống chạy tốt trên điện thoại: menu thu gọn vào nút ☰ góc trái. Để dùng như một ứng dụng, bấm **Cài đặt ứng dụng** cuối menu '
    '(Android/Chrome) hoặc trên iPhone chọn *Chia sẻ → Thêm vào MH chính*.')
t.anh_doi('08_dien_thoai', '09_dien_thoai_menu', 'Màn hình trên điện thoại', 'Menu trên điện thoại')

# =====================================================================================================
t.h1('3. Tổng quan, việc cần làm và cảnh báo')
t.h2('3.1. Màn hình Tổng quan')
t.p('Là màn hình mở đầu của HCNS, tóm tắt toàn bộ tài sản công ty: tổng tài sản, tài sản trong kho HCNS, đang sử dụng, vật tư tiêu hao đã cấp, '
    'phiếu chờ Kế toán duyệt; biểu đồ giá trị theo tháng, phân bổ theo nhóm, **luồng tài sản** và danh sách việc cần xử lý, cảnh báo.')
t.anh('05_tong_quan', 'Màn hình Tổng quan')
t.gach('Chọn **khoảng thời gian** và **đơn vị** (kho) ở đầu trang để xem số liệu theo phạm vi mong muốn.',
       'Dòng “so với kỳ trước” so sánh với số liệu hệ thống tự chụp hằng ngày; nếu chưa có thì ghi “Chưa có số liệu kỳ trước”.',
       'Mọi ô số liệu, sơ đồ luồng tài sản và dòng cảnh báo đều **bấm được** để mở danh sách chi tiết.')
t.h2('3.2. Việc cần làm')
t.p('Gom mọi việc đang chờ **bạn** xử lý: phiếu chờ nhận, tài sản hỏng chờ xử lý, phiếu chờ bàn giao… Lọc theo loại việc và thời hạn '
    '(*Quá hạn 48 giờ*, *Phát sinh hôm nay*). Bấm mã phiếu hoặc nút **Xử lý** để thao tác.')
t.anh('06_viec_can_lam', 'Việc cần làm của HCNS')
t.hop('Thói quen tốt:', 'Đầu mỗi ngày mở **Việc cần làm** và xử lý hết các dòng *Quá hạn 48 giờ* trước.', 'meo')
t.h2('3.3. Cảnh báo')
t.p('Tổng hợp các điểm bất thường cần chú ý: tài sản chờ bàn giao quá 48 giờ, **tồn kho âm**, phiếu quá hạn duyệt, **đơn giá bất thường**, '
    'tài sản sắp hết bảo hành… Bấm từng dòng để xem chi tiết.')
t.anh('07_canh_bao', 'Màn hình Cảnh báo')
t.gach('Loại cảnh báo **cần hành động** (quá hạn, tồn âm) chỉ hết khi xử lý xong nghiệp vụ gốc.',
       'Loại **theo dõi** (đơn giá bất thường, sắp hết bảo hành) có nút **bỏ qua** từng mục nếu đã kiểm tra và thấy đúng; có thể hoàn tác.',
       '**Đơn giá bất thường**: hệ thống đề xuất giá đúng theo số đông các lần nhập. Nếu *giá tham khảo* sai → bấm áp dụng đề xuất; '
       'nếu *đơn giá trên phiếu* sai → mở phiếu để kiểm tra (chứng từ đã duyệt không tự sửa).')

# =====================================================================================================
t.h1('4. Quản lý tài sản cố định')
t.h2('4.1. Danh mục tài sản cố định')
t.p('Vào menu **Tài sản → Danh mục tài sản cố định**. Màn hình liệt kê mọi tài sản đang quản lý với vị trí/người giữ, nguyên giá, trạng thái.')
t.anh('10_ds_tai_san', 'Danh mục tài sản – các nút Nhập tài sản mới, Quản lý nhóm, In tem QR')
t.gach('Tìm theo **mã, tên, số seri**; lọc theo **nhóm**, **kho**, và tab trạng thái (*Trong kho, Đang cấp phát, Hỏng, Chờ KT duyệt nhập*).',
       'Biểu tượng ✎ để **sửa**, biểu tượng 🗑 để **vô hiệu hoá** tài sản nhập sai (không áp dụng cho tài sản đang cấp phát hoặc đang chờ duyệt).')
t.h2('4.2. Quản lý nhóm tài sản')
t.p('Bấm **Quản lý nhóm** để thêm nhóm mới, đổi tên, **tắt/bật** nhóm (nhóm tắt không còn trong danh sách chọn khi nhập tài sản mới; tài sản cũ vẫn giữ nhóm).')
t.anh('11_quan_ly_nhom', 'Cửa sổ Quản lý nhóm tài sản')

t.h2('4.3. Nhập tài sản mới (cần Kế toán duyệt)')
t.p('**Luồng:** HCNS nhập tài sản → hệ thống tự tạo phiếu **NT** *Chờ KT duyệt nhập* → Kế toán duyệt → tài sản vào **Kho tổng HCNS**, sẵn sàng cấp phát.')
t.buoc('Vào **Tài sản → Danh mục tài sản cố định**, bấm **Nhập tài sản mới**.',
       'Nhập **Mã tài sản** (duy nhất, theo quy ước `TS3T-…`), **Tên tài sản** (bắt buộc), chọn **Nhóm**, đơn vị tính, số seri, **nguyên giá**, '
       'ngày mua, nhà cung cấp, hạn bảo hành, tình trạng.',
       'Bấm **Tạo & gửi Kế toán duyệt**.')
t.anh('13_form_nhap_ts', 'Form nhập tài sản cố định mới')
t.p('Tài sản xuất hiện ngay trong danh mục với trạng thái **Chờ KT duyệt nhập** (chưa cấp phát được).')
t.anh('14_sau_nhap_ts', 'Tài sản mới ở trạng thái “Chờ KT duyệt nhập”')
t.h3('Kế toán duyệt (để HCNS nắm luồng)')
t.p('Kế toán thấy phiếu NT trong **Việc cần làm**, mở phiếu và bấm **Duyệt** (hoặc **Từ chối** kèm lý do).')
t.anh('15_kt_viec_can_lam', 'Màn hình Việc cần làm của Kế toán – phiếu NT chờ duyệt')
t.anh('16_kt_popup_duyet', 'Kế toán mở phiếu và bấm Duyệt')
t.anh('17_kt_da_duyet', 'Phiếu NT hoàn tất – tài sản chuyển sang “Trong kho”, nhật ký ghi rõ người duyệt')
t.hop('Nếu Kế toán từ chối:', 'Phiếu chuyển sang *KT từ chối* kèm lý do. HCNS kiểm tra lại thông tin và nhập lại nếu cần.', 'luu_y')

t.h2('4.4. Xem chi tiết tài sản')
t.p('Bấm mã tài sản để xem: mã QR, nhóm, nguyên giá, số seri, vị trí/người giữ, tình trạng, ghi chú, lịch sử luân chuyển, '
    'cùng các nút **In tem QR**, **Báo hỏng**, **Đề xuất thanh lý / tiêu hủy**.')
t.anh('12_chi_tiet_tai_san', 'Cửa sổ chi tiết tài sản')

t.h2('4.5. In tem QR')
t.buoc('Đánh dấu ô chọn ở đầu các dòng tài sản cần in (hoặc không chọn gì để in tất cả dòng đang hiển thị).',
       'Bấm **In tem QR** – cửa sổ in mở ra, mỗi tem gồm mã QR, mã và tên tài sản.',
       'Nhấn **Ctrl + P** (hoặc lệnh In) để in ra giấy decal, dán lên tài sản.')
t.anh('18_chon_in_tem', 'Chọn tài sản và bấm In tem QR')
t.anh('19_tem_qr', 'Tem QR được tạo – sẵn sàng in', cat=(0, 0, 1352, 176))
t.hop('Mẹo:', 'Nếu trình duyệt báo chặn cửa sổ bật lên (pop-up), hãy cho phép pop-up cho trang này rồi bấm lại.', 'meo')

# =====================================================================================================
t.h1('5. Điều chuyển tài sản cố định (phiếu giao nhận)')
t.p('Mọi lần tài sản cố định đổi chỗ đều phải qua **phiếu giao nhận (GN)** tại menu **Điều chuyển**. Có 4 loại:')
t.bang(['Loại phiếu', 'Hướng', 'Ai xác nhận đã nhận'], [
    ['Cấp phát', 'Kho → nhân viên', 'Nhân viên nhận (màn *Tài sản của tôi*)'],
    ['Thu hồi', 'Nhân viên → kho', 'Thủ kho của kho nhận'],
    ['Điều chuyển', 'Nhân viên → nhân viên', 'Nhân viên nhận mới'],
    ['Chuyển kho', 'Kho → kho', 'Thủ kho của kho nhận'],
], rong=[3.5, 4.5, 8.5])
t.anh('20_dieu_chuyen', 'Màn hình Điều chuyển tài sản')
t.p('Các thẻ phía trên cho biết số phiếu *Chưa xác nhận nhận*, *Chờ tôi xác nhận*, *Đã xác nhận*; bảng bên dưới liệt kê phiếu theo tháng và loại.')

t.h2('5.1. Cấp phát tài sản cho nhân viên')
t.buoc('Bấm **Lập phiếu giao nhận**.',
       'Chọn **Loại phiếu: Cấp phát (kho → nhân viên)**, **Kho nguồn** (Kho tổng HCNS).',
       'Ô **Nhân viên nhận**: gõ tên hoặc mã nhân viên rồi chọn trong danh sách gợi ý.',
       'Ở danh sách tài sản trong kho: gõ để lọc, **tích chọn** tài sản cần giao (có thể chọn nhiều).',
       'Nhập **Ghi chú** (nếu có) và bấm **Tạo phiếu (n TS)**.')
t.anh('21_form_cap_phat_ts', 'Lập phiếu cấp phát laptop cho nhân viên')
t.anh('22_sau_cap_phat_ts', 'Phiếu GN đã tạo – chờ nhân viên xác nhận')
t.p('Ngay khi lập phiếu, tài sản chuyển sang **Đang cấp phát** và đứng tên nhân viên nhận. Nhân viên mở **Tài sản của tôi**, thấy phiếu ở mục '
    '*Cần xác nhận đã nhận* và bấm **Đã nhận** khi cầm tài sản trên tay.')
t.anh('23_nv_tai_san_cua_toi', 'Màn hình “Tài sản của tôi” của nhân viên nhận')
t.anh('25_nv_da_xac_nhan', 'Nhân viên đã xác nhận – phiếu chuyển sang Đã xác nhận')
t.hop('Theo dõi:', 'Phiếu chưa được xác nhận sau 48 giờ sẽ hiện ở *Việc cần làm* và *Cảnh báo* – HCNS nhắc nhân viên xác nhận.', 'luu_y')

t.h2('5.2. Thu hồi tài sản về kho')
t.p('Dùng khi nhân viên trả tài sản (nghỉ việc, đổi máy, tài sản không dùng nữa…).')
t.buoc('Bấm **Lập phiếu giao nhận**, chọn **Loại phiếu: Thu hồi (nhân viên → kho)**.',
       'Chọn **Nhân viên đang giữ** – danh sách tài sản người đó đang giữ hiện ra.',
       'Chọn **Kho nhận** (thường là Kho tổng HCNS), tích các tài sản thu hồi, bấm **Tạo phiếu**.',
       'Khi nhận tài sản thực tế, thủ kho kho nhận mở phiếu và bấm **Xác nhận đã nhận** – tài sản trở về **Trong kho**.')
t.anh('27_form_thu_hoi', 'Phiếu thu hồi tài sản về Kho tổng HCNS')

t.h2('5.3. Điều chuyển giữa hai nhân viên')
t.buoc('Chọn **Loại phiếu: Điều chuyển (nhân viên → nhân viên)**.',
       'Chọn **Nhân viên đang giữ**, **Nhân viên nhận mới**, tích tài sản, bấm **Tạo phiếu**.',
       'Nhân viên nhận mới xác nhận ở *Tài sản của tôi*.')
t.anh('28_form_dieu_chuyen', 'Phiếu điều chuyển tài sản giữa hai nhân viên')

t.h2('5.4. Chuyển tài sản giữa các kho')
t.buoc('Chọn **Loại phiếu: Chuyển kho (kho → kho)**, chọn **Kho nguồn** và **Kho nhận**.',
       'Tích tài sản, bấm **Tạo phiếu**. Thủ kho kho nhận bấm **Xác nhận đã nhận** khi hàng đến.')
t.anh('29_form_chuyen_kho_ts', 'Phiếu chuyển tài sản cố định sang kho miền')

# =====================================================================================================
t.h1('6. Vật tư tiêu hao')
t.p('Menu **Cấp phát** gồm 3 trang: **Phiếu cấp phát & chuyển kho**, **Tồn kho tiêu hao**, **Danh mục vật tư**. '
    'Luồng chuẩn: *Nhập mua (Kế toán duyệt) → Kho HCNS → Chuyển kho xuống kho miền / kho quản lý → Cấp phát nhân viên*.')

t.h2('6.1. Danh mục vật tư')
t.p('Mỗi vật tư cần có **mã**, **tên**, **đơn vị tính** và nên có **giá tham khảo** (dùng tính giá trị tồn và phát hiện đơn giá bất thường).')
t.anh('30_danh_muc_vat_tu', 'Danh mục vật tư tiêu hao')
t.buoc('Bấm **Thêm vật tư**.', 'Nhập mã vật tư, tên, chọn nhóm, đơn vị tính, giá tham khảo.', 'Bấm **Lưu**.')
t.anh('31_form_vat_tu', 'Thêm vật tư mới')
t.p('Nút **Tồn kho** trên mỗi dòng mở ngay tồn của vật tư đó ở mọi kho. Vật tư không dùng nữa thì **vô hiệu hoá** (không xoá để giữ lịch sử).')

t.h2('6.2. Màn hình phiếu cấp phát & chuyển kho')
t.anh('32_phieu_cap_phat', 'Danh sách phiếu tiêu hao – nút Nhập mua, Chuyển kho, Cấp phát NV')
t.p('Thẻ phía trên: số phiếu cấp phát nhân viên trong tháng, phiếu nhập mua trong tháng, phiếu **chờ Kế toán duyệt**, phiếu **đang chuyển chưa nhận**. '
    'Lọc bảng theo kho, loại phiếu, trạng thái, tháng.')

t.h2('6.3. Nhập mua vật tư (cần Kế toán duyệt)')
t.buoc('Bấm **Nhập mua**.',
       'Kho nguồn là *Kho mua hàng*, kho đích *Kho tổng HCNS*; nhập **Nhà cung cấp**.',
       'Ở phần **Hàng hoá**: chọn vật tư, nhập **số lượng** và **đơn giá** (tự điền giá tham khảo – sửa theo hoá đơn thực tế). '
       'Bấm **+ Thêm dòng** để thêm vật tư khác.',
       'Nhập ghi chú, bấm **Lập phiếu**.')
t.anh('33_form_nhap_mua', 'Lập phiếu nhập mua giấy in')
t.anh('34_sau_nhap_mua', 'Phiếu NM chờ Kế toán duyệt')
t.p('Hàng **chỉ vào tồn kho HCNS sau khi Kế toán duyệt**.')
t.anh('35_kt_duyet_nhap_mua', 'Kế toán duyệt phiếu nhập mua')

t.h2('6.4. Chuyển kho xuống kho miền')
t.buoc('Bấm **Chuyển kho**, chọn **Kho nguồn** (Kho tổng HCNS) và **Kho đích** (vd Kho vận Miền Bắc).',
       'Chọn vật tư và số lượng (không được vượt tồn kho nguồn), bấm **Lập phiếu**.')
t.anh('36_form_chuyen_kho', 'Lập phiếu chuyển 40 ram giấy cho Kho vận Miền Bắc')
t.p('Hàng **trừ khỏi kho nguồn ngay** (trạng thái *Đang chuyển*) và **cộng vào kho đích khi thủ kho đích xác nhận đã nhận**.')
t.anh('37_sau_chuyen_kho', 'Phiếu CK ở trạng thái Đang chuyển')
t.h3('Thủ kho miền xác nhận nhận hàng')
t.p('Thủ kho kho đích thấy phiếu trong **Việc cần làm**, mở phiếu, kiểm đếm hàng thực tế rồi bấm **Xác nhận đã nhận**. '
    'Nếu hàng sai/thiếu, bấm **Từ chối nhận** kèm lý do – hàng tự **hoàn về kho nguồn**.')
t.anh('38_tk_viec_can_lam', 'Việc cần làm của thủ kho Kho vận Miền Bắc')
t.anh('39_tk_xac_nhan_nhan', 'Thủ kho bấm Xác nhận đã nhận hoặc Từ chối nhận')
t.hop('Xác nhận hộ:', 'Trường hợp thủ kho nhận không thao tác được, người lập phiếu (thủ kho kho nguồn) có nút **Xác nhận hộ kho nhận** '
      '– bắt buộc ghi rõ lý do.', 'info')

t.h2('6.5. Cấp phát vật tư cho nhân viên')
t.buoc('Bấm **Cấp phát NV**, chọn **Kho nguồn**.',
       'Ô **Người nhận**: tìm và chọn nhân viên. Nếu là KTV/CTV đối tác không có trong danh bạ, tích '
       '*Người nhận không có trong danh bạ* và gõ tên.',
       'Chọn vật tư, số lượng, bấm **Lập phiếu**.')
t.anh('40_form_cap_phat_nv', 'Cấp phát 2 ram giấy cho nhân viên')
t.p('Phiếu ở trạng thái **Đã giao** (trừ tồn ngay). Nhân viên xác nhận đã nhận ở **Tài sản của tôi**.')
t.anh('26_nv_nhan_tieu_hao', 'Nhân viên thấy phiếu cấp phát tiêu hao cần xác nhận')
t.hop('Lưu ý:', 'Kho quản lý chỉ cấp được cho **chính quản lý và cấp dưới trực tiếp**; kho HCNS và kho miền cấp cho mọi nhân sự.', 'luu_y')

t.h2('6.6. Tồn kho tiêu hao')
t.p('Xem tồn từng vật tư theo kho: số lượng tồn, giá trị (theo giá tham khảo), số **đang chuyển đến**, và các dòng **tồn âm**.')
t.anh('41_ton_kho_tieu_hao', 'Tồn kho tiêu hao')
t.hop('Tồn âm là gì?', 'Tồn âm phát sinh từ dữ liệu cũ (xuất nhiều hơn nhập). Cần kiểm kê thực tế và lập phiếu điều chỉnh (nhập bổ sung hoặc chuyển kho) để tồn về đúng.', 'canh_bao')

# =====================================================================================================
t.h1('7. Kho và thủ kho')
t.p('Menu **Kho & tồn** có 2 tab: **Tồn theo kho** và **Cấu hình kho & thủ kho**.')
t.anh('45_kho_ton', 'Tab Tồn theo kho – TSCĐ trong kho, tồn tiêu hao, tồn âm, phiếu chờ nhận theo từng kho')
t.p('Mặc định ẩn các kho quản lý chưa có hàng; bỏ tích để xem tất cả. Nút **TSCĐ** / **Tồn tiêu hao** mở danh sách chi tiết của kho đó.')
t.h2('7.1. Gán / bỏ thủ kho')
t.buoc('Mở tab **Cấu hình kho & thủ kho**.',
       'Tại dòng kho cần gán, gõ **email đăng nhập** của người phụ trách vào ô *Email thủ kho…* và bấm **Gán**.',
       'Bỏ quyền: bấm dấu **×** cạnh email.')
t.anh('46_kho_thu_kho', 'Danh sách kho & phân quyền thủ kho')
t.hop('Lưu ý:', ['Người được gán phải **đã đăng nhập hệ thống ít nhất 1 lần**.',
                 'Kho HCNS không cần gán: mọi tài khoản HCNS/Admin đều là thủ kho.',
                 'Kho quản lý **tự tạo** khi gán *Quản lý trực tiếp* cho nhân viên (xem chương 12); quản lý tự là thủ kho kho của mình.'], 'luu_y')
t.h2('7.2. Thêm kho mới / ngừng kho')
t.p('Bấm **Thêm kho mới**, nhập tên, chọn loại kho (Kho miền / Kho HCNS / Kho mua hàng) rồi lưu. Kho không dùng nữa bấm **Ngừng** để tạm ngừng (bấm lại để bật). Kho mua hàng và Kho tổng HCNS là kho hệ thống, không ngừng được.')
t.anh('47_them_kho', 'Thêm kho mới')

# =====================================================================================================
t.h1('8. Báo hỏng tài sản')
t.p('**Luồng:** Lập phiếu báo hỏng (BH) → Kế toán duyệt → tài sản về **Kho tổng HCNS** với trạng thái **Hỏng** → HCNS chọn **Sửa xong** '
    '(đưa lại sử dụng) hoặc **Đề xuất thanh lý / tiêu hủy**.')
t.anh('50_bao_hong', 'Màn hình Báo hỏng tài sản')
t.h2('8.1. Lập phiếu báo hỏng')
t.p('Nhân viên tự báo hỏng tài sản mình giữ ở *Tài sản của tôi*. HCNS cũng có thể báo hỏng thay:')
t.buoc('Vào **Báo hỏng**, bấm **+ Báo hỏng**.',
       'Tìm và tích tài sản hỏng (tài sản đang trong kho, đang cấp phát hoặc đang bảo trì).',
       'Nhập **Mô tả hư hỏng** (bắt buộc), bấm **Gửi Kế toán duyệt**.')
t.anh('51_form_bao_hong', 'Lập phiếu báo hỏng')
t.anh('52_sau_bao_hong', 'Phiếu báo hỏng chờ Kế toán duyệt')
t.anh('53_kt_duyet_bao_hong', 'Kế toán duyệt phiếu báo hỏng')
t.h2('8.2. Xử lý tài sản hỏng')
t.p('Sau khi duyệt, tài sản nằm ở bảng **Tài sản hỏng đang ở kho – chờ sửa hoặc đề xuất thanh lý / tiêu hủy**.')
t.anh('54_ts_hong_cho_xu_ly', 'Tài sản hỏng chờ xử lý – nút Sửa xong và Thanh lý / tiêu hủy')
t.gach('**Sửa xong**: sau khi sửa chữa, bấm để đưa tài sản về **Trong kho**, tình trạng *Tốt* – sẵn sàng cấp phát lại.',
       '**Thanh lý / tiêu hủy…**: mở chi tiết tài sản để đề xuất xử lý (chương 9).')
t.anh('55_xac_nhan_sua_xong', 'Xác nhận tài sản đã sửa xong')

# =====================================================================================================
t.h1('9. Thanh lý và tiêu hủy')
t.p('**Điều kiện:** chỉ đề xuất cho tài sản **đang nằm trong kho** (Trong kho hoặc Hỏng), **không ai giữ**. Tài sản đang ở nhân viên phải thu hồi trước.')
t.p('**Luồng:** HCNS đề xuất (TL / TH) → Kế toán duyệt → HCNS xử lý thực tế (bán, huỷ) → bấm **Hoàn tất** (thanh lý ghi giá trị thu hồi).')
t.anh('60_thanh_ly', 'Màn hình Thanh lý & tiêu hủy – nút Đề xuất thanh lý / Đề xuất tiêu hủy')
t.h2('9.1. Lập đề xuất')
t.buoc('Bấm **Đề xuất thanh lý** (hoặc **Đề xuất tiêu hủy**).',
       'Tìm, tích tài sản; nhập **Lý do** (bắt buộc).',
       'Bấm **Gửi Kế toán duyệt**.')
t.anh('61_form_thanh_ly', 'Đề xuất thanh lý laptop hỏng')
t.anh('62_kt_duyet_thanh_ly', 'Kế toán duyệt đề xuất thanh lý')
t.h2('9.2. Hoàn tất sau khi Kế toán duyệt')
t.buoc('Mở phiếu đã duyệt (trạng thái *KT đã duyệt*).',
       'Bấm **Hoàn tất thanh lý**, nhập **Giá trị thu hồi** (số tiền bán được) và ghi chú.',
       'Bấm **Xác nhận: Hoàn tất thanh lý**. Với tiêu hủy, chỉ cần ghi chú rồi xác nhận.')
t.anh('63_hoan_tat_thanh_ly', 'Nhập giá trị thu hồi và hoàn tất thanh lý')
t.anh('64_da_thanh_ly', 'Phiếu thanh lý hoàn tất – nhật ký đầy đủ 3 bước')
t.p('Tài sản chuyển sang **Đã thanh lý / Đã tiêu hủy**, không còn tính vào tài sản đang quản lý; tra cứu lại ở báo cáo *Đã thanh lý / tiêu hủy*.')

# =====================================================================================================
t.h1('10. Kiểm kê tài sản')
t.p('Kiểm kê **chỉ ghi nhận chênh lệch**, không tự sửa dữ liệu. Sau khi có kết quả, chỉnh thực tế bằng phiếu điều chuyển / báo hỏng có người chịu trách nhiệm.')
t.anh('70_kiem_ke', 'Danh sách các đợt kiểm kê')
t.h2('10.1. Tạo đợt kiểm kê')
t.buoc('Bấm **Tạo đợt kiểm kê**, nhập **Tên đợt** và **Ngày bắt đầu**, bấm **Tạo đợt**.')
t.anh('71_tao_dot', 'Tạo đợt kiểm kê')
t.h2('10.2. Ghi nhận từng tài sản')
t.buoc('Ở khung **Ghi nhận kiểm kê**: chọn tài sản bằng ô tìm kiếm hoặc bấm **Quét tem QR** (điện thoại).',
       'Dòng gợi ý dưới ô cho biết hệ thống đang ghi nhận tài sản ở đâu.',
       'Chọn **Tình trạng thực tế**: *Đúng vị trí, Thiếu, Thừa, Hỏng, Sai người giữ* (nếu sai người giữ thì chọn người đang giữ thực tế).',
       'Nhập ghi chú, bấm **Ghi nhận**. Lặp lại cho từng tài sản.')
t.anh('72_ghi_nhan', 'Khung ghi nhận kiểm kê')
t.anh('73_dot_dang_kiem', 'Tiến độ đợt kiểm kê: đã kiểm, đúng vị trí, chênh lệch, chưa kiểm')
t.p('Các tab *Đã kiểm / Chênh lệch / Chưa kiểm* giúp theo dõi tiến độ; **Xuất Excel** để lưu biên bản.')
t.h2('10.3. Hoàn tất đợt')
t.p('Khi kiểm xong, bấm **Hoàn tất đợt**. Sau khi hoàn tất **không ghi nhận thêm được**.')
t.anh('74_hoan_tat_dot', 'Xác nhận hoàn tất đợt kiểm kê')
t.hop('Xử lý chênh lệch:', ['**Thiếu / Sai người giữ** → lập phiếu thu hồi / điều chuyển cho đúng người, đúng kho.',
                             '**Hỏng** → lập phiếu báo hỏng.', '**Thừa** → kiểm tra nguồn gốc, nhập tài sản nếu cần.'], 'meo')

# =====================================================================================================
t.h1('11. Báo cáo')
t.p('Menu **Báo cáo** gồm 6 báo cáo, dữ liệu theo phạm vi toàn hệ thống của HCNS, lọc được theo các ô lọc trên đầu mỗi báo cáo.')
for ten, ct, mo_ta in [
    ('80_bao_cao', 'Báo cáo tổng hợp', 'Tổng tài sản theo trạng thái, theo kho, tồn tiêu hao, phiếu đang chờ.'),
    ('81_bao_cao', 'Báo cáo theo nhân viên', 'Mỗi nhân viên đang giữ bao nhiêu tài sản, giá trị, số tài sản hỏng.'),
    ('82_bao_cao', 'Báo cáo theo bộ phận', 'Số nhân viên, số tài sản và giá trị theo bộ phận.'),
    ('83_bao_cao', 'Tài sản sắp hết bảo hành', 'Danh sách tài sản sắp/đã hết hạn bảo hành để chủ động bảo trì.'),
    ('84_bao_cao', 'Chênh lệch kiểm kê', 'Toàn bộ chênh lệch qua các đợt kiểm kê.'),
    ('85_bao_cao', 'Tài sản đã thanh lý / tiêu hủy', 'Lịch sử thanh lý, tiêu hủy và giá trị thu hồi.'),
]:
    t.h3(ct)
    t.p(mo_ta)
    t.anh(ten, ct)

# =====================================================================================================
t.h1('12. Nhân viên và sơ đồ quản lý')
t.p('Menu **Cấu hình → Nhân viên & sơ đồ quản lý**. Danh bạ được **đồng bộ tự động từ ETX nhân sự lúc 0h hằng ngày**; HCNS có thể bấm '
    '**Đồng bộ ETX** để cập nhật ngay.')
t.anh('90_nhan_vien', 'Danh sách nhân viên – nút Đồng bộ ETX và Thêm nhân viên')
t.gach('Thẻ số liệu: tổng nhân viên đang làm, số có tài khoản hệ thống, số quản lý có cấp dưới, số người đang giữ tài sản.',
       'Cột **TS giữ** cho biết số tài sản mỗi người đang giữ; bấm để mở danh sách tài sản của người đó.')
t.h2('12.1. Tìm và sửa hồ sơ')
t.anh('91_tim_nhan_vien', 'Tìm nhân viên – các nút Sửa, Đổi mã / gộp, Nghỉ việc')
t.anh('92_sua_nhan_vien', 'Form sửa hồ sơ nhân viên')
t.gach('**Email đăng nhập**: Gmail dùng để đăng nhập hệ thống. Mỗi email chỉ gắn **1 hồ sơ** (nguyên tắc 1 nhân sự = 1 tài khoản).',
       '**Quản lý trực tiếp**: chọn quản lý của nhân viên – hệ thống **tự tạo kho quản lý** cho người quản lý đó (nếu chưa có).',
       'Hồ sơ gắn ETX: họ tên, chức vụ, Gmail lấy theo ETX – sửa tay sẽ bị ghi đè ở lần đồng bộ sau; muốn sửa lâu dài thì sửa trên ETX.')
t.h2('12.2. Đổi mã / gộp hồ sơ')
t.p('Dùng khi một người có **nhiều hồ sơ** (hồ sơ cũ từ dữ liệu AppSheet và hồ sơ ETX) hoặc đang dùng **mã tạm** cần đổi sang mã ETX chuẩn. '
    'Mọi tài sản, phiếu, kho quản lý, cấp dưới của hồ sơ cũ được chuyển sang hồ sơ đích – **tồn kho không thay đổi**, mã cũ ghi vào nhật ký.')
t.anh('93_doi_ma_gop', 'Cửa sổ Đổi mã / gộp hồ sơ')
t.bang(['Thao tác', 'Khi nào dùng'], [
    ['Gắn mã ETX chuẩn', 'Hồ sơ chưa có mã ETX – tìm người đó trên danh bạ ETX (theo mã NS-…, họ tên hoặc Gmail) và gắn.'],
    ['Gộp vào hồ sơ khác', 'Hai hồ sơ cùng là một người – gộp hồ sơ thừa vào hồ sơ giữ lại.'],
    ['Đổi mã nội bộ', 'Đổi mã tạm sang mã khác (nhân sự không có trên ETX như CTV đối tác).'],
], rong=[4.5, 12])
t.hop('Quan trọng:', 'Luôn bấm **Xem trước** để kiểm tra số tài sản, phiếu, kho sẽ chuyển trước khi xác nhận. Nếu hai hồ sơ có 2 email khác nhau, chọn email giữ lại.', 'canh_bao')
t.h2('12.3. Thêm nhân viên & đánh dấu nghỉ việc')
t.gach('**Thêm nhân viên**: chỉ dùng cho người không có trên ETX (CTV, đối tác…) – nhập mã, họ tên, bộ phận, chức vụ.',
       '**Nghỉ việc**: chỉ đánh dấu được khi người đó **không còn giữ tài sản** – nếu còn, thu hồi hết trước (form có link mở danh sách tài sản đang giữ).')

# =====================================================================================================
t.h1('13. Tài sản của tôi')
t.p('Ngoài vai trò HCNS, mỗi người dùng đều có màn **Tài sản → Tài sản của tôi** để xem tài sản cố định đang giữ, vật tư đã nhận, '
    'lịch sử giao nhận, **xác nhận đã nhận** và **báo hỏng** tài sản mình giữ (minh họa ở mục 5.1 và 6.5).')
t.hop('Nếu chưa liên kết hồ sơ:', 'Màn hình báo tài khoản chưa liên kết hồ sơ nhân viên. HCNS/Admin có thể tự chọn hồ sơ của mình để liên kết; '
      'nhân viên khác liên hệ HCNS kiểm tra **Email đăng nhập** trong hồ sơ.', 'info')

# =====================================================================================================
t.h1('14. Câu hỏi thường gặp và xử lý lỗi')
t.bang(['Tình huống / thông báo', 'Nguyên nhân và cách xử lý'], [
    ['Không thấy nút Duyệt trên phiếu', 'Chỉ Kế toán (hoặc Admin) duyệt được. HCNS chờ Kế toán xử lý.'],
    ['“Số lượng xuất vượt tồn kho nguồn”', 'Kho nguồn không đủ hàng – kiểm tra Tồn kho tiêu hao, giảm số lượng hoặc chuyển thêm hàng về kho nguồn.'],
    ['“Phiếu đã được xử lý bởi người khác”', 'Phiếu vừa được người khác duyệt/nhận – bấm “Cập nhật lúc…” để tải lại.'],
    ['“Chỉ xử lý được tài sản đang nằm trong kho”', 'Tài sản đang ở nhân viên – lập phiếu thu hồi trước rồi mới đề xuất thanh lý / tiêu hủy.'],
    ['“Email này chưa từng đăng nhập hệ thống”', 'Khi gán thủ kho: người đó cần đăng nhập 1 lần trước.'],
    ['“Email này đã liên kết với một hồ sơ nhân viên khác”', 'Một email chỉ gắn 1 hồ sơ – dùng Đổi mã / gộp nếu hai hồ sơ là một người.'],
    ['“Mã này đã tồn tại”', 'Mã tài sản / vật tư / nhân viên bị trùng – dùng mã khác.'],
    ['Nhân viên không thấy tài sản đã cấp', 'Kiểm tra hồ sơ nhân viên đã có Email đăng nhập đúng Gmail người đó dùng để đăng nhập chưa.'],
    ['Không mở được cửa sổ in tem', 'Trình duyệt chặn pop-up – cho phép pop-up cho trang và bấm lại.'],
    ['Quét QR không mở camera', 'Camera chỉ hoạt động trên điện thoại qua địa chỉ https; có thể gõ mã tài sản vào ô nhập tay.'],
], rong=[6, 10.5])

# =====================================================================================================
t.h1('15. Phụ lục')
t.h2('15.1. Trạng thái tài sản cố định')
t.bang(['Trạng thái', 'Ý nghĩa'], [
    ['Chờ KT duyệt nhập', 'Tài sản mới nhập, chờ Kế toán duyệt phiếu NT'],
    ['Trong kho', 'Đang nằm trong kho, sẵn sàng cấp phát'],
    ['Đang cấp phát', 'Nhân viên đang giữ / sử dụng'],
    ['Đang bảo trì', 'Đang sửa chữa, bảo trì'],
    ['Chờ KT duyệt báo hỏng', 'Đã báo hỏng, chờ Kế toán duyệt'],
    ['Hỏng', 'Đã duyệt hỏng, nằm ở Kho HCNS chờ sửa hoặc thanh lý / tiêu hủy'],
    ['Chờ thanh lý / Chờ tiêu hủy', 'Đã đề xuất, chờ Kế toán duyệt và HCNS hoàn tất'],
    ['Đã thanh lý / Đã tiêu hủy', 'Kết thúc vòng đời, không còn quản lý'],
], rong=[5, 11.5])
t.h2('15.2. Trạng thái phiếu')
t.bang(['Trạng thái', 'Áp dụng cho', 'Ý nghĩa'], [
    ['Chờ KT duyệt', 'Nhập mua, NT, báo hỏng, thanh lý, tiêu hủy', 'Đang chờ Kế toán'],
    ['KT từ chối', 'Như trên', 'Kế toán không duyệt (xem lý do trong nhật ký)'],
    ['KT đã duyệt', 'Thanh lý, tiêu hủy', 'Chờ HCNS hoàn tất xử lý thực tế'],
    ['Đang chuyển', 'Chuyển kho tiêu hao', 'Đã trừ kho nguồn, chờ kho đích nhận'],
    ['Đã nhận / Hoàn tất', 'Mọi phiếu', 'Đã kết thúc'],
    ['Bị từ chối nhận', 'Chuyển kho tiêu hao', 'Kho đích từ chối, hàng đã hoàn về kho nguồn'],
    ['Đã giao', 'Cấp phát NV tiêu hao', 'Đã trừ tồn; nhân viên xác nhận đã nhận'],
], rong=[3.5, 6, 7])
t.h2('15.3. Công việc định kỳ của HCNS')
t.bang(['Tần suất', 'Việc cần làm'], [
    ['Hằng ngày', 'Xử lý **Việc cần làm** (ưu tiên quá hạn 48 giờ); xác nhận hàng thu hồi về kho; nhắc nhân viên xác nhận nhận hàng.'],
    ['Hằng tuần', 'Rà **Cảnh báo** (tồn âm, đơn giá bất thường, chờ bàn giao); xử lý tài sản hỏng tồn kho (sửa xong / đề xuất thanh lý).'],
    ['Hằng tháng', 'Kiểm tra tồn kho tiêu hao các kho; xuất báo cáo tổng hợp, theo bộ phận; rà tài sản sắp hết bảo hành.'],
    ['Hằng quý / năm', 'Tạo **đợt kiểm kê**, xử lý chênh lệch; đề xuất thanh lý tài sản hư hỏng, lỗi thời.'],
    ['Khi có nhân sự nghỉ việc', 'Thu hồi toàn bộ tài sản trước ngày nghỉ, sau đó mới đánh dấu nghỉ việc.'],
], rong=[3.8, 12.7])

ra = GOC + 'docs/Huong_dan_su_dung_CCDC_3T_HCNS.docx'
t.luu(ra)
print('Da tao', ra, 'so hinh', t.so_hinh)
