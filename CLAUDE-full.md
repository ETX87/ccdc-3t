# CLAUDE-full.md — ccdc-app (CCDC 3T), bản CHI TIẾT ĐẦY ĐỦ

> Bản rút gọn (luật chính, < 10 KB, app chủ trên đám mây đọc) nằm ở [`CLAUDE.md`](CLAUDE.md). File này KHÔNG tự nạp vào phiên — mở khi cần chi tiết.
> Từ 24/11/2026 mọi tính năng / quyết định mới ghi chi tiết TẠI ĐÂY; CLAUDE.md chỉ giữ luật chung.

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

**Nạp bản export production vào local**: `wrangler d1 execute --local --file <export.sql>` LỖI `no such table:
main.users` (chạy ~13 phút rồi bỏ cả file, DB local vẫn rỗng - đã gặp thật 2026-10-18). Cách đúng: dựng SQLite bằng Python
(`sqlite3.executescript("BEGIN;" + sql + "COMMIT;")`, < 1 giây) rồi chép đè file `.sqlite` trong
`<persist>/v3/d1/miniflare-D1DatabaseObject/` (xoá `-shm`/`-wal`), sau đó `migrations apply --local` các migration mới.

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
- **Kho `Trung chuyen`** (2026-10-13, migration 0016) = kho miền khác tên (đại diện văn phòng nhận từ HCNS/kho miền rồi
  phát cho NV). Kiểm "phát cho mọi NV" dùng `laKhoPhatChung()` (backend `quyen.ts`, frontend `lib/nhan.ts`) — KHÔNG
  so `=== "Mien"` rời rạc. Đổi qua lại Miền ↔ Trung chuyển ↔ QL (`LOAI_DOI_DUOC`); kho chưa có người phụ trách → QL
  phải gửi `nhan_vien_id`.
- **Đổi loại kho QL ↔ Miền** (2026-10-07, `POST /kho/:id/doi-loai`, nút "Đổi loại kho" ở Cấu hình kho): giữ id,
  tồn, lịch sử và `nhan_vien_id` (= "người phụ trách", vẫn là thủ kho mặc nhiên qua `khoPhuTrach` với MỌI loại
  kho; giữ để ETX/gán quản lý không tự tạo lại "Kho QL - …" nhờ `ON CONFLICT(nhan_vien_id)`). Kho miền cấp phát
  cho mọi nhân viên, chuyển được sang kho QL; thủ kho kho miền xem mọi tài sản + điều chuyển TSCĐ toàn hệ thống.
- Mọi kiểm quyền theo kho/nhóm ở server (`backend/src/lib/quyen.ts`) — không tin `kho_id` client gửi.
- **Xuất ≠ nhận** (2026-10-12, user báo vượt quyền): `khoPhuTrach` = kho được LẬP PHIẾU XUẤT (Admin mọi kho, HCNS
  kho HCNS + Mua hàng); `khoNhanHang` / `laBenNhan` = kho được XÁC NHẬN / TỪ CHỐI NHẬN (thủ kho gán, người phụ trách
  kho, HCNS/Admin chỉ Kho tổng HCNS) — frontend `user.kho_nhan`. Đã BỎ "xác nhận hộ kho nhận" của thủ kho kho nguồn;
  Việc cần làm (nhận hàng) lọc theo `khoNhanHang`, KHÔNG theo phạm vi xem `pv.khoIds`. Kho chưa có người nhận → gán
  thủ kho. **Không tự duyệt**: người lập / đề xuất không KT-duyệt phiếu của mình (`laNguoiLap`, lỗi `KHONG_TU_DUYET`,
  kể cả Admin) — Việc cần làm của KT bỏ phiếu do chính mình lập.
- Chống xuất vượt tồn khi 2 phiếu đồng thời: bảng `batch_guard` (`CHECK (x = 1)`) — chèn
  `CASE WHEN tồn < 0 THEN 0 ELSE 1 END` cuối `db.batch()` để ép rollback cả batch.
- Danh bạ nhân sự đồng bộ 1 chiều từ ETX (`lib/etxNhanSuSync.ts`, port từ `linh-kien-app`): cron **hằng
  ngày** 0h VN (từ 2026-09-30, trước đó chỉ Chủ nhật) + nút "Đồng bộ ETX" (NhanVienScreen). Cuối mỗi lần
  đồng bộ, `lib/etxTuDongTaiKhoan.ts` tự tạo/duyệt tài khoản (vai trò Nhân viên) cho mọi hồ sơ ETX đang
  làm việc có Gmail + gán `nhan_vien.email_dang_nhap`; bỏ qua tài khoản "Từ chối", Gmail trùng >1 hồ sơ,
  hồ sơ đã liên kết email khác. Nghỉ việc (ETX off) → tự khoá như cũ. Số tài khoản: `etx_sync_state.tai_khoan_count` (migration 0009). Local dùng mock `scripts/mock_etx_server.py` (port 8799,
  `env.local.vars.ETX_HR_BASE_URL`). Production cần secret `ETX_HR_API_KEY` — người dùng tự đặt.
- **Đổi mã / gộp hồ sơ nhân viên** (2026-10-01, `lib/gopNhanVien.ts`, migration 0011, nút "Đổi mã / gộp" ở
  NhanVienScreen): 3 thao tác cùng 1 lõi "gộp NGUỒN vào ĐÍCH" — gắn mã ETX chuẩn (mã đã thuộc hồ sơ khác →
  gộp vào hồ sơ đó, ETX là gốc), gộp vào hồ sơ khác, đổi mã nội bộ. Chuyển ĐỦ mọi cột tham chiếu
  (`COT_NHAN_VIEN`, `COT_KHO` — thêm bảng/cột mới tham chiếu nhân viên hay kho PHẢI bổ sung vào 2 danh sách
  này), 2 kho QL → gộp kho; tồn kho không đổi. Luôn xem trước rồi mới thực hiện, 1 `db.batch()` có chốt
  `batch_guard`, nhật ký `nhan_vien_lich_su_ma`. Nguyên tắc **1 nhân sự = 1 tài khoản**: xung đột email khi
  gộp → chọn giữ 1; POST/PUT nhân viên chặn email đã gắn hồ sơ khác. Danh bạ ETX đầy đủ (cả người nghỉ) ở
  `etx_nhan_su` (sync hằng ngày ghi diff) — tra cứu lọc ở JS (bỏ dấu), không dùng LIKE. Hồ sơ không có trên
  ETX (Trạm/CTV đối tác) dùng **mã tạm** làm `ma_nv`, `ma_etx` NULL.
- Script import dữ liệu cũ: `scripts/generate_import_sql.py` (quyết định ánh xạ ghi ở docstring đầu
  file). Phải import TRƯỚC lần đồng bộ ETX đầu tiên trên production (xem `DEPLOY.md`).

## Đa pháp nhân / công ty (2026-10-07, migration 0014)

- Bảng `cong_ty` (id 1 = `3T` mặc định — nhận nhân sự mới từ ETX; id 2 = `NSKX`), `user_cong_ty` (email ↔ công ty
  gán thêm). Cột `cong_ty_id` trên `kho`, `vt_tieu_hao`, `nhom_ccdc`, `ccdc`, `nhan_vien`, `dot_kiem_ke` — tồn kho,
  danh mục, tài sản, nhân viên RIÊNG từng công ty. Mỗi NV thuộc 1 công ty. Tạo công ty (màn "Công ty (pháp nhân)",
  Admin) tự tạo kèm Kho mua hàng + Kho tổng HCNS riêng. **Bảng mới có dữ liệu theo công ty phải thêm `cong_ty_id`.**
- Công ty được xem (`loadUser`): Admin = mọi công ty; còn lại = `user_cong_ty` ∪ công ty hồ sơ NV ∪ công ty các kho
  là thủ kho; rỗng → công ty mặc định. Bộ lọc đang xem: header `x-cong-ty` (localStorage `ccdc_cong_ty`, ô
  `ChonCongTy` ở topbar, đổi = tải lại trang) → `user.cong_ty_xem`. Vai trò toàn quyền xem 1 phần công ty →
  `PhamVi.congTyToan`. Helper `quyen.ts`: `coCongTy`, `congTyTao` (công ty bản ghi mới), `congTyLoc` (lọc danh sách,
  `?cong_ty_id=`), `laKeToan/laHcns(user, congTyId)`. Form tạo mới: `TruongCongTy` + `congTyMacDinh(user)`
  (chỉ hiện ô chọn khi đang xem nhiều công ty).
- **Chuyển giữa 2 công ty**: tiêu hao = `phieu_chuyen_kho` loại `Chuyen kho` tới kho công ty khác → `Cho ke toan
  duyet` (chưa trừ tồn) → KT công ty NGUỒN duyệt: `lib/ghepVatTu.ts` ghép mặt hàng theo tên + ĐVT trong danh mục công
  ty nhận (thiếu thì tạo `${id}-${MA}`, ghi `phieu_chuyen_kho_ct.vt_id_den`), trừ tồn → `Dang chuyen` → kho nhận
  xác nhận. `v_ton_kho` vế nhập dùng `COALESCE(vt_id_den, vt_id)`. TSCĐ = `phieu_giao_nhan` `Chuyen kho` tới kho công
  ty khác → `trang_thai_duyet` `Cho ke toan duyet`; duyệt mới chuyển TS (đổi `cong_ty_id`, nhóm ghép theo tên); chưa
  duyệt thì không xác nhận được (`CHUA_KE_TOAN_DUYET`). Danh sách kho đích cho cả 2: `GET /kho/dich`.
- **Mọi dữ liệu theo công ty đang xem** (`user.cong_ty_xem`) — kể cả Việc cần làm cá nhân / phiếu bị từ chối (sửa
  2026-10-13: trước đó đổi công ty vẫn thấy việc công ty cũ). Truy vấn mới lọc theo `kho.cong_ty_id` / `ccdc.cong_ty_id`
  hoặc qua `layPhamVi`; nhân sự chỉ được xem công ty của mình (+ công ty Admin gán thêm).
- **Quyền thêm "Xem tồn kho toàn công ty"** (`users.xem_ton`, migration 0017, ô tích ở Tài khoản & phân quyền): chỉ ĐỌC
  tồn tiêu hao mọi kho / ma trận / thẻ kho / Kho & tồn / danh mục TSCĐ của các công ty được xem — dùng
  `layPhamViXemTon()` (lib/phamVi.ts) ở các route xem tồn; KHÔNG dùng cho việc cần làm hay thao tác ghi.
- **Dữ liệu cũ NSKX** (import 2026-10-15, `scripts/import_nskx.py` — quyết định ánh xạ ở docstring): nhân sự NSKX có
  trong ETX (đang bị xếp 3T) đã CHUYỂN sang NSKX (giữ mã NS-xxx); người không có trên ETX dùng mã T… / `NSKX-TAM-xxx`
  (mã tạm, có thể trùng người 3T cùng tên → HCNS gộp tay). Kho NSKX: Văn phòng Hà Nội, Kho sửa chữa Hồ Chí Minh, Kho 3T,
  Kho cấp phát vật phẩm (Miền) + Kho tiêu hao. ETX vẫn tạo nhân sự MỚI vào công ty mặc định 3T → HCNS đổi tay.
- **Nhân viên kiêm nhiệm nhiều công ty** (2026-10-18, migration 0019): `nhan_vien.cong_ty_id` = công ty CHÍNH,
  `nhan_vien_cong_ty` = công ty kiêm nhiệm (ô "Công ty kiêm nhiệm" ở form Nhân viên, `PUT /nhan-vien/:ma {cong_ty_phu}`).
  Kiểm "NV thuộc công ty X" LUÔN qua view `v_nv_cong_ty` / `lib/nvCongTy.ts` (`nvThuocCongTy`, `NV_THUOC_CT`,
  `congTyCuaNv`) — KHÔNG so `nhan_vien.cong_ty_id` trực tiếp. Kho QL = 1 kho / người / CÔNG TY (`UNIQUE(nhan_vien_id,
  cong_ty_id)`, upsert `ON CONFLICT(nhan_vien_id, cong_ty_id)`); `lenhTaoKhoQl()` tạo kho QL ở mọi công ty QL có cấp dưới
  thuộc công ty đó (kho công ty kiêm nhiệm tên "Kho QL - <tên> (<MÃ>)"). Phạm vi nhóm QL tách theo công ty
  (`PhamVi.congTyNhom` lọc TS nhóm theo `ccdc.cong_ty_id`). Gộp hồ sơ 2 công ty khác nhau được phép = 1 người kiêm nhiệm
  (kho QL gộp theo từng công ty). Bỏ công ty kiêm nhiệm bị chặn khi còn giữ TS / còn kho QL ở công ty đó.
  **Gợi ý nhân viên ở công ty khác** (2026-10-28, `components/GoiYNvCongTyKhac.tsx` + `GET /nhan-vien/cong-ty-khac?search&
  cong_ty_id`): tìm không thấy (màn Nhân viên, ô chọn NV của form Cấp phát tiêu hao / Giao nhận TSCĐ qua prop `khiRong`
  của `SearchSelect`) → hồ sơ khớp (bỏ dấu, lọc JS) ở công ty khác + nút "Thêm kiêm nhiệm" (`POST /nhan-vien/:ma/them-
  kiem-nhiem`, cùng quyền PUT: HCNS cả 2 phía) / "Xem ở công ty X". Admin/HCNS/KT thấy mọi công ty, người khác chỉ công ty
  tài khoản được phép. `/nhan-vien?gon=1` trả `cong_ty_ids` (chính + kiêm nhiệm) — ô chọn NV trong form lọc bằng
  `nvThuocCt()` (lib/nhan.ts), KHÔNG so `cong_ty_id` (trước đó NV kiêm nhiệm không hiện trong ô chọn).
  **Chọn NV khác công ty khi chuyển giao tài sản** (2026-10-28, migration 0020): quyền thêm NV vào nhân sự công ty C =
  `duocThemNvVaoCongTy()` (quyen.ts): HCNS/Admin của C HOẶC thủ kho / người phụ trách kho HCNS·Miền·Trung chuyển·QL của C
  (KHÔNG cần quyền ở công ty gốc của NV). Ô chọn người nhận (Cấp phát NV tiêu hao, Cấp phát + Điều chuyển TSCĐ) luôn hiện
  khối "Nhân viên ở công ty khác" → nút "Chọn" → popup `XacNhanNvKhacCongTy` (đặt ở FORM, không trong dropdown) → đồng ý
  = `them-kiem-nhiem` rồi chọn luôn. `nhan_vien_cong_ty.nguoi_them` ghi người thêm; `lenhCongTyPhu` chỉ xoá công ty bị bỏ +
  `INSERT OR IGNORE` (giữ dòng cũ). Kho QL vẫn chỉ cấp cho nhóm của chủ kho (`trongNhom` ở phiếu).
  "Kho tổng tất cả công ty" = BÁO CÁO GỘP (`components/TongTheoCongTy.tsx`: khối đầu tab Tồn theo kho, Tài sản của tôi),
  không phải kho thật.
- **Nhãn công ty trước tên kho / nhân viên** (2026-11-12, `backend/src/lib/nhanCongTy.ts`): SELECT trả tên để HIỂN THỊ
  (bảng, ô chọn, Excel, email) dùng `${TEN_KHO("k")}` → "[3T] Kho …", `${TEN_NV("nv")}` → "[3T·NSKX] Tên" (công ty
  chính trước, rồi kiêm nhiệm). KHÔNG dùng trong WHERE / so khớp tên / giá trị ghi ngược DB. `GET /kho` trả thêm
  `ten_goc` (tên lưu DB) — ghi lại tên kho (PUT, đổi loại) phải dùng `ten_goc`. `GET /nhan-vien` đầy đủ giữ `ten_nv`
  gốc (form sửa); `?gon=1` có nhãn. Import Excel tên kho bỏ nhãn qua `boNhanCongTy()`.
- Báo cáo so sánh: `GET /bao-cao/theo-cong-ty` (tab "Theo công ty", Admin/KT/HCNS xem ≥2 công ty).

## Kho tiêu hao, sửa / gửi lại / điều chỉnh phiếu tiêu hao (2026-10-09, migration 0015)

- Loại kho `Tieu hao` = **điểm tiêu dùng văn phòng** (VPP, vệ sinh, đóng hàng): KHÔNG tính tồn (`v_ton_kho` bỏ
  `Mua hang` + `Tieu hao`; dùng `laKhoTon()` / `KHO_TON_SQL` ở backend, `laKhoTon()` ở `lib/nhan.ts`). Xuất vào = phiếu
  `Cap phat NV` có `den_kho_id` = kho tiêu hao → `Da giao` + `da_xac_nhan = 1` ngay. Không chuyển kho / TSCĐ vào, không
  xuất ra. Báo cáo `GET /bao-cao/tieu-dung` (tab "Tiêu dùng văn phòng").
- Phiếu `Dieu chinh` (mã `DC`): `POST /phieu-chuyen-kho/dieu-chinh` nhập tồn THỰC TẾ → server tính chênh lệch lúc lập
  (`ct.dau` +1/−1, `so_luong` > 0) → KT duyệt → `Da dieu chinh` (vế thứ 3 của `v_ton_kho`). Đây là cách chuẩn sửa tồn âm.
- Phiếu chờ KT (`Cho ke toan duyet` / `Ke toan tu choi`): người lập / HCNS sửa (`PUT /:id`, nhật ký ghi diff, bị từ chối
  → sửa xong tự gửi duyệt lại) hoặc hủy (`/:id/huy` → `Da huy`). Phiếu `Bi tu choi` nhận: `/:id/gui-lai` (phiếu mới,
  `gui_lai_tu`) hoặc `/:id/da-xu-ly` (`da_xu_ly_tu_choi`); việc cần làm hiện cho người lập + thủ kho nguồn tới khi xử lý.
- **Nhập - xuất - tồn theo kỳ** (2026-10-14): `GET /kho/nhap-xuat-ton?tu&den[&kho_id]` (cùng quy tắc `v_ton_kho`; vào kho /
  điều chỉnh tính theo `updated_at`, ra kho theo `created_at`; tồn cuối = đầu + nhập − xuất, kỳ tới hôm nay = tồn hiện tại)
  → cột Tồn đầu kỳ / SL nhập / SL xuất / Tồn cuối kỳ ở bảng "Tồn theo kho" (KhoScreen, chọn ngày/tháng/năm) + popup từng
  mặt hàng `NxtKhoModal` (`components/NhapXuatTon.tsx`). Danh sách phiếu tiêu hao có cột SL (`tong_sl`, điều chỉnh tách `sl_giam`).
- **Import Excel phiếu tiêu hao** (2026-10-16, nút "Nhập từ Excel" ở Cấp phát tiêu hao, `components/NhapExcelPhieuCk.tsx`
  → `POST /phieu-chuyen-kho/import {dong, thuc_hien}`): Chuyển kho / Cấp phát NV / Xuất tiêu dùng VP từ kho người dùng phụ
  trách. Mỗi dòng 1 mặt hàng, gộp phiếu theo (Nhóm phiếu, Kho xuất, người/kho nhận); loại phiếu suy từ người nhận. Server
  tra tên kho / vật tư (bỏ dấu) / mã NV, kiểm quyền bằng CHÍNH `kiemTraTao` của lập tay + tồn cộng dồn cả file; có lỗi thì
  không tạo phiếu nào, tạo thì mọi phiếu trong 1 `db.batch` (dùng chung `lenhTaoPhieu`). Tiêu đề cột nhận mọi ngôn ngữ
  (`moiNgonNgu()` trong i18n.ts — script kiểm i18n coi như `t()`). Mã NV nhận thuộc công ty KHÁC công ty kho xuất (2026-10-28):
  người import có `duocThemNvVaoCongTy` → xem trước báo "sẽ thêm kiêm nhiệm" (`them_kiem_nhiem`), lúc tạo chèn
  `nhan_vien_cong_ty` (+ `lenhTaoKhoQl`) ĐẦU cùng batch với phiếu (`kiemTraTao(..., seThemNv)` bỏ qua kiểm NV thuộc công ty);
  không có quyền → lỗi `NHAN_VIEN_KHAC_CONG_TY` như cũ.
  Giá (2026-11-03): cột Đơn giá + Thành tiền (không bắt buộc) — Đơn giá file > Thành tiền ÷ SL > `don_gia_tham_khao` danh
  mục; Thành tiền trống = Đơn giá × SL; ghi cả 2 mà lệch > 1đ → `IMPORT_THANH_TIEN_LECH`. `CreateItem.thanh_tien` (chỉ
  import) ghi thẳng `phieu_chuyen_kho_ct.thanh_tien`; cùng vật tư + cùng đơn giá mới gộp 1 dòng.
- **Mã vật tư tự sinh** (2026-10-19, `POST /vt-tieu-hao` bỏ qua `id` client gửi): `TS<mã công ty>-` + 6 chữ số, số tiếp
  = max mã cùng dạng trong danh mục (TS3T-000344, TSNSKX-000273), sinh ngay trong câu INSERT (`RETURNING id`); form hiện
  trước mã dự kiến qua `GET /vt-tieu-hao/ma-tiep-theo?cong_ty_id=`. Mã cũ khác dạng (hash, tên) giữ nguyên.
- **Mã TSCĐ tự sinh** (2026-10-19, `POST /ccdc` bỏ qua `id`, `sinhMaTaiSan` trong `routes/ccdc.ts`): `TS<mã công ty>-<dòng
  hàng 6 số>-<chiếc 3 số>`. Trùng tên (trim, không phân biệt hoa/thường, GIỮ dấu) với TS cùng công ty → chiếc kế tiếp của
  dòng hàng đó (Điều hòa → TS3T-000013-024); tên mới → dòng hàng mới, `-001`. Trùng khoá khi 2 người tạo cùng lúc → sinh
  lại. Preview `GET /ccdc/ma-tiep-theo?cong_ty_id&ten=` (khai báo TRƯỚC `GET /:id`). D1 báo "GLOB pattern too complex"
  với mẫu dài (≥ ~9 nhóm `[0-9]`) → lọc tiền tố bằng `substr` rồi kiểm dạng ở JS.
- Tồn theo kho: `GET /bao-cao/ton-theo-kho` (ma trận, cột kho người xem chọn - localStorage `ccdc_cot_kho_ton`) +
  thẻ kho `GET /bao-cao/the-kho?kho_id&vt_id` (`components/TonTheoKho.tsx`, `TheKho.tsx`).
- Nút Back: mỗi `navigate()` = 1 `history.pushState` (App.tsx), popup chi tiết cũng chiếm 1 bước (Back đóng popup);
  `PageHeader` tự hiện "Quay lại" khi có bước trước.

## Tồn kho tối thiểu + báo cáo email định kỳ (2026-10-30, migration 0021)

- **Sửa nhanh tồn tối thiểu** (2026-11-03): `PATCH /vt-tieu-hao/:id/ton-toi-thieu` (Admin/HCNS công ty của vật tư, chỉ 2
  cột tồn tối thiểu + thời gian đặt hàng) — popup `SuaTonToiThieuVt` (TonToiThieu.tsx) mở từ ô "Tồn / Tối thiểu" ở Danh mục
  vật tư và nút "Sửa" trong hồ sơ vật tư.
- **Tồn tối thiểu** so với TỔNG tồn công ty (mọi kho tính tồn + hàng đang chuyển tới kho tính tồn), không theo từng kho
  — `lib/tonToiThieu.ts` (`danhGiaTon`: hết / dưới / sắp chạm ≤120% / đảm bảo; NULL/0 = không quy định). Vật tư: cột
  `vt_tieu_hao.ton_toi_thieu` + `thoi_gian_dat_hang` (form + "Nhập tồn tối thiểu" từ Excel mẫu `TỒN KHO TỐI THIỂU.xlsx`,
  `POST /vt-tieu-hao/ton-toi-thieu/import`, khớp tên bỏ dấu, lọc thêm ĐVT). TSCĐ: bảng `ts_ton_toi_thieu` theo DÒNG HÀNG
  (cùng tên, `chuanTen` dùng chung với sinh mã TS), tồn = TS "Trong kho" không hỏng (nút "Tồn tối thiểu" ở Danh mục TS).
  Cảnh báo `duoi-ton-toi-thieu` (tính ở JS, chỉ phạm vi toàn công ty — thủ kho/QL không thấy).
- **Báo cáo email** (`routes/baoCaoEmail.ts`, màn "Báo cáo email định kỳ", Admin + HCNS — HCNS chỉ chọn/xem/gửi tay trong công
  ty tài khoản được gán; kết nối Gmail cũng mở cho HCNS, Drive vẫn chỉ Admin): gửi qua **Gmail API** bằng tài khoản
  Admin kết nối (`gmail_oauth`, scope `gmail.send`, RIÊNG với Drive). Cron `0 13 * * 4` = 20h tối thứ 5 VN (bật/tắt ở
  cấu hình). Dữ liệu `lib/baoCaoTuan.ts` → HTML inline-style + Excel phẳng (`lib/xlsx.ts`, tự viết, không thư viện).
  Production cần: BẬT Gmail API trong Google Cloud project của OAuth Client + thêm redirect URI
  `https://ccdc.dichvu3t.workers.dev/api/settings/gmail/callback`, rồi Admin bấm "Kết nối Gmail".
- **Hồ sơ vật tư tiêu hao** (`components/ChiTietVatTu.tsx`, `GET /vt-tieu-hao/:id/chi-tiet`, `useChiTiet().moVatTu(id)`):
  tồn từng kho (cả kho ĐÃ HẾT), giá trị, tồn tối thiểu, lịch sử mọi phiếu (lọc loại / kho, +/− theo kho), người nhận cấp
  phát. Mở từ tìm kiếm trên cùng, tên vật tư ở Danh mục / Tồn kho / ma trận, cảnh báo. Popup giờ là CHỒNG (mở phiếu từ hồ
  sơ → Đóng/Back quay về hồ sơ; `history.state.popup` = độ sâu). Tìm kiếm vật tư: ≤12, mặt hàng phát sinh gần nhất trước.
- `?mo=<tab>` trên URL mở thẳng 1 màn (dùng sau OAuth); initializer `useState` phải thuần (StrictMode gọi 2 lần).

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
- **Mọi bảng phải phân trang** (2026-09-30), cố định 50 dòng/trang, component `PhanTrang`
  (`components/PhanTrang.tsx`). Bảng lớn/tăng dần (phiếu tiêu hao, danh mục tài sản, nhân viên) phân trang Ở
  SERVER: route nhận `?page=N` → `{ rows, total, page, page_size }` qua `lib/phanTrang.ts` (`docTrang` +
  `layTrang`: COUNT + LIMIT/OFFSET trong 1 `db.batch`), KPI/số đếm tab lấy từ route `/thong-ke` riêng, màn
  dùng `useTrangServer(khoaLoc)`; không gửi `page` = hành vi cũ (xuất Excel, ô chọn trong form). Bảng nhỏ/đã
  tổng hợp dùng `useTrangKhach(rows, khoaLoc)`. Ô chọn nhân viên trong form dùng `/nhan-vien?gon=1` (chỉ mã +
  tên) — KHÔNG gọi `/nhan-vien` đầy đủ (mỗi dòng 2 truy vấn con đếm).
- Xử lý cảnh báo (2026-09-30, migration 0010): loại "theo dõi" (`don-gia-bat-thuong`, `sap-het-bao-hanh`) bỏ
  qua được từng mục (`canh_bao_bo_qua`, loại trừ ngay trong SQL nên số đếm/badge khớp; có hoàn tác) — loại cần
  hành động thật (quá hạn, tồn âm…) KHÔNG bỏ qua được. Đơn giá bất thường kèm đề xuất so với giá ĐA SỐ các lần
  nhập mua: giá tham khảo sai → nút sửa (ghi `vt_gia_log`); đơn giá phiếu sai → chỉ mở phiếu, KHÔNG tự sửa
  chứng từ đã duyệt. Quyền: Admin/HCNS/Kế toán.
- PWA (2026-09-30): `frontend/public/manifest.webmanifest` (`display: standalone`) + `sw.js` (không cache
  `/api`, chỉ giữ khung trang `/` khi mất mạng; chỉ đăng ký ở bản build) + nút "Cài đặt ứng dụng" cuối
  sidebar (`CaiDatAppButton`, `lib/caiDatApp.ts`). Logo/icon sinh từ `logo.png` gốc (nền trắng) bằng
  `python scripts/tao_icon_pwa.py` — KHÔNG dùng thẳng `logo.png` gốc trên nền teal (lộ viền trắng).
- Tìm kiếm LIKE của SQLite chỉ không phân biệt hoa/thường với ký tự ASCII — chữ có dấu (Đ/đ, Ă/ă…)
  vẫn phân biệt hoa/thường.

**Dev local đang dùng khi làm 1.6** (vì `workerd` mồ côi giữ cổng 8791/8792 + DB cũ): worker chạy
`npx wrangler dev --config ../wrangler.jsonc --env local --persist-to ../.wrangler/state_dev --port 8793`
(trong `backend/`, `state_dev` = bản sao DB production); Vite đọc cổng API từ biến `CCDC_API_PORT`
(`frontend/.env.development.local`, mặc định 8791). User test theo vai trò: `admin|kt|hcns|ql|tk|nv
@test.local` qua `/api/auth/dev-login?email=`.

## Đính kèm hóa đơn / chứng từ / ảnh bằng chứng (Google Drive, 2026-10-02)

Port từ `vi-pham-app` (skill `qlbh3t-cf-integrations` phần 1), migration 0013. Tệp lưu trên Drive của 1 tài
khoản Google THẬT do Admin kết nối (thẻ "Lưu trữ hóa đơn…" ở Cấu hình → Tài khoản & phân quyền, route
`routes/settings.ts`, refresh_token mã hoá `lib/secretBox.ts`); D1 chỉ giữ `dinh_kem` (drive_file_id + metadata).
- `doi_tuong` ∈ `chuyen_kho|giao_nhan|xu_ly|tai_san`; xem tài sản = tệp của chính TS + tệp trên phiếu xử lý /
  giao nhận có TS đó (kèm `nguon_ma`). Tạo TSCĐ mới (`POST /ccdc`) → tệp gắn vào phiếu nhập `xu_ly` (`phieu_id`).
- Upload: body BYTES thô (Content-Type = mime thật), ảnh nén ở client (`lib/dinhKem.ts` `nenAnh`, ≤1920px JPEG),
  tối đa 10MB, chỉ ảnh/PDF. Quyền tải: Admin/KT/HCNS, người lập, người liên quan (mã NV), thủ kho 2 đầu. Xoá = xoá
  MỀM (người tải hoặc Admin/HCNS), tệp trên Drive giữ nguyên để đối chiếu.
- Frontend: `components/DinhKem.tsx` — `DinhKem` (khung trong popup chi tiết phiếu/TS) và `ChonTep` (form lập
  phiếu: chọn trước, tải lên SAU khi phiếu tạo xong qua `taiLenTepCho`). Phiếu Nhập mua chưa có Hóa đơn → nhắc.
- Không test upload thật ở local được (cần OAuth + redirect URI đúng origin) — local chỉ test nhánh "chưa kết nối".

## Quy ước UI dữ liệu (2026-10-13, user yêu cầu)

- **Bấm được phải nhìn ra được**: số liệu bấm được trong bảng dùng `.so-link` (nút/span: xanh link, gạch chân chấm),
  mã phiếu `.code-link`, dòng bấm được `.row-clickable` (tự có mũi tên › cuối dòng), `KpiCard` có `onClick` tự hiện
  mũi tên ↗ góc phải. KHÔNG làm số/ô bấm được mà trông như chữ thường.
- **Ô chọn**: dùng `ChonLoc` (`components/ChonLoc.tsx`) thay `<select>` — viết y như select (`<option>` con,
  `onChange={(e) => set(e.target.value)}`); > 5 lựa chọn tự thành ô có tìm kiếm (bỏ dấu), ≤ 5 vẫn là select gốc.
  Danh sách lớn cần lọc server (nhân viên, vật tư) vẫn dùng `SearchSelect`.
- **Làm nổi bật dữ liệu bảng** (`components/NoiBat.tsx`): `LoaiChip` (loại phiếu: icon + màu), `KhoTag` (icon màu theo
  loại kho), `NguoiTag`, `NgayCho` (ngày + tuổi chờ, >24h vàng, >48h đỏ), `SoTon` (âm đỏ, 0 xám), `TienTe`. Dòng cần xử
  lý: `row-canh-bao` (viền đỏ) / `row-chu-y` (viền vàng). Màu theo Ý NGHĨA: đỏ = phải xử lý, vàng = sắp tới hạn.
- **Cột Ghi chú trong bảng** (2026-11-25, user: "trong danh sách import tiêu hao hoặc tài sản đều có ghi chú => bổ sung các cột
  ghi chú này trong các table liên quan, tương tự khi tải file danh sách về"): `GhiChuO` (NoiBat.tsx, class `.nb-ghi-chu` cắt 2
  dòng, rê chuột xem đủ) ở cột cuối các bảng: phiếu tiêu hao (ChuyenKhoScreen), danh mục TSCĐ (DanhMucCcdcScreen), phiếu giao nhận
  TSCĐ (GiaoNhanScreen), lịch sử trong hồ sơ vật tư (ChiTietVatTu). Xuất Excel của phiếu tiêu hao, danh mục TSCĐ, lịch sử vật tư
  đều có cột Ghi chú. Bảng mới hiển thị phiếu / tài sản có `ghi_chu` → thêm cột này + cột Excel tương ứng.
  Màn Cấp phát & điều chuyển TSCĐ có nút "Xuất Excel" (2026-11-25, v1.009): xuất các dòng đang lọc (tháng + loại + tab xác nhận) —
  Mã phiếu, Loại, Từ, Đến, Số TS, Tài sản, Người lập, Ngày lập, Xác nhận, Ghi chú (`tuDenChu` / `trangThaiChu` trong GiaoNhanScreen).

## Menu 2 lớp + hồ sơ nhân viên + bảng kiểu Excel (2026-11-12)

- **Menu** (`lib/menu.ts`): Tổng quan / Việc cần làm / Cảnh báo ở trên cùng, còn lại là MENU MẸ (Tài sản cố định, Vật tư
  tiêu hao, Kho, Báo cáo, Cấu hình) — bấm mới xổ menu con, chỉ mở 1 menu mẹ 1 lúc, tự mở menu mẹ chứa màn đang xem
  (`Layout.tsx`). Menu con có `icon`, `phan` (tiêu đề phần trong Báo cáo); số đỏ menu mẹ = tổng menu con khi thu gọn.
  Thêm màn mới = thêm `MenuChild` vào đúng menu mẹ (`duocMoTab` đọc từ children).
- **Hồ sơ nhân viên** (`components/ChiTietNhanVien.tsx`, `GET /nhan-vien/:ma/ho-so`, `useChiTiet().moNhanVien(ma)`): popup
  95% màn (`Modal size="xl"`), mở từ tìm kiếm trên cùng (nhóm Nhân viên xếp ĐẦU) và tên NV ở màn Nhân viên. Tab: tài sản
  đang giữ, tiêu hao theo mặt hàng, lịch sử cấp phát tiêu hao, lịch sử giao nhận TS, "Danh sách nhân sự" (cấp dưới trực tiếp +
  gián tiếp, CTE đệ quy theo `quan_ly_id` ≤ 6 cấp, chỉ hiện khi có). Quyền = phạm vi tìm kiếm (chính mình /
  `pv.toanBo` / `pv.nhomMaNv`) + NV thuộc công ty tài khoản; dữ liệu lọc theo công ty đang xem. "Đã nhận (tiêu dùng)" =
  phiếu Cấp phát NV `Da giao` + `da_xac_nhan` (tiêu hao cấp cho NV coi như dùng hết).
- **UI chi tiết thống nhất** (2026-11-12): MỌI popup chi tiết (phiếu tiêu hao / giao nhận / xử lý, tài sản, vật tư, nhân viên)
  95% màn (`Modal size="xl"`), mở chồng nhau qua `useChiTiet()` (context ở `components/LienKet.tsx`, KHÔNG định nghĩa lại
  trong ChiTiet.tsx). Thông tin liên quan bấm được bằng `NvLink` / `PhieuLink` / `TsLink` / `VtLink` (LienKet.tsx) hoặc
  `NguoiTag ma=` (NoiBat) — tên NV ở bảng mới PHẢI truyền mã để mở hồ sơ. Phiếu + tài sản có `LuongNgang` (luồng quy trình
  ngang + nút "Xem chi tiết" xổ thông tin phụ / nhật ký; nút thao tác để ngoài) — mốc tính trong `mocPhieu` / `mocTaiSan`
  (ChiTiet.tsx). Người lập / xử lý / kiểm kê là EMAIL → backend trả thêm `<x>_nv`, `<x>_ten` qua `NV_THEO_EMAIL(cot, x)`
  (lib/nhanCongTy.ts). `GET /ccdc/:id` trả thêm `kiem_ke`; lịch sử tài sản gộp giao nhận + xử lý + kiểm kê (`lichSuTaiSan`).
- **`components/BangLoc.tsx`** = bảng kiểu Excel dùng chung (lọc theo kiểu cột chữ/chọn/ngày/số + sắp xếp trên tiêu đề, đếm
  dòng sau lọc, xoá lọc, xuất Excel dòng đang lọc, phân trang 50) — LỌC Ở TRÌNH DUYỆT, chỉ cho bảng đã tải đủ dữ liệu.
  Bảng mới dùng component này; các bảng cũ chưa chuyển (bảng phân trang server cần gửi lọc lên server).

## Đa ngôn ngữ VI / EN / ID (2026-10-07)

`frontend/src/lib/i18n.ts`, kiểu gettext: **khoá = chính chuỗi tiếng Việt gốc** — `t("Tổng quan")`,
`t("Đã thêm {ten}.", { ten })`. Từ điển `lib/i18n/en.ts`, `lib/i18n/id.ts` (thiếu khoá → hiện tiếng Việt).
Ngôn ngữ lưu `localStorage.ccdc_lang` (mặc định `vi`), đổi qua ô `ChonNgonNgu` (topbar + màn đăng nhập) =
lưu rồi **tải lại trang** — nhờ vậy các hằng nhãn cấp module (`nhan.ts`, `menu.ts`…) gọi `t()` lúc import vẫn
đúng ngôn ngữ. Số/tiền định dạng theo `LOCALE`.
- Chuỗi UI MỚI (JSX text, `placeholder`/`title`/`aria-label`/`data-label`, toast, nhãn) PHẢI bọc `t()` rồi
  thêm bản dịch vào CẢ `en.ts` và `id.ts`. Không ghép câu bằng `+`/template — dùng tham số `{x}`.
- Chuỗi tiếng Việt do BACKEND gửi về và hiển thị nguyên văn (việc cần làm, cảnh báo, nhãn KPI, nhật ký…) bọc
  `tS()` ở frontend + khai báo chuỗi/mẫu (`{tham_so}`) trong `lib/i18n/server.ts` + dịch. Sửa câu chữ backend
  thì sửa luôn ở đây. Dữ liệu người dùng nhập (tên kho, nhóm, vật tư) KHÔNG dịch.
- Kiểm tra: `python scripts/i18n_kiem_tra.py` (thiếu bản dịch / lệch tham số / chuỗi có dấu chưa bọc `t()`;
  `--json` xuất khoá thiếu). Script KHÔNG bắt được chuỗi tiếng Việt không dấu ("Kho", "Trong kho") — tự soát.
  `scripts/i18n_boc.py` là công cụ bọc tự động dùng 1 lần, không chạy lại trên code đã bọc.
- Không đặt biến cục bộ tên `t` trong file đã import `t` (che hàm dịch).

## Tài liệu hướng dẫn sử dụng (DOCX, 2026-10-01)

`scripts/huong_dan/`: chụp màn hình thật bằng Playwright (Chrome cài sẵn, `pip install playwright`) trên **bản
sao production local** rồi dựng DOCX bằng python-docx. Quy trình: export production → `nap_du_lieu.py` nạp vào
`../.wrangler/state_hd` (+ tài khoản đào tạo `hcns|kt|admin|nv@test.local`, hồ sơ `DT-NV01`, `DT-HCNS`) → chạy
worker `ccdc-huong-dan` (launch.json, cổng 8797) → `python chup_hcns.py <cảnh…>` (ảnh vào
`../.wrangler/huong_dan/anh/`; các cảnh có GHI dữ liệu - chạy lại sẽ tạo phiếu trùng, nạp lại DB nếu cần) →
`python tao_docx_hcns.py` → `cap_nhat_word.ps1` (Word COM: điền mục lục + xuất PDF). Kết quả `docs/*.docx|pdf`
(không commit). Vai trò khác: thêm `chup_<vai_tro>.py` + `tao_docx_<vai_tro>.py`, dùng chung `hd.py`/`docx_lib.py`.
Quản lý + Nhân viên (2026-10-03): `nap_ql_nv.py` (worker TẮT: thêm `ql@test.local`/`DT-QL`, `DT-NV02`, kho QL, giả lập
Drive đã kết nối) → `chup_ql_nv.py chuan_bi …` (Playwright giả lập `POST /api/dinh-kem` + thumbnail Drive bằng ảnh mẫu
`tao_anh_mau.py`) → `tao_docx_quan_ly.py`, `tao_docx_nhan_vien.py`.

## Quy ước chung (giống hệ QLBH 3T)

- `run_worker_first: ["/api/*"]` trong `assets` của `wrangler.jsonc` là bắt buộc — thiếu sẽ bị SPA
  fallback chặn request `/api/*` thật (navigate) trước khi tới Worker.
- `wrangler dev` (`npm run dev:worker`) cần `frontend/dist` tồn tại trước (chạy `npm run build`
  hoặc `npm run build --workspace frontend` ít nhất 1 lần) — Worker sẽ báo lỗi nếu thư mục chưa có.
- **Mọi thời gian lưu/xử lý theo giờ VN (UTC+7)** (user chốt 2026-10-01): MỌI INSERT/UPDATE phải tự
  ghi `created_at`/`updated_at`/timestamp bằng `nowVN()` (`backend/src/lib/vnTime.ts`, format
  `YYYY-MM-DD HH:MM:SS`) hoặc `datetime('now', '+7 hours')` trong SQL — KHÔNG để rơi vào
  `DEFAULT (datetime('now'))` của cột (= UTC, lệch 7 giờ). Dữ liệu cũ đã dời +7h ở migration 0012
  (users, kho, ccdc, vt_tieu_hao, kho_thu_kho).
- `vai_tro` CHECK-constrained trên `users` (xem mục đa kho ở trên), NULL = Nhân viên (mặc định sau khi được duyệt).
- Mọi thao tác ghi nhiều bảng cùng lúc (tạo phiếu + line item + cập nhật `ccdc`...) PHẢI dùng
  `db.batch()` của D1 — không tách nhiều `run()` rời rạc (D1 không tự rollback nếu 1 lệnh giữa
  chừng lỗi).
- Kiểm kê chỉ ghi nhận chênh lệch, KHÔNG tự động sửa `ccdc.trang_thai_hien_tai`/`nguoi_dang_giu` —
  sửa thực tế phải qua 1 `phieu_giao_nhan` điều chỉnh riêng, có người chịu trách nhiệm.
- Chỉ cho đề xuất thanh lý/tiêu hủy TSCĐ đang nằm trong kho (`trang_thai_hien_tai IN ('Trong kho',
  'Hong')`, không ai giữ) — phải qua Kế toán duyệt (`phieu_xu_ly_ts`).
- **Tiêu hủy bắt buộc mã EO** (2026-10-13, migration 0018, `phieu_xu_ly_ts.ma_eo`): mã phê duyệt từ hệ thống EO Mua
  hàng, nhập tay (trim + viết hoa, ≤50 ký tự, KHÔNG đối chiếu với hệ EO). Thiếu → lỗi `CAN_MA_EO`. Phiếu tiêu hủy cũ
  chưa có mã → bổ sung lúc "Hoàn tất". Thanh lý không cần.

## Số phiên bản

`frontend/src/version.ts` `APP_VERSION` (hiện ở chân sidebar, kiểu linh-kien-app): tăng 0.001 MỖI lần deploy production
("1.001" → "1.002"…), sửa tay và commit chung với thay đổi TRƯỚC khi deploy.

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

## Nhận việc từ Trợ lý Mây (tự sửa)
- Issue gắn nhãn `may:phan-tich` là ĐỀ XUẤT CẢI TIẾN cần phân tích trước: workflow `may-phan-tich` chỉ ĐỌC mã để soạn BRD cho Giám đốc duyệt — không sửa mã ở bước này. Khi duyệt, BRD nằm ở đầu issue; làm đúng BRD và lưu nó vào `docs/yeu-cau/MAY-xxxxx.md`.
- Issue gắn nhãn `may:tu-sua` là việc do Trợ lý Mây chuyển sang, mã `MAY-xxxxx` ở tiêu đề. Sửa ĐÚNG phạm vi mô tả.
- Kiểm tra bắt buộc trước khi mở PR: `npm run build` (eslint chạy trước; đỏ = dừng). Flutter: `flutter analyze && flutter build web`.
- Nhánh `may/may-xxxxx`, PR vào `main`, tiêu đề bắt đầu bằng mã, mô tả tiếng Việt (nguyên nhân · cách sửa · cách thử), ghi `Closes #<issue>`.
- KHÔNG BAO GIỜ: sửa `firestore.rules`/`storage.rules`/hàm `hrLink`/secrets; chạy `firebase deploy` trần; đổi tính năng ngoài issue; xoá dữ liệu.
- Không chắc / cần người quyết: bình luận `MÂY: CẦN NGƯỜI` + lý do rồi dừng.
- Deploy do workflow `may-deploy` làm sau khi được duyệt — KHÔNG tự deploy trong lúc sửa.
- Khi làm việc TRONG PHIÊN NÀY (không phải workflow) mà bản sửa giải quyết một issue Mây đang mở (`gh issue list --label may:cho-duyet,may:tu-sua`): ghi mã `MAY-xxxxx` vào dòng đầu commit → Trợ lý Mây tự báo hoàn thành, không cần Giám đốc bấm tay.

<!-- may-ba-lan -->
## Ba làn xử lý của Trợ lý Mây (Giám đốc chốt 18/11/2026 — áp dụng VĨNH VIỄN cho app này)
Mỗi việc Mây giao thuộc MỘT trong ba làn. Khi viết ý tưởng / BRD, dòng đầu ghi `**Làn:** nhanh | thường | đầy đủ — <lý do 1 câu>`.
Mây xếp sai thì app ghi đúng làn: app ghi **nhanh** → Mây chuyển ngay sang làn nhanh (không đợi duyệt).
- **Làn nhanh** — xử lý trọn, KHÔNG qua duyệt, vài phút là xong (như Giám đốc chat trực tiếp với phiên này):
  lệnh của Giám đốc · cấp / sửa / thu hồi quyền cho người cụ thể · dữ liệu sai / trùng / kẹt (huỷ mềm, mở lại, đẩy lại, sửa trường có bằng chứng) ·
  thêm / sửa danh mục, cấu hình · lỗi rõ ràng sửa nhỏ không đổi luật · hỏi cách dùng (app đã làm được → hướng dẫn Cách 1 / Cách 2) · lấy số liệu.
  Cách làm: tra dữ liệu thật → ghi dữ liệu qua khối `may-thao-tac` (Mây tự ghi, lưu trước/sau) → sửa luôn nguyên nhân nếu là lỗi mã →
  kiểm → `## BÁO CÁO KẾT QUẢ` (Đã làm · Vì sao bị · Đã sửa · Không đụng tới). Cấp quyền: khai `cap_quyen` { nguoi, vai, vai_cao }.
- **Làn thường** — cải tiến nhỏ (thêm cột / bộ lọc / nút, đổi hiển thị, sắp xếp): ý tưởng + cách làm MỘT bản cụ thể, Giám đốc duyệt 1 lần là làm luôn.
- **Làn đầy đủ** — đổi luật / cách tính, tính năng lớn, đụng tiền / lương / thưởng / công nợ, phân quyền cả nhóm / chức danh, xoá thật,
  hồ sơ nhân sự, Upload Lada: đủ các bước ý tưởng → BRD → thẩm định → Giám đốc duyệt.
Phân vân giữa hai làn → chọn làn CAO hơn (an toàn hơn).

<!-- may-loi-du-lieu -->
## Máy chạy sai luật đã chốt = LỖI, sửa luôn (Giám đốc chốt 22/11/2026 — áp dụng VĨNH VIỄN)
- Dữ liệu / kết quả máy tạo ra sai so với luật Giám đốc đã chốt (đếm sai, chia sai người, lọc sai nhóm…) là **lỗi** → **làn nhanh**:
  sửa cho đúng luật đã chốt, chạy lại hoặc đếm số bản ghi bị sai, báo NGẮN (lỗi gì · vì sao · đã sửa · bao nhiêu bản ghi). Không đụng dữ liệu
  đã đẩy sang hệ thống ngoài (Lada…) — chỉ liệt kê để người điều phối xử lý.
- KHÔNG biến lỗi thành đề xuất đổi luật, KHÔNG hỏi lại Giám đốc điều luật đã chốt, KHÔNG viết dài theo khuôn làn đầy đủ.
- Người báo hỏi thêm việc khác trong cùng báo cáo → ghi 1 dòng "Tách việc riêng: …", không gộp vào bản sửa lỗi.
