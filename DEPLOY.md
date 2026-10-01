# DEPLOY.md — Checklist triển khai lần đầu (CCDC 3T)

> **Xử lý cảnh báo (2026-09-30, migration `0010_canh_bao_xu_ly.sql`)** — chỉ THÊM 2 bảng (`canh_bao_bo_qua`,
> `vt_gia_log`), an toàn dữ liệu thật. Áp cùng lúc với 0009: `npm run db:migrate:remote` sau khi backup. Thiếu
> 0010 thì màn Cảnh báo lỗi (truy vấn đơn giá bất thường / sắp hết bảo hành tham chiếu `canh_bao_bo_qua`).

> **Ghép nhân sự dữ liệu cũ vào hồ sơ ETX (2026-09-30)** — NÊN chạy TRƯỚC khi deploy bản 0009 (đồng
> bộ hằng ngày có thể tự thêm hồ sơ NS-… làm lệch snapshot → file SQL tự rollback, phải sinh lại):
> 1. Xuất JSON production mới (`nv.json`, `tentudo.json`, `kho.json`, `etx_full.json`) vào
>    `../_backup_ccdc/ghep_nv/` — đăng nhập wrangler bằng tài khoản `smarttrade.vp@gmail.com`.
> 2. `python scripts/ghep_nhan_su_etx.py` → HCNS duyệt cột "Mã ETX chốt" trong `ghep_nhan_su_etx.xlsx`.
> 3. `python scripts/ghep_nhan_su_etx_sql.py` → `ghep_nhan_su_etx.sql` (dừng + in lỗi nếu mã sai / xung đột).
> 4. Backup: `npx wrangler d1 export ccdc-db --remote --output ../_backup_ccdc/prod-truoc-ghep.sql`
> 5. `npx wrangler d1 execute DB --remote --config wrangler.jsonc --env="" --file=../_backup_ccdc/ghep_nv/ghep_nhan_su_etx.sql`
>    Đầu file có guard: production lệch snapshot → lỗi `CHECK constraint failed: x = 1`, không ghi gì.

> **ĐÃ TRIỂN KHAI 2026-10-01** (version `8b4667cf`): backup `../_backup_ccdc/prod-truoc-ghep-0009-20261001.sql`
> → ghép nhân sự dữ liệu cũ vào hồ sơ ETX (`scripts/ghep_nhan_su_etx.py` + `ghep_nhan_su_etx_sql.py`, CHỈ dòng
> "Chắc chắn": 377 dòng; nhân viên 1.832 → 1.712, phiếu tên tự do 2.622 → 1.051, kho QL không chủ 2 → 0, tồn kho
> không đổi) → migrate 0009 + 0010 → deploy (ETX hằng ngày + tự cấp tài khoản, phân trang, PWA, xử lý cảnh báo).
> Còn chờ HCNS: 42 dòng gợi ý/cần chọn tay + ~100 tên không có trên ETX trong
> `../_backup_ccdc/ghep_nv_1001/ghep_nhan_su_etx.xlsx` — duyệt xong thì xuất lại snapshot, chạy lại bước 1+2.

> **Cập nhật 2026-09-30 (đồng bộ ETX hằng ngày + tự cấp tài khoản)** — thứ tự deploy:
> 1. Backup: `npx wrangler d1 export ccdc-db --remote --output ../_backup_ccdc/prod-truoc-0009.sql`
> 2. `npm run db:migrate:remote` — áp `0009_etx_tai_khoan.sql` (chỉ thêm cột `etx_sync_state.tai_khoan_count`).
> 3. `npm run build --workspace frontend` rồi `cd backend && npx wrangler deploy --config ../wrangler.jsonc --env=""`.
> 4. Bắt buộc đã có secret `ETX_HR_API_KEY`. Lần đồng bộ đầu (nút "Đồng bộ ETX" hoặc cron 0h) sẽ tạo +
>    duyệt tài khoản Nhân viên cho mọi nhân sự đang làm việc có Gmail trên ETX.

> **Cập nhật Giai đoạn 1.6 (giao diện 3T Asset Management chạy dữ liệu thật, 2026-09-24)** — production
> đã có 0006/0007 + dữ liệu cũ. Thứ tự deploy bản giao diện mới:
> 1. Backup: `npx wrangler d1 export ccdc-db --remote --output ../_backup_ccdc/prod-truoc-0008.sql`
> 2. `npm run db:migrate:remote` — áp `0008_giao_dien.sql`: cột `ma_phieu` (phiếu cũ giữ mã `ID-…`,
>    phiếu tạo trong app sinh `NM/CK/CP/GN/NT/BH/TL/TH/KK-YYMM-0001`), bảng đếm `ma_phieu_seq`,
>    `users.anh_dai_dien`, bảng chụp số liệu `thong_ke_ngay`, sửa 2 đơn giá nhập sai của dữ liệu cũ
>    (TS3T-000045 17.000.000 → 17.000đ, TS3T-000089 4.140.000 → 13.800đ; idempotent).
> 3. `npm run build --workspace frontend` rồi
>    `cd backend && npx wrangler deploy --config ../wrangler.jsonc --env=""` (chọn rõ cấu hình
>    top-level, không lẫn `env.local`). Cron đổi thành **hằng ngày** `0 17 * * *` (0h giờ VN): chụp
>    `thong_ke_ngay` mỗi ngày (cho % "so với kỳ trước"); đồng bộ ETX vẫn chỉ chạy khi là Chủ nhật.
> 4. Kiểm tra: `/api/health`, đăng nhập Google thật, Tổng quan khớp số SQL production.
> 5. `scripts/generate_import_sql.py` đã cập nhật theo 0008 (`ma_phieu = id` cho phiếu cũ + giá đã
>    sửa) — chỉ chạy sau khi đã migrate đủ 0001→0008.

> **Cập nhật Giai đoạn 1.5 (đa kho + vai trò KT/HCNS/QL + đồng bộ ETX, 2026-09-24)** — production
> đã deploy bản Phase 1 (D1 `ccdc-db` còn trống). Thứ tự deploy bản mới:
> 1. Backup: `npx wrangler d1 export ccdc-db --remote --output ../_backup_ccdc/prod-truoc-0006.sql`
> 2. `npm run db:migrate:remote` (áp `0006_da_kho_vai_tro.sql`, `0007_etx_nhan_su.sql`).
> 3. `npx wrangler secret put ETX_HR_API_KEY` — khoá đối tác API nhân sự ETX (người dùng tự đặt;
>    thiếu khoá thì đồng bộ ghi lỗi vào `etx_sync_state`, app vẫn chạy bình thường).
> 4. `npm run build --workspace frontend && npm run deploy` (kèm cron `0 17 * * SUN` = 0h thứ Hai giờ
>    VN, đồng bộ danh bạ ETX hàng tuần).
> 5. **Import dữ liệu cũ (mục 6) TRƯỚC lần đồng bộ ETX đầu tiên** (không bấm "Đồng bộ ETX ngay"
>    trước khi import) — để ETX khớp/nhận lại các dòng `nhan_vien` cũ theo `ma_nv`/`gmail`, không
>    sinh dòng trùng người.
> 6. Sau import: HCNS vào màn **Kho** gán thủ kho (email phải đã đăng nhập 1 lần) cho Kho vận Miền
>    Bắc/Nam và các kho QL không khớp danh bạ (Lương Trung Kiên, Bùi Mạnh Khang); xử lý 8 cặp tồn âm
>    do dữ liệu cũ lệch (script in danh sách).

Các mục 1–6 dưới đây là checklist triển khai LẦN ĐẦU (đã làm xong: Worker `ccdc` + D1 `ccdc-db`
production đã tồn tại, `database_id` thật đã ghi trong `wrangler.jsonc`) — giữ lại để dựng lại môi
trường mới khi cần. App này **độc lập hoàn toàn** với `vi-pham-app`/
`linh-kien-app`/`dvbh` — không Service Binding, không partner API — chỉ dùng chung tài khoản
Cloudflare và Google OAuth Client với 2 app kia.

## 1. Thêm redirect URI vào Google OAuth Client SẴN CÓ

Dùng CHUNG 1 Google OAuth Client với `vi-pham-app`/`linh-kien-app` — **không tạo Client mới**, chỉ
hỏi lại `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` đã dùng cho 2 app kia.

1. [Google Cloud Console](https://console.cloud.google.com/) → mở đúng project chứa OAuth Client đó.
2. APIs & Services → Credentials → OAuth Client → "Authorized redirect URIs" → thêm:
   `https://ccdc.dichvu3t.workers.dev/api/auth/callback`

## 2. Tạo D1 database thật

```bash
npx wrangler d1 create ccdc-db
```

Dán `database_id` in ra vào `wrangler.jsonc` → `d1_databases[0].database_id` (thay placeholder
`REPLACE_AFTER_WRANGLER_D1_CREATE`). Xác nhận domain `ccdc.dichvu3t.workers.dev` (`name: "ccdc"`
trong `wrangler.jsonc`) chưa bị Worker nào khác trong tài khoản Cloudflare chiếm.

## 3. Đặt secrets (KHÔNG đặt trong `wrangler.jsonc`)

```bash
npx wrangler secret put GOOGLE_CLIENT_ID        # gia tri GIONG HET vi-pham-app/linh-kien-app
npx wrangler secret put GOOGLE_CLIENT_SECRET    # gia tri GIONG HET vi-pham-app/linh-kien-app
npx wrangler secret put SESSION_SECRET          # chuoi ngau nhien RIENG cho app nay, vd: openssl rand -hex 32
```

Không đặt `LOCAL_DEV_BYPASS_AUTH` khi deploy production (chỉ tồn tại trong `wrangler.jsonc`
`env.local.vars` cho dev local — xem gotcha trong `CLAUDE.md`).

## 4. Migrate + deploy

```bash
npm install
npm run build --workspace frontend
npm run db:migrate:remote
npm run deploy
```

## 5. Đăng nhập lần đầu

Mở `https://ccdc.dichvu3t.workers.dev` → đăng nhập Google bằng đúng email đặt trong
`BOOTSTRAP_ADMIN_EMAIL` (`wrangler.jsonc` → `vars`, mặc định `smarttrade.vp@gmail.com`) → tự động
lên vai trò Admin, không cần ai duyệt.

## 6. Import dữ liệu cũ (nếu chưa làm ở local)

Nếu D1 production còn trống (chưa có `ccdc`/`nhan_vien`/`vt_tieu_hao`/...), import dữ liệu cũ đã
làm sạch bằng script có sẵn:

```bash
python scripts/generate_import_sql.py    # doc CCDC_data_da_lam_sach.xlsx, sinh scripts/import_data.sql
npx wrangler d1 execute DB --remote --config wrangler.jsonc --file=scripts/import_data.sql
```

File SQL KHÔNG có `BEGIN/COMMIT` (D1 remote từ chối lệnh đó; `--file` tự chạy nguyên tử). Chạy local
mất ~6 phút (~24.600 lệnh) — đã test trên D1 local trống sau migrate 0001→0007: `foreign_key_check`
sạch, tồn `v_ton_kho` khớp đúng số script tự tính.

**Quan trọng**: script này dùng `ON CONFLICT DO NOTHING` nên chạy lại nhiều lần an toàn (không tạo
trùng), nhưng vẫn nên backup D1 trước lần chạy đầu tiên trên production
(`npx wrangler d1 export ccdc-db --remote --output backup-truoc-import.sql`). Toàn bộ quyết định ánh
xạ dữ liệu (trạng thái CCDC theo địa điểm/người giữ, mapping trạng thái phiếu tiêu hao cũ→mới) đã
được xác nhận trực tiếp với người dùng — xem comment đầu file
`scripts/generate_import_sql.py`.

## Kiểm thử local trước khi deploy thật

```bash
npm run db:migrate:local
npm run dev:worker      # port 8791, dung --env local (xem gotcha trong CLAUDE.md)
npm run dev:frontend    # port 5177, proxy /api sang 8791
```

Mở `http://localhost:5177` → nút "🔧 Đăng nhập DEV" (chỉ hiện khi `vite dev` +
`LOCAL_DEV_BYPASS_AUTH=true` trong `env.local.vars`) để vào thẳng vai trò Admin, không cần Google
OAuth thật.
