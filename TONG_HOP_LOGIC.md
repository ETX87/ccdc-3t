# Tổng hợp logic — App CCDC 3T (quản lý công cụ, dụng cụ)

> Mô tả logic **đang chạy thật** (theo code + `CLAUDE.md` tới 17/11/2026). `CLAUDE.md` giữ chi tiết kỹ thuật (tên hàm, bảng,
> lý do từng quyết định); file này là bản tóm tắt nghiệp vụ. Logic đổi thì sửa đè đúng mục; lịch sử ở `nhat_ky_lam_viec.md`.
> Không ghi tài khoản, mật khẩu, khoá.

## 1. Hệ thống là gì

- Quản lý **tài sản cố định (TSCĐ, theo từng chiếc)** và **vật tư tiêu hao (theo số lượng tồn)** của công ty 3T và các pháp nhân
  khác (NSKX…). Worker `ccdc` (Hono) + D1 `ccdc-db` + giao diện React; Google OAuth dùng chung với các app QLBH khác.
- Chứng từ đính kèm (hoá đơn, ảnh bằng chứng) lưu Google Drive; báo cáo email gửi qua Gmail API.

## 2. Đa pháp nhân (công ty)

- Bảng `cong_ty` (3T mặc định, NSKX…). Kho, danh mục vật tư, nhóm TS, tài sản, nhân viên, đợt kiểm kê đều RIÊNG từng công ty.
- Người dùng xem công ty: Admin = mọi công ty; còn lại = công ty được gán ∪ công ty hồ sơ NV ∪ công ty kho mình làm thủ kho.
  Đang xem công ty nào thì **mọi dữ liệu (cả việc cần làm) theo công ty đó** (chọn ở thanh trên).
- Nhân viên có 1 công ty chính + công ty **kiêm nhiệm**. Chuyển giao cho NV công ty khác: người có quyền ở công ty nhận
  (HCNS/Admin hoặc thủ kho / phụ trách kho của công ty đó) thêm kiêm nhiệm ngay trong form.
- Chuyển hàng / TS giữa 2 công ty phải qua **Kế toán công ty nguồn duyệt** trước khi trừ tồn / chuyển TS; vật tư được ghép
  theo tên + ĐVT trong danh mục công ty nhận (thiếu thì tạo mới).
- Tên kho / NV hiển thị kèm nhãn công ty: "[3T] Kho …", "[3T·NSKX] Tên".

## 3. Vai trò & quyền

| Vai trò | Quyền chính |
|---|---|
| Admin | Toàn quyền mọi công ty |
| Kế toán | Duyệt nhập mua, báo hỏng, thanh lý, tiêu huỷ, điều chỉnh tồn, chuyển giữa công ty |
| HCNS | Danh mục, kho, lập nhập mua, đề xuất xử lý TS, quản lý nhân viên, báo cáo email |
| Quản lý | Kho QL của mình (tự là thủ kho), cấp cho nhóm cấp dưới |
| Nhân viên | Tài sản / vật tư của chính mình, xác nhận nhận hàng |
| Thủ kho | Gán theo kho (`kho_thu_kho`), độc lập vai trò |
| Quyền thêm "Xem tồn toàn công ty" | Chỉ ĐỌC tồn mọi kho của công ty được xem |

- **Xuất ≠ nhận**: kho được lập phiếu xuất (`khoPhuTrach`) khác kho được xác nhận / từ chối nhận (`khoNhanHang`).
- **Không tự duyệt**: người lập / đề xuất không được Kế toán-duyệt phiếu của chính mình (kể cả Admin).
- Mọi kiểm quyền theo kho / nhóm làm ở server, không tin `kho_id` client gửi.

## 4. Mô hình kho

`Mua hang` (nguồn ảo, không tính tồn) → `HCNS` (kho tổng) → `Mien` / `Trung chuyen` (văn phòng nhận rồi phát) → `Quan ly`
(1 kho / QL / công ty) → Nhân viên. Loại `Tieu hao` = điểm tiêu dùng văn phòng (VPP, vệ sinh…), không tính tồn.
Đổi loại kho QL ↔ Miền ↔ Trung chuyển giữ nguyên id, tồn, lịch sử. Tồn vật tư tính động qua view `v_ton_kho`.

## 5. Chứng từ & luồng

| Phiếu (mã) | Luồng |
|---|---|
| Nhập mua (NM) | HCNS lập → Kế toán duyệt → vào kho |
| Chuyển kho (CK) / Cấp phát NV (CP) | Kho nguồn lập → (khác công ty: KT công ty nguồn duyệt) → trừ tồn "Đang chuyển" → kho / NV nhận xác nhận hoặc từ chối |
| Xuất tiêu dùng VP | Vào kho Tiêu hao → giao + xác nhận ngay |
| Giao nhận TSCĐ (GN) | Cấp phát / điều chuyển / thu hồi tài sản → bên nhận xác nhận |
| Báo hỏng (BH), Thanh lý (TL), Tiêu huỷ (TH) | Đề xuất → Kế toán duyệt (tiêu huỷ có mã EO) |
| Điều chỉnh (DC) | Nhập tồn thực tế → server tính chênh lệch → Kế toán duyệt (cách chuẩn sửa tồn âm) |
| Kiểm kê (KK) | Đợt kiểm kê theo công ty, quét QR / nhập mã |

- Phiếu chờ KT: người lập / HCNS sửa hoặc huỷ; bị từ chối thì sửa xong tự gửi lại. Phiếu bị bên nhận từ chối: gửi lại hoặc đánh dấu đã xử lý.
- Chống xuất vượt tồn khi 2 phiếu cùng lúc (`batch_guard` ép rollback cả lô).
- Import Excel phiếu tiêu hao: kiểm quyền + tồn cộng dồn cả file; có lỗi thì không tạo phiếu nào.
- Mã tự sinh: vật tư `TS<công ty>-000123`; TSCĐ `TS<công ty>-<dòng hàng 6 số>-<chiếc 3 số>` (cùng tên = cùng dòng hàng).

## 6. Tồn tối thiểu, cảnh báo, việc cần làm

- Tồn tối thiểu so với **tổng tồn công ty** (vật tư theo mặt hàng, TSCĐ theo dòng hàng): hết / dưới / sắp chạm (≤ 120%) / đảm bảo.
- Cảnh báo: quá hạn 48 giờ (bàn giao / nhận / KT duyệt), tồn âm, đơn giá bất thường (so giá đa số các lần nhập), sắp hết bảo
  hành, dưới tồn tối thiểu. Loại "theo dõi" bỏ qua được (có hoàn tác); loại cần hành động thì không.
- Việc cần làm theo người: nhận hàng (theo kho được nhận), KT duyệt (bỏ phiếu chính mình lập), phiếu bị từ chối cần xử lý.

## 7. Nhân sự từ ETX

Đồng bộ 1 chiều từ ETX hằng ngày (0h VN) + nút "Đồng bộ ETX": tự tạo / duyệt tài khoản Nhân viên cho hồ sơ đang làm có Gmail;
nghỉ việc → tự khoá. Nguyên tắc 1 nhân sự = 1 tài khoản; công cụ "Đổi mã / gộp hồ sơ" chuyển đủ mọi tham chiếu (xem trước rồi mới làm).

## 8. Báo cáo

Tồn theo kho (ma trận + thẻ kho), nhập – xuất – tồn theo kỳ, tiêu dùng văn phòng, theo công ty (gộp), hồ sơ vật tư / tài sản /
nhân viên, báo cáo email tuần (HTML + Excel) gửi 20h tối thứ 5.

## 9. Lịch chạy tự động

| Lịch (UTC) | Việc |
|---|---|
| `0 17 * * *` (0h VN) | Chụp số liệu ngày (`thong_ke_ngay`) + đồng bộ ETX |
| `0 13 * * 4` (20h VN thứ 5) | Gửi báo cáo email định kỳ (nếu bật) |

## 10. Tài liệu liên quan

`CLAUDE.md` (chi tiết kỹ thuật), `AGENT_INSTRUCTIONS.md`, `DESIGN_SYSTEM.md`, `DEPLOY.md`, `SRS_tong_hop.md`, `nhat_ky_lam_viec.md`.
