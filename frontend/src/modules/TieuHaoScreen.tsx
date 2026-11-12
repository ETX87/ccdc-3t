import { t } from "../lib/i18n";
import { useState } from "react";
import { useNav } from "../lib/navigation";
import { ChuyenKhoScreen } from "./ChuyenKhoScreen";
import { DanhMucTieuHaoScreen } from "./DanhMucTieuHaoScreen";
import { TonTieuHaoScreen } from "./TonTieuHaoScreen";

type SubTab = "phieu" | "ton-kho" | "danh-muc";
const TABS: { key: SubTab; label: string }[] = [
  { key: "phieu", label: t("Phiếu cấp phát & chuyển kho") },
  { key: "ton-kho", label: t("Tồn kho") },
  { key: "danh-muc", label: t("Danh mục vật tư") },
];

// Nhom "Cap phat" (menu con): tab lay tu tham so dieu huong (?tab=) de menu con / link "Xem ton" mo dung tab.
export function TieuHaoScreen() {
  const { params } = useNav();
  const [subTab] = useState<SubTab>(TABS.some((t) => t.key === params.tab) ? (params.tab as SubTab) : "phieu");
  // Menu con (Vat tu tieu hao) da chuyen giua 3 man -> khong hien them dai tab trung lap trong trang.
  const tabs = undefined;
  if (subTab === "ton-kho") return <TonTieuHaoScreen tabs={tabs} />;
  if (subTab === "danh-muc") return <DanhMucTieuHaoScreen tabs={tabs} />;
  return <ChuyenKhoScreen tabs={tabs} />;
}
