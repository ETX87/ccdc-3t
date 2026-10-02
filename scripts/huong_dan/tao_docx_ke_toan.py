# Tao tai lieu "Huong dan su dung CCDC 3T - vai tro KE TOAN" (DOCX).
#   1) Chup anh: python chup_ke_toan.py chuan_bi giao_dien viec hcns_bi_tu_choi duyet_nhap_mua canh_bao_gia
#                tu_choi_popup bao_hong thanh_ly xem   (anh 16/17 dung lai tu chup_hcns.py kt_duyet_nt)
#   2) python tao_docx_ke_toan.py ; powershell -File cap_nhat_word.ps1 -Docx <duong dan docx>
from docx_lib import TaiLieu

ANH = 'F:/claude/QLBH 3T/.wrangler/huong_dan/anh/'
GOC = 'F:/claude/QLBH 3T/CCDC 3T/'
URL = 'https://ccdc.dichvu3t.workers.dev'

t = TaiLieu(ANH)
t.bia(
    GOC + 'frontend/public/icon-512.png',
    'HƯỚNG DẪN SỬ DỤNG\nHỆ THỐNG QUẢN LÝ CÔNG CỤ DỤNG CỤ',
    'Tài liệu đào tạo dành cho vai trò Kế toán',
    [f'Địa chỉ truy cập: **{URL}**', 'Phiên bản 1.0 – Tháng 10/2026', 'Công ty 3T – Lưu hành nội bộ'],
)
t.chan_trang('Hướng dẫn sử dụng CCDC 3T – Vai trò Kế toán')
t.muc_luc()

# =====================================================================================================
t.h1('1. Giới thiệu')
t.h2('1.1. Mục đích tài liệu')
t.p('Tài liệu hướng dẫn **Kế toán** sử dụng hệ thống **3T Asset Management** để **kiểm soát và phê duyệt** mọi nghiệp vụ làm thay đổi '
    'giá trị tài sản của công ty, đồng thời tra cứu, đối chiếu số liệu tài sản – tồn kho và theo dõi các cảnh báo về giá.')
t.p('Hình minh họa được chụp trực tiếp từ hệ thống với dữ liệu thật. Các mục có chữ *“(đào tạo)”* (tài khoản *Trần Văn Kế Toán (đào tạo)*, '
    '*Nguyễn Thị HCNS (đào tạo)*, tài sản *TS3T-DT-…*, vật tư *Giấy A4 Double A (đào tạo)*) là dữ liệu mẫu để minh họa.')

t.h2('1.2. Vai trò của Kế toán trong hệ thống')
t.p('Kế toán là **người phê duyệt cuối cùng** cho 5 loại phiếu. Mọi phiếu khác (chuyển kho, cấp phát, điều chuyển) chỉ cần bên nhận xác nhận, '
    'Kế toán **không phải duyệt** nhưng xem được toàn bộ để đối chiếu.')
t.bang(['Loại phiếu', 'Ai lập', 'Khi Kế toán DUYỆT', 'Khi Kế toán TỪ CHỐI'], [
    ['**NT** – Nhập tài sản cố định', 'HCNS', 'Tài sản vào **Kho tổng HCNS**, trạng thái *Trong kho*, được phép cấp phát', 'Tài sản bị **vô hiệu hoá**; HCNS nhập lại nếu cần'],
    ['**NM** – Nhập mua vật tư tiêu hao', 'HCNS', 'Số lượng được **cộng vào tồn Kho tổng HCNS**', 'Hàng **không vào tồn**; phiếu chuyển *KT từ chối*'],
    ['**BH** – Báo hỏng', 'Nhân viên giữ tài sản / HCNS', 'Tài sản thu về **Kho tổng HCNS**, trạng thái *Hỏng*', 'Tài sản **trở về trạng thái cũ** (người giữ cũ)'],
    ['**TL** – Thanh lý', 'HCNS', 'Chờ HCNS bán thực tế và bấm *Hoàn tất* (ghi giá trị thu hồi)', 'Tài sản trở về trạng thái cũ'],
    ['**TH** – Tiêu hủy', 'HCNS', 'Chờ HCNS hủy thực tế và bấm *Hoàn tất*', 'Tài sản trở về trạng thái cũ'],
], rong=[3.6, 2.8, 5.3, 4.8])
t.hop('Nguyên tắc:', ['Kế toán **không lập phiếu**, không sửa chứng từ. Nếu phiếu sai → **Từ chối kèm lý do rõ ràng**, người lập sẽ lập lại phiếu đúng.',
                       'Mọi thao tác duyệt / từ chối được ghi vào **nhật ký xử lý** của phiếu (người làm, thời điểm theo giờ Việt Nam).'], 'luu_y')
t.h2('1.3. Mã phiếu')
t.p('Mã phiếu có dạng `<Tiền tố>-<Năm Tháng>-<Số thứ tự>`, ví dụ `NM-2610-0002` là phiếu nhập mua số 2 tháng 10/2026. '
    'Phiếu chuyển từ dữ liệu cũ (AppSheet) giữ mã dạng `ID-xxxxxxxx`. Bấm vào mã (chữ xanh) để mở chi tiết phiếu.')
t.h2('1.4. Thời hạn xử lý')
t.p('Phiếu chờ duyệt quá **48 giờ** bị đánh dấu **quá hạn** (chấm đỏ) ở *Việc cần làm*, đếm vào *Cảnh báo → Phiếu quá hạn duyệt* và hiện với HCNS/Admin. '
    'Kế toán nên xử lý phiếu trong ngày.')

# =====================================================================================================
t.h1('2. Đăng nhập và giao diện')
t.h2('2.1. Đăng nhập')
t.buoc(f'Truy cập **{URL}** bằng trình duyệt (máy tính hoặc điện thoại).',
       'Bấm **Đăng nhập bằng Google**, chọn **Gmail cá nhân đã đăng ký trên ETX nhân sự**.',
       'Tài khoản được hệ thống tự cấp từ ETX; vai trò **Kế toán** do Admin gán. Nếu chưa thấy menu Kế toán, liên hệ Admin.')
t.anh('01_dang_nhap', 'Màn hình đăng nhập', cat=(700, 370, 1460, 980), rong=9)
t.h2('2.2. Giao diện của Kế toán')
t.anh('kt_01_giao_dien', 'Giao diện chính của Kế toán – số đỏ trên menu là số việc đang chờ')
t.bang(['Mục menu', 'Kế toán dùng để'], [
    ['Tổng quan', 'Xem nhanh tổng giá trị tài sản, phiếu chờ duyệt, biểu đồ chi phí mua sắm.'],
    ['**Việc cần làm**', '**Nơi duyệt chính** – toàn bộ phiếu đang chờ Kế toán, duyệt / từ chối ngay trên dòng.'],
    ['Tài sản', 'Tra cứu danh mục tài sản cố định, nguyên giá, người giữ (chỉ xem, xuất Excel).'],
    ['Kho & tồn, Cấp phát', 'Đối chiếu tồn kho, giá trị tồn; xem / duyệt phiếu nhập mua.'],
    ['Điều chuyển', 'Xem lịch sử giao nhận tài sản cố định.'],
    ['Báo hỏng, Thanh lý & tiêu hủy', 'Xem và duyệt phiếu báo hỏng, thanh lý, tiêu hủy.'],
    ['Kiểm kê', 'Xem kết quả và chênh lệch các đợt kiểm kê.'],
    ['Báo cáo', 'Báo cáo tổng hợp, theo bộ phận, đã thanh lý, chênh lệch kiểm kê…'],
    ['**Cảnh báo**', 'Phiếu quá hạn duyệt, **đơn giá bất thường**, tồn âm…'],
], rong=[4.8, 11.7])
t.p('Ô **tìm kiếm** trên cùng tra nhanh mã phiếu, mã tài sản, nhân viên; **chuông** liệt kê việc mới; nút **Cập nhật lúc…** ở mỗi màn hình để tải lại số liệu.')
t.h2('2.3. Màn hình Tổng quan')
t.anh('kt_02_tong_quan', 'Tổng quan – thẻ “Chờ kế toán duyệt” cho biết số phiếu và giá trị đang chờ')

# =====================================================================================================
t.h1('3. Duyệt phiếu tại “Việc cần làm”')
t.p('Đây là màn hình làm việc chính của Kế toán. Mọi phiếu chờ duyệt (NT, NM, BH, TL, TH) được gom về đây, mới nhất ở trên, '
    'phiếu **quá hạn 48 giờ** có vạch đỏ đầu dòng.')
t.anh('kt_03_viec_can_lam', 'Việc cần làm của Kế toán')
t.gach('Thẻ **Chờ Kế toán duyệt**: số phiếu đang chờ, số phiếu mới hôm nay, số phiếu chờ quá 48 giờ.',
       'Thẻ **Quá hạn xử lý**: các phiếu cần ưu tiên ngay.',
       'Tab **Chờ duyệt** lọc riêng phiếu của Kế toán; ô *Loại việc* và *Thời hạn* (Quá hạn 48 giờ / Phát sinh hôm nay) để lọc thêm.')
t.h2('3.1. Duyệt nhanh trên dòng')
t.p('Mỗi dòng có nút **✓ Duyệt** và nút **✕** (từ chối). Dùng khi nội dung ở cột *Nội dung* đã đủ để quyết định.')
t.anh('kt_04_duyet_nhanh', 'Nút Duyệt và Từ chối ngay trên dòng phiếu')
t.buoc('Đọc cột **Nội dung** (tài sản / vật tư, số lượng) và **Đơn vị / Người tạo**.',
       'Bấm **✓ Duyệt** – phiếu biến mất khỏi danh sách, số đếm giảm ngay.')
t.anh('kt_05_sau_duyet_nhanh', 'Sau khi duyệt – phiếu NT máy in đã rời danh sách chờ')
t.h2('3.2. Từ chối nhanh')
t.buoc('Bấm nút **✕** trên dòng phiếu.',
       'Nhập **Lý do từ chối** (bắt buộc) – ghi rõ sai ở đâu và người lập cần làm gì.',
       'Bấm **Từ chối**.')
t.anh('kt_06_tu_choi_nhanh', 'Từ chối phiếu nhập tài sản vì nguyên giá không khớp hoá đơn')
t.p('Người lập phiếu (HCNS) nhận ngay việc **“Nhập tài sản bị từ chối”** trong *Việc cần làm* của họ, mở phiếu để xem lý do.')
t.anh('kt_07_hcns_thay_tu_choi', 'Màn hình của HCNS – phiếu bị Kế toán từ chối')
t.hop('Khi nào KHÔNG nên duyệt nhanh?', 'Khi cần kiểm tra **đơn giá, thành tiền, nhà cung cấp, nguyên giá, số seri** – hãy bấm vào **mã phiếu** để mở chi tiết (chương 4).', 'meo')

# =====================================================================================================
t.h1('4. Kiểm tra và duyệt trong cửa sổ chi tiết')
t.p('Bấm **mã phiếu** ở bất kỳ màn hình nào để mở cửa sổ chi tiết. Cửa sổ hiển thị đầy đủ thông tin, danh sách hàng, **nhật ký xử lý** '
    'và nút **Duyệt / Từ chối** ở cuối (chỉ hiện với Kế toán khi phiếu đang *Chờ KT duyệt*).')

t.h2('4.1. Phiếu nhập mua vật tư tiêu hao (NM)')
t.p('Vào **Cấp phát → Phiếu cấp phát & chuyển kho**. Bấm thẻ **Chờ Kế toán duyệt** để lọc nhanh các phiếu nhập mua chưa vào tồn.')
t.anh('kt_10_cap_phat', 'Màn hình phiếu tiêu hao – thẻ Chờ Kế toán duyệt (khung đỏ)')
t.anh('kt_11_loc_cho_duyet', 'Danh sách phiếu nhập mua đang chờ duyệt kèm giá trị')
t.p('Mở phiếu và đối chiếu với **hoá đơn / chứng từ mua hàng**:')
t.gach('**Nhà cung cấp**, **ngày lập**, **người lập**, ghi chú.',
       'Từng dòng vật tư: **số lượng**, **đơn giá**, **thành tiền** – tổng phải khớp hoá đơn.',
       'Đơn giá có hợp lý so với các lần mua trước không (xem thêm *Cảnh báo → Đơn giá bất thường*, chương 5).')
t.anh('kt_12_popup_nhap_mua', 'Chi tiết phiếu nhập mua – nút Duyệt / Từ chối')
t.p('Bấm **Duyệt** → phiếu chuyển *Đã nhận*, hàng được cộng vào tồn Kho tổng HCNS; nhật ký ghi tên Kế toán và thời điểm duyệt.')
t.anh('kt_13_nhap_mua_da_duyet', 'Phiếu nhập mua sau khi Kế toán duyệt')
t.h3('Từ chối trong cửa sổ chi tiết')
t.buoc('Bấm **Từ chối** ở cuối cửa sổ – ô **Lý do từ chối** hiện ra.',
       'Nhập lý do cụ thể (ví dụ: *đơn giá sai so với hoá đơn*), bấm **Xác nhận: Từ chối**. Bấm **Quay lại** nếu đổi ý.')
t.anh('kt_22_tu_choi_popup', 'Từ chối phiếu nhập mua có đơn giá 700.000đ/ram (sai đơn vị)')
t.anh('kt_23_da_tu_choi', 'Phiếu đã bị từ chối – lý do lưu trong nhật ký')

t.h2('4.2. Phiếu nhập tài sản cố định (NT)')
t.p('Phiếu NT được tạo tự động khi HCNS nhập tài sản mới. Kiểm tra **tên tài sản, nhóm, số seri, nguyên giá, ngày mua, nhà cung cấp, hạn bảo hành** '
    'theo hoá đơn trước khi duyệt.')
t.anh('16_kt_popup_duyet', 'Chi tiết phiếu nhập tài sản cố định')
t.anh('17_kt_da_duyet', 'Sau khi duyệt – tài sản chuyển sang “Trong kho”, sẵn sàng cấp phát')
t.hop('Lưu ý:', 'Từ chối phiếu NT sẽ **vô hiệu hoá** tài sản vừa nhập (không xoá lịch sử). HCNS cần nhập lại tài sản với thông tin đúng – có thể dùng mã khác.', 'luu_y')

t.h2('4.3. Phiếu báo hỏng (BH)')
t.p('Vào menu **Báo hỏng**. Thẻ **Chờ Kế toán duyệt** cho biết số tài sản và nguyên giá đang chờ.')
t.anh('kt_30_bao_hong', 'Màn hình Báo hỏng tài sản')
t.p('Mở phiếu, đọc **mô tả hư hỏng**, người báo, tài sản liên quan. Duyệt khi xác nhận tài sản hỏng thật (có thể yêu cầu ảnh / biên bản từ HCNS).')
t.anh('kt_31_popup_bao_hong', 'Chi tiết phiếu báo hỏng')
t.anh('kt_32_bao_hong_da_duyet', 'Báo hỏng đã duyệt – tài sản thu về Kho tổng HCNS trạng thái Hỏng')
t.p('Sau khi duyệt, HCNS sẽ sửa chữa (đưa về *Trong kho*) hoặc lập đề xuất thanh lý / tiêu hủy để Kế toán duyệt tiếp.')

t.h2('4.4. Thanh lý và tiêu hủy (TL / TH)')
t.p('Vào menu **Thanh lý & tiêu hủy**. Lọc theo năm, loại (thanh lý / tiêu hủy) và tab trạng thái.')
t.anh('kt_40_thanh_ly', 'Màn hình Thanh lý & tiêu hủy')
t.p('Kiểm tra **lý do**, danh sách tài sản và **nguyên giá**. Chỉ tài sản đang nằm trong kho (không ai giữ) mới được đề xuất.')
t.anh('kt_41_popup_thanh_ly', 'Chi tiết đề xuất thanh lý 2 laptop thuê hỏng')
t.anh('kt_42_popup_tieu_huy', 'Chi tiết đề xuất tiêu hủy')
t.p('Sau khi duyệt, phiếu ở trạng thái **KT đã duyệt – chờ hoàn tất**. HCNS xử lý thực tế rồi bấm **Hoàn tất** (thanh lý phải nhập **giá trị thu hồi**). '
    'Thẻ *Giá trị thu hồi (thanh lý)* tổng hợp số tiền thu được trong năm để đối chiếu thu nhập khác.')
t.anh('kt_43_sau_duyet_tl', 'Sau khi duyệt – 2 phiếu chờ HCNS hoàn tất, 1 phiếu đã hoàn tất kèm giá trị thu hồi')

# =====================================================================================================
t.h1('5. Cảnh báo và kiểm soát đơn giá')
t.anh('kt_20_canh_bao', 'Màn hình Cảnh báo')
t.p('Các cảnh báo Kế toán cần theo dõi:')
t.bang(['Cảnh báo', 'Ý nghĩa', 'Kế toán xử lý'], [
    ['Phiếu quá hạn duyệt', 'Phiếu nhập mua / xử lý tài sản chờ Kế toán quá 48 giờ', 'Duyệt hoặc từ chối ngay'],
    ['Đơn giá bất thường', 'Dòng phiếu có đơn giá lệch quá 5 lần giá tham khảo', 'Sửa giá tham khảo, kiểm tra phiếu hoặc bỏ qua'],
    ['Tồn kho âm', 'Vật tư xuất nhiều hơn nhập (thường do dữ liệu cũ)', 'Phối hợp HCNS kiểm kê, lập phiếu điều chỉnh'],
    ['Báo hỏng chờ duyệt', 'Phiếu báo hỏng đang chờ', 'Duyệt / từ chối'],
], rong=[3.8, 7, 5.7])
t.h2('5.1. Xử lý đơn giá bất thường')
t.p('Chọn **Đơn giá bất thường** ở cột trái. Với mỗi dòng, hệ thống so sánh với **giá đa số các lần nhập mua thực tế** và đưa ra **đề xuất**:')
t.anh('kt_21_don_gia_bat_thuong', 'Danh sách đơn giá bất thường kèm đề xuất và nút xử lý')
t.bang(['Đề xuất', 'Nghĩa là', 'Nút'], [
    ['*Giá tham khảo sai – khớp giá nhập thực tế…*', 'Giá tham khảo trong danh mục vật tư bị nhập sai; các phiếu nhập thực tế đều đúng',
     '**Sửa → <giá>**: cập nhật giá tham khảo theo giá thực tế (có lưu lịch sử thay đổi giá)'],
    ['*Giá tham khảo khớp giá nhập thực tế – đơn giá trên phiếu nghi nhập sai*', 'Riêng phiếu này có đơn giá lệch', '**Xem phiếu**: mở phiếu để đối chiếu chứng từ (hệ thống **không tự sửa** chứng từ đã duyệt)'],
    ['*Giá các lần nhập không thống nhất*', 'Chưa đủ căn cứ để kết luận', 'Kiểm tra thủ công; **Bỏ qua** nếu đã xác minh là đúng'],
], rong=[5, 5, 6.5])
t.gach('Nút **Áp dụng đề xuất sửa giá (n vật tư)** ở đầu bảng sửa giá tham khảo cho tất cả vật tư có đề xuất *Sửa* trong một lần.',
       '**Bỏ qua**: ẩn dòng đã kiểm tra là đúng (vd đơn vị tính khác) – có thể hoàn tác. Chỉ loại cảnh báo *theo dõi* mới bỏ qua được.',
       'Phiếu nhập mua đã bị Kế toán từ chối **không** bị tính vào cảnh báo đơn giá.')
t.hop('Phòng ngừa:', 'Đơn giá bất thường thường do nhầm đơn vị tính (ram / thùng, cái / hộp) hoặc thêm/bớt số 0. '
      'Khi duyệt phiếu nhập mua, luôn so **đơn giá với giá tham khảo** và hoá đơn.', 'meo')

# =====================================================================================================
t.h1('6. Tra cứu và đối chiếu số liệu')
t.h2('6.1. Danh mục tài sản cố định')
t.p('**Tài sản → Danh mục tài sản cố định**: tra cứu toàn bộ tài sản, nguyên giá, vị trí / người giữ, trạng thái. Kế toán **chỉ xem**, '
    'không sửa; dùng **Xuất Excel** để đối chiếu sổ tài sản.')
t.anh('kt_50_ds_tai_san', 'Danh mục tài sản cố định (chế độ xem của Kế toán)')
t.p('Các tab trạng thái (*Trong kho, Đang cấp phát, Hỏng, Chờ thanh lý, Chờ tiêu hủy, Đã thanh lý…*) giúp đối chiếu nhanh số lượng và giá trị theo từng nhóm.')
t.h2('6.2. Kho và tồn kho tiêu hao')
t.anh('kt_51_kho_ton', 'Kho & tồn – tồn tài sản và tiêu hao theo từng kho')
t.anh('kt_52_ton_tieu_hao', 'Tồn kho tiêu hao – số lượng, giá trị theo giá tham khảo, tồn âm')
t.p('Giá trị tồn tiêu hao tính theo **giá tham khảo** của vật tư – vì vậy giá tham khảo đúng rất quan trọng (xem 5.1).')
t.h2('6.3. Điều chuyển và kiểm kê')
t.anh('kt_53_dieu_chuyen', 'Lịch sử phiếu giao nhận tài sản cố định')
t.anh('kt_54_kiem_ke', 'Các đợt kiểm kê – mở đợt để xem kết quả và chênh lệch')

# =====================================================================================================
t.h1('7. Báo cáo')
for ten, ct, mo_ta in [
    ('kt_60_bao_cao', 'Báo cáo tổng hợp', 'Tài sản theo trạng thái, theo kho, tồn tiêu hao, số phiếu đang chờ – dùng cho báo cáo định kỳ.'),
    ('kt_61_bao_cao', 'Báo cáo theo bộ phận', 'Số nhân viên, số tài sản và tổng giá trị theo từng bộ phận – phục vụ phân bổ chi phí.'),
    ('kt_62_bao_cao', 'Tài sản đã thanh lý / tiêu hủy', 'Danh sách tài sản đã ghi giảm, hình thức, nguyên giá và giá trị thu hồi.'),
    ('kt_63_bao_cao', 'Chênh lệch kiểm kê', 'Toàn bộ chênh lệch (thiếu, thừa, hỏng, sai người giữ) qua các đợt kiểm kê.'),
]:
    t.h3(ct)
    t.p(mo_ta)
    t.anh(ten, ct)

# =====================================================================================================
t.h1('8. Tài sản của tôi')
t.p('Như mọi nhân viên, Kế toán có màn **Tài sản → Tài sản của tôi** để xem tài sản mình đang giữ, xác nhận đã nhận khi được cấp phát '
    'và báo hỏng tài sản của mình.')
t.anh('kt_70_tai_san_cua_toi', 'Màn hình Tài sản của tôi')

# =====================================================================================================
t.h1('9. Câu hỏi thường gặp')
t.bang(['Tình huống', 'Cách xử lý'], [
    ['Không thấy nút Duyệt trong phiếu', 'Phiếu không còn ở trạng thái *Chờ KT duyệt* (đã được xử lý), hoặc tài khoản chưa có vai trò Kế toán – liên hệ Admin.'],
    ['“Phiếu đã được xử lý bởi người khác”', 'Một Kế toán / Admin khác vừa xử lý phiếu – bấm *Cập nhật lúc…* để tải lại.'],
    ['Duyệt nhầm phiếu', 'Hệ thống không hoàn tác duyệt. Báo HCNS lập phiếu điều chỉnh (vd chuyển kho / báo hỏng / thanh lý) và ghi rõ lý do.'],
    ['Phiếu nhập mua có đơn giá sai', 'Từ chối kèm lý do; HCNS lập lại phiếu đúng. Không duyệt rồi sửa sau.'],
    ['Giá trị tồn tiêu hao không hợp lý', 'Kiểm tra *Cảnh báo → Đơn giá bất thường*, sửa giá tham khảo sai.'],
    ['Phiếu cũ từ AppSheet (mã ID-…) vẫn chờ duyệt', 'Đối chiếu chứng từ gốc rồi duyệt hoặc từ chối như phiếu mới.'],
    ['Cần số liệu ra Excel', 'Dùng nút **Xuất Excel** ở danh mục tài sản, phiếu tiêu hao, báo cáo – xuất theo đúng bộ lọc đang chọn.'],
], rong=[5.5, 11])

t.h1('10. Phụ lục')
t.h2('10.1. Trạng thái phiếu')
t.bang(['Trạng thái', 'Ý nghĩa'], [
    ['Chờ KT duyệt', 'Đang chờ Kế toán quyết định'],
    ['KT từ chối', 'Kế toán không duyệt – xem lý do trong nhật ký'],
    ['KT đã duyệt', 'Thanh lý / tiêu hủy đã duyệt, chờ HCNS hoàn tất'],
    ['Đã nhận / Hoàn tất', 'Phiếu đã kết thúc, số liệu đã ghi nhận'],
], rong=[4.5, 12])
t.h2('10.2. Công việc định kỳ của Kế toán')
t.bang(['Tần suất', 'Việc cần làm'], [
    ['Hằng ngày', 'Mở **Việc cần làm** → tab *Chờ duyệt*, xử lý hết phiếu (ưu tiên quá hạn 48 giờ).'],
    ['Hằng tuần', 'Rà **Cảnh báo → Đơn giá bất thường**, sửa giá tham khảo sai; theo dõi phiếu thanh lý *KT đã duyệt* chưa hoàn tất.'],
    ['Hằng tháng', 'Xuất **Báo cáo tổng hợp**, **theo bộ phận**, danh mục tài sản ra Excel để đối chiếu sổ kế toán; đối chiếu nhập mua trong tháng với hoá đơn.'],
    ['Cuối năm / sau kiểm kê', 'Xem **Chênh lệch kiểm kê**, **Đã thanh lý / tiêu hủy** và giá trị thu hồi để ghi giảm tài sản.'],
], rong=[3.8, 12.7])

ra = GOC + 'docs/Huong_dan_su_dung_CCDC_3T_Ke_toan.docx'
t.luu(ra)
print('Da tao', ra, 'so hinh', t.so_hinh)
