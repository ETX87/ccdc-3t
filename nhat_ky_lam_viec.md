# Nhật ký làm việc — App Quản lý công cụ dụng cụ (CCDC 3T)

> Mỗi đợt làm việc 1 mục, **mới nhất ở trên**: ngày, phiên bản, yêu cầu, đã làm gì, kiểm thử gì, việc còn dở. Chỉ ghi thêm, không xoá mục cũ.
> Không ghi tài khoản, mật khẩu, khoá hay mô tả lỗ hổng bảo mật vào file này (repo có thể công khai).

## 25/11/2026 — v1.008: Cột Ghi chú trong các bảng phiếu / tài sản

**Yêu cầu (nguyên văn):** "trong danh sách import tiêu hao hoặc tài sản đều có ghi chú => bổ sung các cột ghi chú này trong các table liên qua, tương tự khi tải file danh sách về cũng phải có cột ghi chú".

**Đã làm:** thêm cột "Ghi chú" (cắt 2 dòng, rê chuột xem đủ — component `GhiChuO`) vào bảng: Phiếu cấp phát & chuyển kho (tiêu hao), Danh mục tài sản, Cấp phát & điều chuyển TSCĐ, Lịch sử trong hồ sơ vật tư. File Excel lịch sử vật tư thêm cột Ghi chú (Excel phiếu tiêu hao và danh mục tài sản đã có sẵn). Backend không đổi (các API đã trả `ghi_chu`).

**Kiểm thử:** typecheck 0 lỗi; chạy local trên bản sao dữ liệu: 4 bảng hiện cột Ghi chú, phiếu tiêu hao / tài sản hiện đúng nội dung ghi chú cũ, không lỗi console.

**Còn dở:** màn Cấp phát & điều chuyển TSCĐ chưa có nút Xuất Excel (không thuộc yêu cầu lần này).

## 24/11/2026 — Tách CLAUDE.md thành bản rút gọn + CLAUDE-full.md (không đổi code)

- Yêu cầu (Trợ lý Mây theo lời Giám đốc): CLAUDE.md ~47 KB làm phiên Claude đám mây nặng bộ nhớ → rút dưới ~10 KB, chi tiết sang tệp riêng.
  Anh Thái: *"tạo riêng 1 file claude.md rút gọn cho đối tác, 1 file claude-full.md để dành cho việc lưu chi tiết các công việc sau này"*.
- Đã làm: `git mv CLAUDE.md CLAUDE-full.md` (giữ nguyên nội dung, thêm đầu đề); `CLAUDE.md` mới ~8,4 KB: hệ thống + vai trò, lệnh, gotcha wrangler,
  10 luật, giao diện, tài liệu, mục Trợ lý Mây. Từ nay chi tiết ghi vào `CLAUDE-full.md`.
- Kiểm thử: `wc -c CLAUDE.md` = 8.417 byte. Không đổi mã nguồn, không deploy.

## 24/11/2026 — v1.007: Cửa sổ thông tin eOffice (popup Giám đốc)

**Yêu cầu (nguyên văn):** "làm luôn cho toàn bộ hệ thống app dvbh: đặt lk, đổi trả, ông thợ, vi phạm, tiếp nhận..." (+ "thêm cả muahang", "cả ccdc") — tài liệu "API Cửa sổ thông tin — dành cho app ngoài (ETX87)".

**Đã làm:** chép nguyên bộ mã mẫu từ linh-kien-app v1.556: `backend/src/lib/cuaSoThongTin.ts` + `GET /api/cua-so` (không cần đăng nhập; Worker gọi `csApi` eOffice bằng secret `CUA_SO_KHOA`, đệm 60 giây, kèm tranh SVG) và `frontend/src/components/CuaSoThongTin.tsx` (gắn ở điểm render gốc, ngoài App → hiện cả màn đăng nhập, phủ trên mọi popup). Hiện mỗi lần mở app + khi quay lại sau ≥ 10 phút ẩn; nút "Vào app" khoá `khoaNutGiay` giây; Esc / Back chỉ đóng sau khi hết khoá. API lỗi / chậm / chưa đặt khoá → không hiện, vào app bình thường.

**Kiểm thử:** build 0 lỗi; sau deploy gọi `/api/cua-so` trên production trả đúng cửa sổ đang bật. Giao diện đã xem trên linh-kien-app (cùng 1 component).

**Còn dở:** đang dùng chung mã khoá với các app khác — nên xin mã riêng cho app này ở eOffice › Quản trị › Cửa sổ thông tin › Kết nối app ngoài rồi đặt lại secret `CUA_SO_KHOA`.

## 17/11/2026 — Tạo bộ tài liệu tổng hợp

- Yêu cầu: "dựa theo nguyên tắc tạo 3 file bắt buộc, rà soát toàn bộ các repo và tạo 3 file rồi đẩy lên repo etx87".
- Tạo `nhat_ky_lam_viec.md` (file này), `TONG_HOP_LOGIC.md`, `SRS_tong_hop.md`.
- Phần "Lịch sử dựng lại từ Git" bên dưới sinh tự động từ commit (bỏ commit gộp nhánh + commit tự động Workflow Mây). Từ nay ghi tay mục mới ở trên.

## Lịch sử dựng lại từ Git (62 commit, 2026-09-30 → 2026-11-17)

### 2026-11-12
- Bo dai tab trung voi menu con o Bao cao / Kho / Vat tu tieu hao (tieu de trang = muc dang xem) - v1.006 (`0453a95`)
- Ho so nhan vien: tab 'Danh sach nhan su' dang quan ly (truc tiep + gian tiep, TS dang giu, phieu tieu hao) - v1.005 (`14bab28`)
- UI chi tiet thong nhat 95%: phieu (luong quy trinh ngang + xem chi tiet), tai san (vong doi + lich su gop giao nhan/xu ly/kiem ke), vat tu, nhan vien; ma phieu / tai san / vat tu / ten nhan vien bam mo chi tiet lien quan - v1.004 (`bd3f9e0`)
- Menu 2 lop (menu me xo menu con); ho so nhan vien popup 95% tu tim kiem (tai san, tieu hao, lich su, loc/sap xep cot kieu Excel, xuat Excel) - v1.003 (`e9d5350`)
- Nhan cong ty truoc ten kho / nhan vien + cot Ghi chu khi xuat Excel phieu tieu hao, v1.002 (`876ad07`)

### 2026-11-07
- Giao dien mobile + so phien ban v1.001 (`d19d431`)

### 2026-11-06
- perf: Viec can lam chi tu tai lai khi tab dang hien + cache so canh bao badge 2 phut trong isolate (~230M rows read/ngay) (`dc56e46`)

### 2026-11-03
- Sua nhanh ton toi thieu vat tu (Admin/HCNS, tu danh muc + ho so vat tu); import phieu tieu hao them cot Don gia / Thanh tien, bo trong lay gia danh muc (`297e2e0`)

### 2026-10-30
- Bao cao email dinh ky + ket noi Gmail: cho HCNS thao tac (chi cong ty tai khoan duoc gan); Drive van chi Admin (`1c3fecc`)
- Ho so vat tu tieu hao: popup 1 click (ton tung kho ca kho da het, gia tri, lich su moi phieu, nguoi nhan cap phat) tu tim kiem / danh muc / ton kho / canh bao; popup chong; tim vat tu uu tien mat hang phat sinh gan nhat (`25349a7`)
- Ton kho toi thieu (vat tu + TSCD theo dong hang, nhap tu Excel, canh bao) + bao cao email dinh ky qua Gmail (toi thu 5 20h, gui tay, dinh kem Excel) - migration 0021 (`1c5e690`)

### 2026-10-28
- Import Excel phieu tieu hao: ma NV cong ty khac -> tu them kiem nhiem cong ty kho xuat (cung batch, ghi nguoi them; xem truoc bao truoc) (`54a42f7`)
- Danh muc vat tu tieu hao: nut 'Quan ly nhom' (them / doi ten / tat nhom - dung chung popup voi TSCD) (`620ace2`)
- Chuyen giao tai san: Admin/HCNS/thu kho kho HCNS-Mien-Trung chuyen-QL chon duoc NV cong ty khac (popup xac nhan -> tu them kiem nhiem cong ty kho, ghi nguoi them - migration 0020) (`3e0ece0`)
- Tim nhan vien khong thay: goi y ho so o cong ty khac + them kiem nhiem nhanh; o chon NV loc theo ca cong ty kiem nhiem, tim khong dau (`fdaa0c3`)

### 2026-10-19
- Tao tai san co dinh: tu sinh ma TS<cong ty>-<dong hang>-<chiec> (trung ten -> chiec tiep theo cung dong hang) (`1f68f41`)
- Phieu dieu chinh ton: cot 'Den' ghi 'Tai chinh kho nay (khong chuyen di)' thay vi '-' (`cadc987`)
- Danh muc vat tu tieu hao: tu sinh ma vat tu (TS<ma cong ty>-000001...) khi them moi (`e875bbd`)
- Ton theo tung kho: o tich 'Gom ca ton <= 0' de tim ca vat tu het hang (`72c22b2`)

### 2026-10-18
- Sua: trung khoa CONG_TY_NOT_FOUND trong nhan.ts (loi build) (`eee3bc1`)
- Nhan vien kiem nhiem nhieu cong ty (migration 0019): kho QL rieng tung cong ty, cap phat cheo cong ty, gop ho so khac cong ty, bao cao 'Kho tong tat ca cong ty' (`8f2f6f0`)

### 2026-10-16
- Import Excel phieu tieu hao (chuyen kho / cap phat NV / xuat tieu dung VP) tu kho HCNS, Mien, Trung chuyen, QL (`35bcd36`)

### 2026-10-15
- Ghi chu import du lieu NSKX (`94eb704`)
- Script import du lieu cu cong ty NSKX (nhan su, TSCD, tieu hao) tu Google Sheet (`f145c99`)

### 2026-10-14
- Kho & ton: nhap - xuat - ton tieu hao theo ky (ngay/thang/nam) tung kho + popup tung mat hang; phieu tieu hao them cot SL (`5c87791`)
- Ton tieu hao: xem ton tung kho cua 1 vat tu (popup), ma tran them cot 'Kho khac' + nut 'Chi kho co hang', vat tu ton o kho an van hien (`3d02cf0`)

### 2026-10-13
- Tieu huy tai san bat buoc nhap ma EO (migration 0018) (`d0649a6`)
- Quyen them 'Xem ton kho toan cong ty' (users.xem_ton, chi doc, theo cong ty duoc phep) (`c09d023`)
- Sua: Viec can lam / phieu xu ly loc theo cong ty dang xem (phieu bi tu choi, viec ca nhan khong con lan cong ty khac) (`0ccdb5c`)
- Sidebar chia nhom: Tai san co dinh / Vat tu tieu hao / Kho / Bao cao (TSCD, tieu hao) / Cau hinh (`19af362`)
- Bao cao Tieu hao cap cho nhan vien: theo phong ban / nhan vien / vat tu, tan suat, trung binh, khoang cach giua 2 lan nhan (`59b72bd`)
- UI: lam noi bat du lieu bang - chip loai phieu, icon kho, tuoi cho (vang >24h, do >48h), ton am, vien do dong can xu ly (`1aaf6b6`)
- UI: so lieu bam duoc co dau hieu link (so-link, mui ten KPI, > cuoi dong); o chon > 5 lua chon co tim nhanh (ChonLoc thay moi select) (`5ba024a`)
- Kho trung chuyen (= kho mien khac ten), doi loai qua lai Mien <-> Trung chuyen <-> QL (`d7bb841`)

### 2026-10-12
- Chan vuot quyen xac nhan nhan hang + tu duyet phieu (`099b6d9`)

### 2026-10-09
- Kho tieu hao van phong, sua/huy/gui lai phieu, dieu chinh ton, ton theo kho + the kho, nut Back (`ae3362b`)

### 2026-10-07
- Da phap nhan: cong ty rieng (3T, NSKX), quyen xem theo cong ty, chuyen kho lien cong ty can KT duyet (`d48c91c`)
- Đổi loại kho quản lý <-> kho miền (`463a5d2`)
- Đa ngôn ngữ VI / EN / ID cho toàn bộ giao diện (`cbedea5`)
- Cap phat tieu hao: dua bang phieu chinh len tren, 'Hang dang chuyen toi kho cua toi' xuong duoi (`9a1a6d6`)

### 2026-10-06
- Sidebar: so do hien o dung menu con (Cap phat -> Phieu cap phat & chuyen kho), bam vao loc san phieu cho KT duyet (`9676717`)
- dong_bo_tieu_hao_cu: phan loai theo cot 'Phan loai' he cu, nhan dien kho 'Ten - ptdv', cap nhat trang thai theo production (`dfb8bbc`)

### 2026-10-03
- Tai lieu huong dan Quan ly + Nhan vien; sua giao dien phat hien khi chup (`1128850`)

### 2026-10-02
- Dinh kem hoa don, chung tu, anh bang chung luu Google Drive (migration 0013) (`9979f53`)
- Tai lieu huong dan vai tro Ke toan; canh bao don gia: bo phieu da tu choi, bang khong tran ngang, dau cham hang nghin (`ce228c4`)

### 2026-10-01
- Tai lieu huong dan su dung vai tro HCNS (chup man hinh that + DOCX); sua o so dien thoai thieu kieu (`fc4cca1`)
- Sua chup so lieu hang ngay vo tu 2026-09-29: danh sach pham vi truyen 1 tham so json_each (D1 gioi han 100 tham so) (`00126f4`)
- Luu moi thoi gian theo gio VN (UTC+7): INSERT ghi nowVN(), migration 0012 doi du lieu cu +7h (`a2fb92e`)
- Dong bo giao dich tieu hao moi tu he thong cu (AppSheet) - chi phan chenh lech (`55a8e60`)
- Docs: doi ma / gop ho so nhan vien + trien khai ghep dot 2 (51b1c9f6) (`bc2fa82`)
- Ghep nhan su dot 2: sinh SQL bang chinh lib/gopNhanVien.ts (chay thu tren ban sao production) (`6edb9d6`)
- Doi ma / gop ho so / gan ma ETX chuan cho nhan vien - khong anh huong ton kho (`c9380a9`)
- Tai san cua toi: rut gon danh sach kho phu trach + Admin/HCNS tu lien ket ho so nhan vien (`6ddbc5c`)
- DEPLOY: ghi nhan trien khai 2026-10-01 (ghep nhan su ETX, migrate 0009+0010, deploy 8b4667cf) (`bffc123`)
- Ghep nhan su ETX: chuan hoa vi tri dau thanh (Thuý == Thúy) khi so ten (`6e431e2`)

### 2026-09-30
- Canh bao: bo qua / hoan tac + de xuat va tu sua don gia tham khao (`c1e43f3`)
- Phan trang moi bang (50 dong/trang), phan trang server cho bang lon (`0893c7c`)
- Logo nen trong suot + icon tab/app + cai dat PWA toan man hinh (`ae2328f`)
- CCDC 3T: ma nguon hien tai + ghep nhan su ETX (buoc 2) + sua giao dien "Tai san cua toi" (`3dc90eb`)
