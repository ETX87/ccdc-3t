# Tao tai lieu "Huong dan su dung CCDC 3T - vai tro QUAN LY" (DOCX).
#   1) python nap_ql_nv.py (worker tat) ; bat worker ; python chup_ql_nv.py chuan_bi ql_giao_dien ql_nhan_hang ql_cap_phat
#      ql_tra_hang ql_nhom ql_khac nv_giao_dien nv_xac_nhan nv_tai_san nv_bao_hong nv_mobile
#   2) python tao_docx_quan_ly.py ; powershell -File cap_nhat_word.ps1 -Docx <duong dan docx>
from docx_lib import TaiLieu

ANH = 'F:/claude/QLBH 3T/.wrangler/huong_dan/anh/'
GOC = 'F:/claude/QLBH 3T/CCDC 3T/'
URL = 'https://ccdc.dichvu3t.workers.dev'

t = TaiLieu(ANH)
t.bia(
    GOC + 'frontend/public/icon-512.png',
    'HƯỚNG DẪN SỬ DỤNG\nHỆ THỐNG QUẢN LÝ CÔNG CỤ DỤNG CỤ',
    'Tài liệu đào tạo dành cho vai trò Quản lý (trưởng nhóm)',
    [f'Địa chỉ truy cập: **{URL}**', 'Phiên bản 1.0 – Tháng 10/2026', 'Công ty 3T – Lưu hành nội bộ'],
)
t.chan_trang('Hướng dẫn sử dụng CCDC 3T – Vai trò Quản lý')
t.muc_luc()

# =====================================================================================================
t.h1('1. Giới thiệu')
t.h2('1.1. Mục đích tài liệu')
t.p('Tài liệu hướng dẫn **Quản lý / trưởng nhóm** sử dụng hệ thống **3T Asset Management** để nhận hàng về kho nhóm, '
    'cấp phát vật tư tiêu hao cho nhân viên, theo dõi tài sản của cả nhóm, điều chuyển tài sản giữa các thành viên và báo hỏng.')
t.p('Hình minh họa được chụp trực tiếp từ hệ thống. Các mục có chữ *“(đào tạo)”* (quản lý *Phạm Văn Quản Lý (đào tạo)*, nhân viên '
    '*Lê Văn Nhân Viên (đào tạo)*, *Hoàng Thị Kỹ Thuật (đào tạo)*, tài sản *TS3T-DT-…*, vật tư *Giấy A4 Double A (đào tạo)*) là dữ liệu mẫu.')

t.h2('1.2. Vai trò Quản lý trong hệ thống')
t.p('Mỗi Quản lý có **một kho riêng** tên *Kho QL – <tên quản lý>* và tự động là **thủ kho** của kho này. '
    '**Nhóm** của Quản lý gồm các nhân viên có *quản lý trực tiếp* là mình theo sơ đồ nhân sự ETX (đồng bộ hằng ngày).')
t.bang(['Quản lý ĐƯỢC làm', 'Quản lý KHÔNG làm'], [
    ['Nhận hàng tiêu hao HCNS / kho miền chuyển về kho nhóm', 'Nhập mua hàng, nhập tài sản mới (việc của HCNS)'],
    ['Cấp phát vật tư từ kho nhóm cho **bản thân và cấp dưới trực tiếp**', 'Cấp phát cho nhân viên ngoài nhóm'],
    ['Trả hàng dư về **Kho tổng HCNS** hoặc **kho miền**', 'Chuyển hàng sang kho Quản lý khác'],
    ['Điều chuyển tài sản cố định **giữa các thành viên trong nhóm**', 'Duyệt phiếu (việc của Kế toán), thanh lý / tiêu hủy'],
    ['Báo hỏng tài sản của mình và của nhóm', 'Sửa danh mục tài sản, vật tư'],
    ['Xem tổng quan, báo cáo, cảnh báo **trong phạm vi kho và nhóm mình**', 'Xem số liệu của nhóm / kho khác'],
], rong=[8.25, 8.25])
t.hop('Nguyên tắc:', ['Mọi phiếu đều có **người nhận xác nhận** – hàng / tài sản giao cho ai thì người đó bấm *Đã nhận* trên tài khoản của mình.',
                      'Thời gian trong hệ thống theo **giờ Việt Nam**. Việc chờ quá **48 giờ** bị đánh dấu quá hạn.'], 'luu_y')

t.h2('1.3. Mã phiếu')
t.bang(['Tiền tố', 'Loại phiếu'], [
    ['**CK**', 'Chuyển kho vật tư tiêu hao (kho → kho)'],
    ['**CP**', 'Cấp phát vật tư tiêu hao cho nhân viên'],
    ['**GN**', 'Giao nhận tài sản cố định (cấp phát, thu hồi, điều chuyển)'],
    ['**BH**', 'Báo hỏng tài sản'],
], rong=[3, 13.5])
t.p('Ví dụ `CK-2610-0002` là phiếu chuyển kho số 2 của tháng 10/2026. Bấm vào mã (chữ xanh) ở bất kỳ đâu để mở chi tiết phiếu.')

# =====================================================================================================
t.h1('2. Đăng nhập và giao diện')
t.h2('2.1. Đăng nhập')
t.buoc(f'Truy cập **{URL}** bằng máy tính hoặc điện thoại.',
       'Bấm **Đăng nhập bằng Google**, chọn **Gmail cá nhân đã khai báo trên ETX nhân sự**.',
       'Tài khoản được hệ thống tự cấp từ ETX. Vai trò **Quản lý** do Admin gán; kho nhóm do HCNS tạo. Nếu chưa thấy menu *Nhóm của tôi*, liên hệ HCNS.')
t.anh('01_dang_nhap', 'Màn hình đăng nhập', cat=(700, 370, 1460, 980), rong=9)
t.p('Trên điện thoại có thể bấm **Cài đặt ứng dụng** (cuối menu) để thêm biểu tượng 3T Asset ra màn hình chính, mở như ứng dụng.')

t.h2('2.2. Giao diện của Quản lý')
t.anh('ql_01_giao_dien', 'Giao diện chính của Quản lý (menu bên trái)')
t.bang(['Mục menu', 'Quản lý dùng để'], [
    ['Tổng quan', 'Số tài sản, giá trị, luồng tài sản và việc cần xử lý của kho / nhóm mình.'],
    ['**Việc cần làm**', 'Phiếu chờ mình nhận, chờ xác nhận – xử lý ngay trên dòng.'],
    ['Tài sản → **Nhóm của tôi**', 'Thành viên nhóm, tài sản từng người đang giữ, điều chuyển / báo hỏng.'],
    ['Tài sản → Tài sản của tôi', 'Tài sản và vật tư chính Quản lý đang giữ (giống nhân viên).'],
    ['Kho & tồn', 'Tồn kho của kho nhóm.'],
    ['**Cấp phát**', 'Nhận hàng về kho, cấp phát cho nhân viên, trả hàng về HCNS; xem tồn tiêu hao.'],
    ['Điều chuyển', 'Lịch sử giao nhận tài sản cố định của nhóm.'],
    ['Báo hỏng', 'Báo hỏng tài sản, theo dõi phiếu báo hỏng.'],
    ['Báo cáo, Cảnh báo', 'Báo cáo theo nhân viên / bộ phận, cảnh báo quá hạn – trong phạm vi nhóm.'],
], rong=[4.8, 11.7])
t.p('Ô **tìm kiếm** trên cùng tra nhanh mã phiếu, mã tài sản, nhân viên; **Quét QR** để mở tài sản bằng camera; **chuông** liệt kê việc mới; '
    'nút **Cập nhật lúc…** ở mỗi màn để tải lại số liệu.')

t.h2('2.3. Tổng quan và Việc cần làm')
t.anh('ql_02_tong_quan', 'Tổng quan tài sản trong phạm vi kho và nhóm của Quản lý')
t.anh('ql_03_viec_can_lam', 'Việc cần làm – phiếu chuyển kho đang chờ Quản lý nhận, có nút Nhận / ✕ ngay trên dòng')
t.p('Mở **Việc cần làm** đầu mỗi ngày. Số đỏ trên menu là số việc đang chờ. Bấm **Nhận** để nhận nhanh, **✕** để từ chối (nhập lý do), '
    'hoặc bấm mã phiếu để xem kỹ trước khi quyết định.')

# =====================================================================================================
t.h1('3. Nhận hàng về kho nhóm')
t.p('Khi HCNS (hoặc kho miền) chuyển vật tư tiêu hao cho nhóm, hệ thống tạo phiếu **Chuyển kho (CK)** trạng thái *Đang chuyển*. '
    'Hàng đã trừ khỏi kho nguồn nhưng **chỉ cộng vào kho nhóm khi Quản lý xác nhận đã nhận**.')
t.buoc('Vào **Cấp phát → Phiếu cấp phát & chuyển kho** (hoặc *Việc cần làm*). Phiếu chờ nhận có trạng thái **Đang chuyển**.',
       'Bấm **mã phiếu** để mở chi tiết, **kiểm đếm hàng thực tế** với danh sách vật tư và số lượng.',
       'Đủ hàng → bấm **Xác nhận đã nhận**. Thiếu / sai hàng → bấm **Từ chối nhận**, ghi rõ lý do (vd *thiếu 5 ram*).')
t.anh('ql_10_phieu_cho_nhan', 'Phiếu chuyển kho đang chờ nhận (khung đỏ)')
t.anh('ql_11_popup_nhan', 'Chi tiết phiếu – kiểm đếm rồi Xác nhận đã nhận hoặc Từ chối nhận')
t.anh('ql_12_da_nhan', 'Sau khi nhận: phiếu chuyển “Đã nhận”, hàng vào tồn kho nhóm, nhật ký ghi người nhận và thời điểm')
t.hop('Khi từ chối nhận', 'Phiếu chuyển trạng thái *Bị từ chối*, hàng **tự hoàn về kho nguồn**. Người lập phiếu thấy lý do trong nhật ký và lập lại phiếu đúng.', 'info')
t.h2('3.1. Xem tồn kho nhóm')
t.p('**Cấp phát → Tồn kho tiêu hao** (hoặc nút **Tồn kho nhóm** ở *Nhóm của tôi*) cho biết từng vật tư còn bao nhiêu trong kho nhóm, giá trị theo giá tham khảo.')
t.anh('ql_13_ton_kho', 'Tồn kho tiêu hao của kho nhóm')
t.anh('ql_41_kho', 'Kho & tồn – tổng hợp tồn tài sản và tiêu hao của kho nhóm')

# =====================================================================================================
t.h1('4. Cấp phát vật tư cho nhân viên')
t.p('Kho Quản lý **chỉ cấp cho bản thân Quản lý và nhân viên cấp dưới trực tiếp**. Hàng **trừ khỏi kho nhóm ngay** khi lập phiếu; '
    'nhân viên nhận hàng và bấm *Đã nhận* trên tài khoản của họ để xác nhận.')
t.buoc('Vào **Cấp phát → Phiếu cấp phát & chuyển kho**, bấm **Cấp phát NV** (hoặc nút **Cấp phát tiêu hao** ở *Nhóm của tôi*).')
t.anh('ql_20_nut_cap_phat', 'Nút Cấp phát NV (khung đỏ)')
t.buoc('**Kho nguồn**: chọn kho nhóm (*Kho QL – …*).',
       '**Người nhận**: gõ tên hoặc mã nhân viên rồi chọn trong danh sách gợi ý (chỉ hiện người trong nhóm).',
       '**Hàng hoá**: gõ tên vật tư (danh sách có kèm số tồn), nhập **số lượng**. Bấm **+ Thêm dòng** để cấp nhiều loại trong một phiếu.',
       'Nhập **Ghi chú** (mục đích sử dụng), đính kèm ảnh / chứng từ nếu có (xem chương 7), bấm **Lập phiếu**.')
t.anh('ql_21_form_cap_phat', 'Phiếu cấp phát vật tư cho nhân viên trong nhóm')
t.anh('ql_22_sau_cap_phat', 'Phiếu CP đã lập – trạng thái “Đã giao”, chờ nhân viên xác nhận')
t.hop('Lưu ý:', ['Hệ thống **không cho cấp vượt tồn** – nếu báo *Số lượng xuất vượt tồn kho nguồn*, kiểm tra lại tồn hoặc đề nghị HCNS chuyển thêm hàng.',
                 'Theo dõi dòng *NV xác nhận* trong chi tiết phiếu để biết nhân viên đã bấm nhận chưa.'], 'luu_y')

# =====================================================================================================
t.h1('5. Trả hàng về kho HCNS / kho miền')
t.p('Hàng dư, hàng không dùng đến được trả về **Kho tổng HCNS** hoặc **kho miền** bằng phiếu **Chuyển kho**. Kho Quản lý không chuyển sang kho Quản lý khác.')
t.buoc('Vào **Cấp phát → Phiếu cấp phát & chuyển kho**, bấm **Chuyển kho**.',
       '**Kho nguồn** là kho nhóm; **Kho đích** chọn *Kho tổng HCNS* hoặc kho miền.',
       'Chọn vật tư, số lượng, ghi chú lý do trả, bấm **Lập phiếu**.')
t.anh('ql_23_form_tra_hang', 'Phiếu trả giấy in dư về Kho tổng HCNS')
t.anh('ql_24_sau_tra_hang', 'Phiếu trả hàng đang chuyển – chờ thủ kho HCNS xác nhận nhận')
t.p('Hàng trừ khỏi kho nhóm ngay; thủ kho đích xác nhận nhận thì hàng mới vào kho đích. Nếu bên nhận từ chối, hàng tự hoàn về kho nhóm.')

# =====================================================================================================
t.h1('6. Nhóm của tôi – quản lý tài sản của nhóm')
t.p('**Tài sản → Nhóm của tôi** là màn hình chính để Quản lý theo dõi nhóm:')
t.anh('ql_30_nhom', 'Nhóm của tôi – thành viên, số tài sản từng người giữ, tồn kho nhóm')
t.gach('**Cấp dưới trực tiếp**: số thành viên theo sơ đồ quản lý ETX.',
       '**Tài sản nhóm đang giữ**: tổng tài sản cố định của Quản lý và cấp dưới.',
       '**Tồn tiêu hao kho nhóm**: giá trị vật tư còn trong kho nhóm.',
       '**Cấp dưới chưa có tài khoản**: nhân viên chưa đăng nhập hệ thống – họ **không tự xác nhận nhận hàng được**, cần đăng nhập bằng Gmail khai báo trên ETX.')
t.p('Bấm vào **một thành viên** ở bảng bên trái để xem tài sản người đó đang giữ ở bảng bên phải.')

t.h2('6.1. Điều chuyển tài sản trong nhóm')
t.p('Dùng khi bàn giao tài sản từ người này sang người khác **trong cùng nhóm** (vd nhân viên nghỉ phép, đổi ca, đổi địa bàn).')
t.buoc('Chọn người đang giữ ở bảng thành viên; ở dòng tài sản bấm **Điều chuyển**.')
t.anh('ql_31_tai_san_thanh_vien', 'Nút Điều chuyển và Báo hỏng trên từng tài sản')
t.buoc('Chọn **Chuyển cho** (thành viên nhận), ghi chú lý do / tình trạng khi bàn giao, bấm **Lập phiếu điều chuyển**.')
t.anh('ql_32_dieu_chuyen_nhom', 'Lập phiếu điều chuyển máy khoan cho nhân viên trong nhóm')
t.anh('ql_33_sau_dieu_chuyen', 'Tài sản đã chuyển sang người nhận – chờ người nhận xác nhận')
t.p('Tài sản chuyển sang người nhận ngay; người nhận bấm **Đã nhận** trong *Việc cần làm* / *Tài sản của tôi* để xác nhận đã cầm tài sản. '
    'Muốn trả tài sản về kho (thu hồi) hoặc chuyển ra ngoài nhóm, liên hệ HCNS.')

t.h2('6.2. Báo hỏng tài sản của nhóm')
t.p('Bấm **Báo hỏng** ở dòng tài sản (hoặc mở tài sản → *Báo hỏng*), nhập mô tả hư hỏng, bấm **Gửi báo hỏng**, sau đó **đính kèm ảnh hư hỏng** vào phiếu (chương 7). '
    'Phiếu chờ Kế toán duyệt; duyệt xong tài sản được thu về Kho tổng HCNS để sửa / thanh lý. Chi tiết thao tác xem tài liệu hướng dẫn **Nhân viên**, mục *Báo hỏng*.')

t.h2('6.3. Lịch sử điều chuyển')
t.anh('ql_40_dieu_chuyen', 'Điều chuyển – lịch sử giao nhận tài sản cố định của nhóm')

# =====================================================================================================
t.h1('7. Đính kèm hóa đơn, chứng từ, ảnh')
t.p('Mỗi phiếu và mỗi tài sản có khung **Hóa đơn, chứng từ & ảnh**. Tệp được lưu trên Google Drive của công ty, ai có quyền xem phiếu đều xem được.')
t.bang(['Thao tác', 'Cách làm'], [
    ['Thêm khi lập phiếu', 'Ở mục **Đính kèm hóa đơn, chứng từ, ảnh** cuối form: chọn loại tệp, bấm **Chụp ảnh** (điện thoại) hoặc **Chọn tệp**. Tệp tải lên sau khi bấm *Lập phiếu*.'],
    ['Thêm sau khi lập', 'Mở phiếu (bấm mã phiếu) → khung *Hóa đơn, chứng từ & ảnh* → chọn loại → **Chụp ảnh** / **Chọn tệp**.'],
    ['Nhiều tệp', 'Chọn nhiều tệp một lần; muốn loại khác (Hóa đơn / Chứng từ / Ảnh bằng chứng / Khác) thì đổi ô loại rồi chọn tiếp.'],
    ['Xem', 'Bấm vào ảnh nhỏ để mở bản đầy đủ trên Google Drive.'],
    ['Xoá', 'Nút **×** trên ảnh – chỉ người đã tải lên (hoặc HCNS / Admin) xoá được.'],
], rong=[3.8, 12.7])
t.p('Chỉ nhận **ảnh** hoặc **PDF**, tối đa 10MB/tệp; ảnh chụp điện thoại được tự thu nhỏ trước khi tải. Ví dụ khi nhận hàng, chụp ảnh **biên bản giao nhận** có chữ ký và đính kèm loại *Chứng từ*.')
t.anh('nv_33_dinh_kem_bao_hong', 'Ảnh bằng chứng đính kèm phiếu báo hỏng')

# =====================================================================================================
t.h1('8. Báo cáo và cảnh báo của nhóm')
t.anh('ql_42_bao_cao_nv', 'Báo cáo theo nhân viên – số tài sản, tài sản hỏng, nguyên giá từng người trong nhóm')
t.p('Các báo cáo khác: **Tổng hợp**, **Theo bộ phận**, **Sắp hết bảo hành**… – đều chỉ tính trong phạm vi kho và nhóm của Quản lý; nút **Xuất Excel** xuất đúng bộ lọc đang chọn.')
t.anh('ql_43_canh_bao', 'Cảnh báo trong phạm vi kho / nhóm: tài sản chờ bàn giao quá 48 giờ, tồn kho âm, báo hỏng chờ duyệt…')

# =====================================================================================================
t.h1('9. Tài sản của tôi')
t.p('Quản lý cũng là nhân viên: tài sản và vật tư chính mình đang giữ nằm ở **Tài sản → Tài sản của tôi** – xác nhận đã nhận, xem chứng từ, báo hỏng, '
    'thao tác giống hệt nhân viên (xem tài liệu hướng dẫn **Nhân viên**).')

# =====================================================================================================
t.h1('10. Câu hỏi thường gặp')
t.bang(['Tình huống', 'Cách xử lý'], [
    ['Không thấy menu *Nhóm của tôi*', 'Sơ đồ quản lý trên ETX chưa ghi mình là quản lý trực tiếp của ai – báo HCNS cập nhật ETX (hệ thống đồng bộ hằng ngày).'],
    ['Không thấy nút *Cấp phát NV*', 'Chưa có kho nhóm – đề nghị HCNS tạo *Kho QL* cho mình.'],
    ['Người nhận không có trong danh sách', 'Kho Quản lý chỉ cấp cho cấp dưới trực tiếp. Người khác nhóm phải nhận từ kho HCNS / kho miền.'],
    ['“Số lượng xuất vượt tồn kho nguồn”', 'Tồn kho nhóm không đủ – kiểm tra *Tồn kho tiêu hao*, đề nghị HCNS chuyển thêm.'],
    ['Nhân viên chưa có tài khoản nên không xác nhận được', 'Nhân viên đăng nhập bằng Gmail đã khai trên ETX; nếu ETX chưa có Gmail, báo HCNS bổ sung.'],
    ['Cấp nhầm người / nhầm số lượng', 'Phiếu đã lập không sửa được. Liên hệ HCNS để lập phiếu điều chỉnh, ghi rõ lý do.'],
    ['Phiếu chuyển về kho bị thiếu hàng', 'Không bấm nhận – bấm **Từ chối nhận** kèm lý do, hoặc liên hệ người lập phiếu trước khi nhận.'],
], rong=[5.5, 11])

t.h1('11. Phụ lục – công việc định kỳ của Quản lý')
t.bang(['Tần suất', 'Việc cần làm'], [
    ['Hằng ngày', 'Mở **Việc cần làm**: nhận hàng chuyển về kho, xác nhận tài sản được giao, xử lý việc quá hạn.'],
    ['Khi cấp hàng', 'Lập phiếu **Cấp phát NV** đúng người, đúng số lượng; nhắc nhân viên bấm *Đã nhận*.'],
    ['Hằng tuần', 'Xem **Nhóm của tôi** và **Cảnh báo**: tài sản hỏng chưa báo, phiếu nhân viên chưa xác nhận, tồn kho nhóm.'],
    ['Khi nhân viên nghỉ / chuyển', 'Điều chuyển tài sản cho người khác trong nhóm hoặc báo HCNS thu hồi về kho **trước** ngày nghỉ.'],
], rong=[3.8, 12.7])

ra = GOC + 'docs/Huong_dan_su_dung_CCDC_3T_Quan_ly.docx'
t.luu(ra)
print('Da tao', ra, 'so hinh', t.so_hinh)
