import { api } from "../api/client";

// Dinh kem hoa don / chung tu / anh bang chung (backend routes/dinhKem.ts, tep luu tren Google Drive).

export type DoiTuongDinhKem = "chuyen_kho" | "giao_nhan" | "xu_ly" | "tai_san";
export type LoaiDinhKem = "Hoa don" | "Chung tu" | "Bang chung" | "Khac";

export const LOAI_DINH_KEM: Record<LoaiDinhKem, string> = {
  "Hoa don": "Hóa đơn",
  "Chung tu": "Chứng từ",
  "Bang chung": "Ảnh bằng chứng",
  Khac: "Khác",
};

export interface DinhKemRow {
  id: string;
  doi_tuong: DoiTuongDinhKem;
  doi_tuong_id: string;
  loai: LoaiDinhKem;
  drive_file_id: string;
  ten_file: string;
  mime: string;
  kich_thuoc: number;
  ghi_chu: string | null;
  nguoi_tai: string;
  nguoi_tai_ten: string | null;
  created_at: string;
  /** Ma phieu nguon khi xem tu tai san (tep gan tren phieu co tai san nay). */
  nguon_ma: string | null;
  co_the_xoa: boolean;
}

export const CHAP_NHAN = "image/*,application/pdf";
const TOI_DA = 10 * 1024 * 1024;

export const anhNho = (driveId: string) => `https://drive.google.com/thumbnail?id=${driveId}&sz=w400`;
export const moTep = (driveId: string) => `https://drive.google.com/file/d/${driveId}/view`;

/**
 * Thu nho anh chup dien thoai truoc khi tai (canh dai toi da 1920px, JPEG 85%) - anh 4-8MB con ~300-600KB,
 * chu tren hoa don van doc ro. PDF / anh nho / anh trinh duyet khong giai ma duoc (vd HEIC) giu nguyen.
 */
export async function nenAnh(file: File): Promise<{ blob: Blob; mime: string }> {
  if (!file.type.startsWith("image/") || file.type === "image/gif" || file.size < 400 * 1024) return { blob: file, mime: file.type };
  try {
    const bmp = await createImageBitmap(file);
    const tiLe = Math.min(1, 1920 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * tiLe);
    canvas.height = Math.round(bmp.height * tiLe);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", 0.85));
    return blob && blob.size < file.size ? { blob, mime: "image/jpeg" } : { blob: file, mime: file.type };
  } catch {
    return { blob: file, mime: file.type };
  }
}

/** Kiem tra truoc o client (server kiem lai): null = hop le, nguoc lai la thong bao loi. */
export function kiemTraTep(file: File): string | null {
  if (!file.type.startsWith("image/") && file.type !== "application/pdf") return `"${file.name}" không phải ảnh hoặc PDF.`;
  if (file.type === "application/pdf" && file.size > TOI_DA) return `"${file.name}" lớn hơn 10MB.`;
  return null;
}

export async function taiLen(doiTuong: DoiTuongDinhKem, id: string, file: File, loai: LoaiDinhKem, ghiChu?: string) {
  const { blob, mime } = await nenAnh(file);
  const q = new URLSearchParams({ doi_tuong: doiTuong, id, loai, ten: file.name });
  if (ghiChu?.trim()) q.set("ghi_chu", ghiChu.trim());
  return api.postBinary<{ id: string }>(`/dinh-kem?${q.toString()}`, blob, mime);
}

/** Tep chon san trong form lap phieu - tai len SAU khi phieu tao xong (can id phieu). */
export interface TepCho {
  file: File;
  loai: LoaiDinhKem;
}

/** Tai lan luot cac tep cho; tra so tep loi (phieu van da tao - nguoi dung bo sung sau trong popup chi tiet). */
export async function taiLenTepCho(doiTuong: DoiTuongDinhKem, id: string, tep: TepCho[]): Promise<number> {
  let loi = 0;
  for (const t of tep) {
    try {
      await taiLen(doiTuong, id, t.file, t.loai);
    } catch {
      loi++;
    }
  }
  return loi;
}

export const fmtKichThuoc = (b: number) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
