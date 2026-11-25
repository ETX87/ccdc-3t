# CLAUDE.md — ccdc-app (Quản lý CCDC 3T, Worker `ccdc`), bản RÚT GỌN

> File này chỉ giữ luật chính + chỉ đường (giữ **dưới 10 KB** — app chủ trên đám mây đọc mọi kho).
> **Chi tiết đầy đủ** (đa kho, đa pháp nhân, kho tiêu hao, tồn tối thiểu, đính kèm Drive, menu, đa ngôn ngữ, gotcha wrangler đầy đủ):
> [`CLAUDE-full.md`](CLAUDE-full.md) — mở khi cần đụng tới mảng tương ứng (tìm theo từ khóa / tên migration).
> **Quy ước ghi**: tính năng / quyết định mới → ghi chi tiết vào `CLAUDE-full.md`; ở đây chỉ thêm khi là LUẬT CHUNG mới.

## Hệ thống là gì

App quản lý công cụ, dụng cụ (CCDC) / tài sản và vật tư tiêu hao của công ty 3T: nhập mua, cấp phát / điều chuyển giữa kho, kiểm kê,
báo hỏng, thanh lý / tiêu hủy, tồn kho. Độc lập: Worker `ccdc`, D1 `ccdc-db`, `users` riêng; dùng chung tài khoản Cloudflare + Google OAuth
Client với các app QLBH 3T. Logic nghiệp vụ đang chạy: [`TONG_HOP_LOGIC.md`](TONG_HOP_LOGIC.md).

**Vai trò** (`users.vai_tro`, có CHECK): `Admin`, `Ke toan` (duyệt nhập mua / báo hỏng / thanh lý / tiêu hủy), `HCNS`, `Quan ly`; NULL = Nhân viên.
Thủ kho = bảng gán `kho_thu_kho`. Kho: Mua hàng (nguồn ảo) → HCNS → Miền / Trung chuyển → Quản lý → NV; tồn tiêu hao tính qua view `v_ton_kho`.
**Mọi kiểm quyền theo kho ở server** (`backend/src/lib/quyen.ts`) — không tin `kho_id` client gửi; "xuất" (`khoPhuTrach`) ≠ "nhận" (`khoNhanHang`).

## Lệnh

```bash
npm install
npm run build --workspace frontend   # bắt buộc trước lần dev:worker đầu tiên (Worker cần frontend/dist)
npm run db:migrate:local             # có --env local (xem gotcha)
npm run dev:worker                   # port 8791, --env local
npm run dev:frontend                 # port 5177, proxy /api -> 8791
npm run deploy                       # Worker THẬT
```
Đăng nhập DEV chỉ hiện khi chạy qua `vite dev`.

## Gotcha wrangler đã gặp thật (chi tiết `CLAUDE-full.md`)

- `.dev.vars` KHÔNG được `wrangler dev` đọc → giá trị dev nằm ở `env.local.vars` trong `wrangler.jsonc`, script dev chạy `--env local`.
  KHÔNG xoá `env.local`, KHÔNG chuyển giá trị dev-only lên `vars` top-level.
- Binding top-level (`d1_databases`, `services`…) KHÔNG kế thừa sang `env.local` → khai báo lại tường minh trong `env.local`.
- `db:migrate:local` PHẢI có `--env local` (thiếu thì migrate nhầm file SQLite khác).
- Đổi CHECK trên D1: `PRAGMA defer_foreign_keys = true;` → `CREATE TABLE x_bak AS SELECT…` → `DROP x` → tạo lại `x` → `INSERT … FROM x_bak` → `DROP x_bak`.
  KHÔNG dùng `CREATE x_new` + `RENAME` (lỗi FK, rollback cả migration).
- Nạp bản export production vào local: dựng SQLite bằng Python rồi chép đè file `.sqlite` local, không `wrangler d1 execute --local --file`.
- `workerd` mồ côi giữ `.wrangler/state` → test DB sạch dùng `--persist-to` thư mục khác + `--port` khác.

## Luật bắt buộc

1. **Tăng `APP_VERSION`** (`frontend/src/version.ts`, +0.001, sửa tay) và commit chung TRƯỚC khi deploy production.
2. **Commit trước, deploy sau.** Commit xong đẩy `etx87` (+ `origin` nếu có); không force-push; có commit tự động → `git fetch` + `git merge`.
3. Mỗi lần đổi code, trong CÙNG commit: ghi `nhat_ky_lam_viec.md` (mục mới ở ĐẦU file), sửa đè mục liên quan `TONG_HOP_LOGIC.md`
   (+ `SRS_tong_hop.md` nếu yêu cầu đổi), thêm mục chi tiết vào `CLAUDE-full.md`.
4. Không đẩy bí mật lên repo (`cookies.txt`, `.dev.vars` đã trong `.gitignore`); không ghi khoá / mật khẩu vào tài liệu.
5. `assets.run_worker_first: ["/api/*"]` trong `wrangler.jsonc` là bắt buộc.
6. **Giờ VN (UTC+7)**: mọi INSERT/UPDATE tự ghi thời gian bằng `nowVN()` (`backend/src/lib/vnTime.ts`) hoặc `datetime('now','+7 hours')` —
   KHÔNG để rơi vào `DEFAULT (datetime('now'))` (UTC).
7. Ghi nhiều bảng cùng lúc → `db.batch()` (D1 không tự rollback các `run()` rời).
8. Kiểm kê chỉ ghi chênh lệch, không tự sửa `ccdc.trang_thai_hien_tai` / `nguoi_dang_giu` — sửa qua phiếu giao nhận điều chỉnh.
9. Thanh lý / tiêu hủy chỉ TSCĐ đang trong kho, qua Kế toán duyệt (`phieu_xu_ly_ts`); **tiêu hủy bắt buộc mã EO** (`CAN_MA_EO`).
10. Kiểm "kho phát chung" dùng `laKhoPhatChung()` (BE `quyen.ts`, FE `lib/nhan.ts`), không so `=== "Mien"` rời rạc.

## Giao diện (bắt buộc theo [`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md))

- Sidebar 261px gradient Deep Teal, nền trang `#F7FBFE`, card trắng viền mờ; font Plus Jakarta Sans; bố cục module 4 tầng
  (sub-header → KPI → khung làm việc → cảnh báo / form).
- Tái sử dụng class trong `frontend/src/styles.css`, không tự viết CSS rời / thêm thư viện UI.
- Bấm được phải nhìn ra được (`.so-link`, `.code-link`, `.row-clickable`); ô chọn dùng `ChonLoc` thay `<select>`; làm nổi bật dữ liệu bằng
  `components/NoiBat.tsx`; bảng kiểu Excel (lọc + sắp xếp trên tiêu đề), bộ lọc mặc định chọn nhiều.
- Đa ngôn ngữ VI / EN / ID — xem `CLAUDE-full.md`.

## Tài liệu

| File | Nội dung |
|---|---|
| `CLAUDE-full.md` | Toàn bộ chi tiết kỹ thuật + quyết định theo từng tính năng |
| `TONG_HOP_LOGIC.md` | Logic nghiệp vụ đang chạy thật |
| `nhat_ky_lam_viec.md` | Nhật ký từng đợt (mới nhất ở đầu) |
| `SRS_tong_hop.md`, `DEPLOY.md`, `DESIGN_SYSTEM.md`, `AGENT_INSTRUCTIONS.md` | Đặc tả, deploy, giao diện, hướng dẫn agent |
| `docs/` | Tài liệu hướng dẫn sử dụng |

## Nhận việc từ Trợ lý Mây

- Nhãn `may:phan-tich` = chỉ ĐỌC mã soạn BRD, không sửa. Nhãn `may:tu-sua` = sửa ĐÚNG phạm vi issue `MAY-xxxxx`
  (BRD đã duyệt lưu vào `docs/yeu-cau/MAY-xxxxx.md`).
- Trước PR: `npm run build` phải xanh. Nhánh `may/may-xxxxx`, PR vào `main`, tiêu đề bắt đầu bằng mã, mô tả tiếng Việt
  (nguyên nhân · cách sửa · cách thử), ghi `Closes #<issue>`.
- KHÔNG: sửa secrets / luật bảo mật, deploy trần, đổi tính năng ngoài issue, xoá dữ liệu. Không chắc → bình luận `MÂY: CẦN NGƯỜI` + lý do rồi dừng.
  Deploy do workflow `may-deploy` làm sau khi duyệt — không tự deploy trong lúc sửa.
- Làm trong phiên thường mà giải quyết issue Mây đang mở (`gh issue list --label may:cho-duyet,may:tu-sua`) → ghi mã `MAY-xxxxx` ở dòng đầu commit.
- Ba làn xử lý và luật "máy chạy sai luật = lỗi": xem 2 mục cuối file (workflow Mây tự đồng bộ, không sửa tay).

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
