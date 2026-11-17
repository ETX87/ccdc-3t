# SRS tổng hợp — App CCDC 3T

> Đặc tả yêu cầu **đã chốt** (theo code + `CLAUDE.md` tới 17/11/2026). Logic chi tiết: `TONG_HOP_LOGIC.md`.

## 1. Mục tiêu

Quản lý tập trung công cụ dụng cụ của nhiều pháp nhân: biết tài sản nào đang ở đâu / ai giữ, tồn vật tư từng kho, mọi lần
nhập – xuất – điều chuyển có chứng từ và người chịu trách nhiệm, cảnh báo kịp thời khi chậm xử lý hoặc tồn thấp.

## 2. Người dùng

Admin, Kế toán, HCNS, Quản lý, Thủ kho, Nhân viên (quyền ở `TONG_HOP_LOGIC.md` §3). Đăng nhập Google; tài khoản nhân viên
tự tạo từ ETX.

## 3. Màn hình (menu 2 lớp)

| Nhóm | Màn hình | Yêu cầu chính |
|---|---|---|
| Trên cùng | Tổng quan | KPI thật từ dữ liệu (không số trang trí), so với kỳ trước khi có số liệu |
| | Việc cần làm | Việc theo người (nhận hàng, duyệt, xử lý từ chối), quá 48 giờ nổi bật |
| | Cảnh báo | Danh sách cảnh báo, bỏ qua / hoàn tác với loại theo dõi |
| Tài sản cố định | Danh mục TS, Giao nhận TS, Xử lý TS (báo hỏng / thanh lý / tiêu huỷ), Kiểm kê, Tài sản của tôi | Mã tự sinh, QR, lịch sử từng tài sản |
| Vật tư tiêu hao | Danh mục vật tư, Nhập mua, Cấp phát tiêu hao (chuyển kho / cấp NV / tiêu dùng VP, import Excel), Điều chỉnh | Tồn tối thiểu, đơn giá tham khảo |
| Kho | Kho & tồn, Tồn theo kho (ma trận), Thẻ kho, Nhập – xuất – tồn theo kỳ | Chọn kỳ ngày / tháng / năm |
| Báo cáo | Tiêu dùng văn phòng, Theo công ty, Báo cáo email định kỳ | Xuất Excel |
| Cấu hình | Công ty (pháp nhân), Kho, Nhân viên (đồng bộ ETX, đổi mã / gộp), Tài khoản & phân quyền, Kết nối Drive / Gmail | |

- Popup chi tiết (phiếu, tài sản, vật tư, nhân viên) 95% màn hình, mở chồng nhau; có **luồng quy trình ngang** + nút "Xem chi tiết";
  mọi tên người / mã phiếu / tài sản trong popup bấm được.
- Tìm kiếm trên cùng: nhân viên, tài sản, vật tư, phiếu.

## 4. Yêu cầu chung

- Mọi bảng phân trang 50 dòng (bảng lớn phân trang ở server); bảng mới dùng bảng kiểu Excel `BangLoc` (lọc + sắp xếp trên tiêu đề).
- Không dùng hộp thoại trình duyệt (`prompt/alert/confirm`), dùng Modal.
- Đa ngôn ngữ VI / EN / ID; PWA cài được lên điện thoại; quét QR cần HTTPS, luôn có ô nhập mã tay.
- Mọi thời gian theo giờ Việt Nam; nút Back đóng popup trước rồi mới về màn trước.
- Thay đổi chứng từ đã duyệt không tự sửa — chỉ qua phiếu điều chỉnh có duyệt.
