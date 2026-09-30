# ccdc-app (CCDC 3T)

App quản lý công cụ, dụng cụ (CCDC) cho công ty 3T. Độc lập hoàn toàn với `vi-pham-app`/
`linh-kien-app`/`dvbh` — Worker riêng (`ccdc`), D1 riêng (`ccdc-db`), `users` riêng — nhưng dùng
chung tài khoản Cloudflare (`smarttrade.vp@gmail.com`) và Google OAuth Client với 2 app kia. Kiến
trúc/convention port từ `../vi pham app` và `../linh-kien-app`. Kế hoạch triển khai chi tiết
(schema, route, màn hình từng Phase) xem trong lịch sử trao đổi Claude Code lúc khởi tạo dự án
(2026-09-22) — mọi thay đổi kiến trúc lớn nên đối chiếu lại kế hoạch đó trước khi làm.

## Gotcha đã xác nhận thật (2026-09-22)

**`.dev.vars` KHÔNG hoạt động cho `wrangler dev` với bất kỳ biến nào không đồng thời khai báo
trong `vars`/`env.<ten>.vars` của `wrangler.jsonc`** — bug thật của wrangler (đã test cả 4.111.0 và
4.136.1, cả 2 đều bị), xem [workers-sdk#11264](https://github.com/cloudflare/workers-sdk/issues/11264).
Banner khởi động vẫn in tên biến là `"(hidden)"` như thể đã bind, nhưng `c.env.<TEN_BIEN>` thực tế
là `undefined`. Khác với `vi-pham-app`/`linh-kien-app` (dựa hoàn toàn vào `.dev.vars`), app này
dùng `env.local.vars` trong `wrangler.jsonc` để chứa giá trị dev-only (`SESSION_SECRET`,
`GOOGLE_CLIENT_ID/SECRET` placeholder, `LOCAL_DEV_BYPASS_AUTH=true`) — script `dev` trong
`backend/package.json` chạy với `--env local`. `.dev.vars.example` vẫn giữ lại (dùng làm checklist
tên biến cho `wrangler secret put` khi deploy that) nhưng KHÔNG còn được `wrangler dev` đọc thật.
KHÔNG xoá `env.local` khỏi `wrangler.jsonc`, KHÔNG chuyển các giá trị dev-only đó sang top-level
`vars` (rủi ro trùng tên với secret thật khi deploy production).

**`d1_databases` (và các binding khác như `r2_buckets`, `services`...) khai báo ở top-level KHÔNG
tự động được kế thừa vào `env.<ten>` khi chạy `wrangler dev --env local`** — cùng họ bug/quirk với
gotcha `.dev.vars` ở trên (wrangler in cảnh báo rõ ràng lúc khởi động: `"d1_databases" exists at the
top level, but not on "env.local"... not inherited by environments`, nhưng dễ bị bỏ qua giữa nhiều
dòng log khác). Hậu quả nếu bỏ qua: MỌI route dùng `c.env.DB` lỗi `TypeError: Cannot read properties
of undefined (reading 'prepare')` — đã gặp thật (2026-09-22) sau khi restart `wrangler dev` (chạy
lần đầu vẫn OK vì lúc đó `env.local` chưa có block riêng nào override `vars`, một khi thêm block
`env.local` cho vars thì `d1_databases` cũng phải khai báo lại y hệt trong đó). Bài học chung: KHÔNG
tin vào "inheritance" ngầm định giữa `env.<ten>` và top-level cho BẤT KỲ khối cấu hình nào trong
`wrangler.jsonc` — luôn khai báo lại tường minh trong `env.local` những gì `wrangler dev --env local`
cần dùng, và luôn đọc kỹ dòng `WARNING` đầu log khi khởi động `wrangler dev`.

**`db:migrate:local` PHẢI có `--env local`** (đã sửa trong `backend/package.json`): thiếu cờ này
wrangler lấy `database_id` top-level (id production thật) → ghi vào 1 file SQLite local KHÁC với file
`wrangler dev --env local` đọc (placeholder id của `env.local`) — migrate "thành công" mà app không
thấy bảng mới (đã gặp thật 2026-09-23).

**Rebuild bảng để đổi CHECK trên D1** (SQLite không ALTER được CHECK): `PRAGMA defer_foreign_keys =
true;` rồi `CREATE TABLE x_bak AS SELECT * FROM x; DROP TABLE x; CREATE TABLE x (...mới...); INSERT
INTO x SELECT ... FROM x_bak; DROP TABLE x_bak;`. KHÔNG dùng kiểu `CREATE x_new` + `DROP x` +
`RENAME x_new TO x` — DROP bảng cha làm tăng bộ đếm FK trì hoãn, RENAME không giảm lại → COMMIT lỗi
`FOREIGN KEY constraint failed`, D1 rollback cả migration (đã gặp thật với 0006).

**Không `taskkill` được `workerd` mồ côi** khi dừng `wrangler dev` bằng TaskStop — `workerd.exe` con
vẫn giữ file SQLite trong `.wrangler/state` (không mv/xoá được). Muốn test trên DB sạch thì dùng
`--persist-to` thư mục khác (vd `../.wrangler/state_import_test2`) + `--port` khác, không động vào
state đang dùng.

## Mô hình đa kho + vai trò (Giai đoạn 1.5, 2026-09-24)

- Vai trò (`users.vai_tro`): `Admin`, `Ke toan` (duyệt nhập mua / báo hỏng / thanh lý / tiêu hủy),
  `HCNS` (danh mục, kho, lập nhập mua, đề xuất xử lý TS), `Quan ly`; NULL = Nhân viên. Thủ kho là
  bảng gán riêng `kho_thu_kho` (kho, email), độc lập vai trò; QL tự là thủ kho kho QL của mình.
- Kho: `Mua hang` (id 1, nguồn ảo, không tính tồn) → `HCNS` (id 2) → `Mien` → `Quan ly` (1 kho/QL,
  `nhan_vien_id` UNIQUE) → NV. Tồn tiêu hao tính động qua view `v_ton_kho` (không denormalize).
- Mọi kiểm quyền theo kho/nhóm ở server (`backend/src/lib/quyen.ts`) — không tin `kho_id` client gửi.
- Chống xuất vượt tồn khi 2 phiếu đồng thời: bảng `batch_guard` (`CHECK (x = 1)`) — chèn
  `CASE WHEN tồn < 0 THEN 0 ELSE 1 END` cuối `db.batch()` để ép rollback cả batch.
- Danh bạ nhân sự đồng bộ 1 chiều từ ETX (`lib/etxNhanSuSync.ts`, port từ `linh-kien-app`): cron **hằng
  ngày** 0h VN (từ 2026-09-30, trước đó chỉ Chủ nhật) + nút "Đồng bộ ETX" (NhanVienScreen). Cuối mỗi lần
  đồng bộ, `lib/etxTuDongTaiKhoan.ts` tự tạo/duyệt tài khoản (vai trò Nhân viên) cho mọi hồ sơ ETX đang
  làm việc có Gmail + gán `nhan_vien.email_dang_nhap`; bỏ qua tài khoản "Từ chối", Gmail trùng >1 hồ sơ,
  hồ sơ đã liên kết email khác. Nghỉ việc (ETX off) → tự khoá như cũ. Số tài khoản: `etx_sync_state.tai_khoan_count` (migration 0009). Local dùng mock `scripts/mock_etx_server.py` (port 8799,
  `env.local.vars.ETX_HR_BASE_URL`). Production cần secret `ETX_HR_API_KEY` — người dùng tự đặt.
- Script import dữ liệu cũ: `scripts/generate_import_sql.py` (quyết định ánh xạ ghi ở docstring đầu
  file). Phải import TRƯỚC lần đồng bộ ETX đầu tiên trên production (xem `DEPLOY.md`).

## Giao diện chạy dữ liệu thật (Giai đoạn 1.6, 2026-09-24)

- **Không phần tử trang trí/demo**: mọi số KPI, badge, biểu đồ, nút, link phải lấy từ API thật và bấm
  được. Không `prompt()/alert()/confirm()` — dùng `Modal`. Không số/tên cố định trong JSX.
- Mã phiếu dễ đọc `ma_phieu` (migration 0008): sinh trong CÙNG `db.batch()` với INSERT phiếu qua
  `backend/src/lib/maPhieu.ts` (tiền tố NM/CK/CP/GN/NT/BH/TL/TH/KK + `YYMM` + số thứ tự). Phiếu import
  cũ giữ `ma_phieu = id` (`ID-xxxxxxxx`).
- Phạm vi dữ liệu tổng hợp (tổng quan / việc cần làm / cảnh báo / báo cáo / tìm kiếm): luôn lọc qua
  `lib/phamVi.ts` (`layPhamVi`, `locTheoKho`, `dkTaiSan`, `dkPhieuKho`, `dkCotKho`) — Admin/KT/HCNS
  toàn hệ thống; thủ kho / QL chỉ kho mình + nhóm; NV → 403 ở các màn tổng hợp.
- Ngưỡng quá hạn **48 giờ** cho mọi loại chờ (bàn giao / nhận / KT duyệt).
- % "so với kỳ trước" của chỉ số tồn lấy từ `thong_ke_ngay` (cron hằng ngày `0 17 * * *` chụp số
  liệu + đồng bộ ETX). Chưa có số liệu kỳ trước → hiện "Chưa có số liệu kỳ trước",
  không tự bịa %.
- Frontend dùng chung: `useNav()` (điều hướng kèm tham số, màn được key theo tab+params),
  `useChiTiet()` (`moPhieu(loai, id)` / `moTaiSan(id)` — popup chi tiết + thao tác đúng quyền),
  `useDuLieuChung()` (việc cần làm, badge menu/chuông), `baoThayDoi()` / `useKhiThayDoi()` (báo các
  màn đang mở tải lại sau khi ghi). Component: `PageHeader`, `KpiCard`, `FilterTabs`, `KhoFilter`,
  `DateRangeFilter`, `ViecTable`, `CanhBaoRow`, `QrScanner` (camera cần HTTPS — chỉ test được trên
  thiết bị thật; luôn có ô nhập mã tay).
- Tìm kiếm LIKE của SQLite chỉ không phân biệt hoa/thường với ký tự ASCII — chữ có dấu (Đ/đ, Ă/ă…)
  vẫn phân biệt hoa/thường.

**Dev local đang dùng khi làm 1.6** (vì `workerd` mồ côi giữ cổng 8791/8792 + DB cũ): worker chạy
`npx wrangler dev --config ../wrangler.jsonc --env local --persist-to ../.wrangler/state_dev --port 8793`
(trong `backend/`, `state_dev` = bản sao DB production); Vite đọc cổng API từ biến `CCDC_API_PORT`
(`frontend/.env.development.local`, mặc định 8791). User test theo vai trò: `admin|kt|hcns|ql|tk|nv
@test.local` qua `/api/auth/dev-login?email=`.

## Quy ước chung (giống hệ QLBH 3T)

- `run_worker_first: ["/api/*"]` trong `assets` của `wrangler.jsonc` là bắt buộc — thiếu sẽ bị SPA
  fallback chặn request `/api/*` thật (navigate) trước khi tới Worker.
- `wrangler dev` (`npm run dev:worker`) cần `frontend/dist` tồn tại trước (chạy `npm run build`
  hoặc `npm run build --workspace frontend` ít nhất 1 lần) — Worker sẽ báo lỗi nếu thư mục chưa có.
- Timestamp hệ thống: cột `TEXT NOT NULL DEFAULT (datetime('now'))` cho insert mặc định, nhưng khi
  code tự cập nhật `updated_at`/timestamp khác thì dùng `nowVN()` (`backend/src/lib/vnTime.ts`, giờ
  VN = UTC+7, format `YYYY-MM-DD HH:MM:SS`) — đúng convention 2 app anh em.
- `vai_tro` CHECK-constrained trên `users` (xem mục đa kho ở trên), NULL = Nhân viên (mặc định sau khi được duyệt).
- Mọi thao tác ghi nhiều bảng cùng lúc (tạo phiếu + line item + cập nhật `ccdc`...) PHẢI dùng
  `db.batch()` của D1 — không tách nhiều `run()` rời rạc (D1 không tự rollback nếu 1 lệnh giữa
  chừng lỗi).
- Kiểm kê chỉ ghi nhận chênh lệch, KHÔNG tự động sửa `ccdc.trang_thai_hien_tai`/`nguoi_dang_giu` —
  sửa thực tế phải qua 1 `phieu_giao_nhan` điều chỉnh riêng, có người chịu trách nhiệm.
- Chỉ cho đề xuất thanh lý/tiêu hủy TSCĐ đang nằm trong kho (`trang_thai_hien_tai IN ('Trong kho',
  'Hong')`, không ai giữ) — phải qua Kế toán duyệt (`phieu_xu_ly_ts`).

## Ports dev (khác các app khác trong hệ, chạy song song được)

Backend `wrangler dev`: 8791. Frontend Vite: 5177 (proxy `/api` → 8791).
(`dvbh` 5173/8787 · `linh-kien-app` 5174/8788 · `gui-bao-hanh-linh-kien` 5175/8789 · `vi-pham-app`
5176/8790.)

## Lệnh thường dùng

```bash
npm install
npm run build --workspace frontend   # bắt buộc trước lần "dev:worker" đầu tiên
npm run db:migrate:local
npm run dev:worker      # port 8791, dùng --env local (xem gotcha ở trên)
npm run dev:frontend    # port 5177
```

Đăng nhập DEV (`🔧 Đăng nhập DEV`) chỉ hiện khi chạy qua `vite dev` (`import.meta.env.DEV`), không
hiện trên bundle production đã build.

## BẮT BUỘC: Quy ước Giao diện UI/UX & Design System (MỌI AI PHẢI TUÂN THỦ)

Mọi module, màn hình mới hoặc việc sửa đổi giao diện frontend PHẢI tuân thủ nghiêm ngặt theo **`DESIGN_SYSTEM.md`** và phong cách chuẩn của hệ thống `3T Asset Management`:

1. **Gam màu nhận diện**:
   - Sidebar cố định 261px: gradient Deep Teal `linear-gradient(180deg, #0B6B7A 0%, #006573 45%, #005663 80%, #017280 100%)`.
   - Nền trang chính: Luôn là `#F7FBFE` (trắng xám ánh xanh mát). KHÔNG dùng nền trắng toát `#FFFFFF` hay xám đen.
   - Thẻ Card: Nền trắng `#FFFFFF`, viền siêu mờ `1px solid #F1F5F9`, bóng nhẹ `box-shadow: 0 1px 3px rgba(0,0,0,0.025)`.
   - 5 Bộ màu Pastel nhận diện cho KPI và Trạng thái: Mint/Cyan (`#E4FAFB`), Cyan ngọc (`#E1F7FB`), Blue (`#E9F3FD`), Purple (`#F4EDFD`), Amber/Vàng cam (`#FFF9E7`), Red Danger (`#FEE2E2`).
2. **Cấu trúc màn hình module chuẩn (4 tầng)**:
   - Tầng 1: Sub-header (Tiêu đề module 21px bold + Bộ lọc ngày/đơn vị + Nút tác vụ nhanh).
   - Tầng 2: Hàng KPI Summary (3 - 5 thẻ tóm tắt số liệu với watermark mờ góc phải, trend tăng/giảm).
   - Tầng 3: Khung làm việc chính (Bảng dữ liệu phẳng `.task-table`, Tabs lọc con pill `.task-tab-btn`, mã phiếu dạng link xanh `#0284C7`, badge trạng thái bo tròn).
   - Tầng 4: Cột cảnh báo / Form thao tác (nếu có).
3. **Typography & Spacing**:
   - Font `Plus Jakarta Sans`, system-ui. Số liệu KPI lớn `28px - 30px` Bold 800.
   - Bo góc chuẩn: Card `12px - 14px`, nút và input `8px`, pill badge `10px - 12px`, circle `50%`.
4. **Tái sử dụng CSS**:
   - TẤT CẢ các class CSS đã được định nghĩa trong `frontend/src/styles.css`. Bắt buộc tái sử dụng, KHÔNG tự ý viết CSS rời rạc hay thêm thư viện UI khác phá vỡ giao diện.
   - Chi tiết token màu, cấu trúc thẻ và code mẫu xem tại: `DESIGN_SYSTEM.md`.

