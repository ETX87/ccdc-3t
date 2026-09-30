# -*- coding: utf-8 -*-
"""
Sinh bo icon cho web/PWA tu logo.png goc (goc thu muc du an; anh RGB co NEN TRANG quanh o bo goc ->
dat tren sidebar teal bi lo 2 vien trang - loi bao 2026-09-30). Ghi vao frontend/public/:
  logo.png              - logo nen TRONG SUOT, vuong (sidebar, man dang nhap)
  favicon-32.png        - icon tab trinh duyet
  icon-192/512.png      - PWA "any" (trong suot)
  icon-maskable-512.png - PWA "maskable" (Android tu cat hinh tron/vuong: nen day, noi dung trong vung an toan 80%)
  apple-touch-icon.png  - iOS 180x180 (iOS khong ho tro trong suot -> nen day, iOS tu bo goc)
Chay lai khi doi logo: python scripts/tao_icon_pwa.py
"""
import numpy as np
from PIL import Image
from scipy import ndimage

SRC = "logo.png"
OUT = "frontend/public"

rgb = np.asarray(Image.open(SRC).convert("RGB")).astype(float)
h, w, _ = rgb.shape

# 1. Nen = vung sang (min kenh > 170) NOI voi mep anh (khong an vao hop do nghe mau trang ben trong).
sang = rgb.min(axis=2) > 170
nhan, _ = ndimage.label(sang)
mep = set(np.unique(np.concatenate([nhan[0], nhan[-1], nhan[:, 0], nhan[:, -1]]))) - {0}
nen = np.isin(nhan, list(mep))

# 2. Alpha: nen = 0, vien khu rang cua (dai 3px sat nen) = pha tron trang/teal theo do sang, con lai = 1.
alpha = np.where(nen, 0.0, 1.0)
vien = ndimage.binary_dilation(nen, iterations=3) & ~nen
do_sang = rgb.min(axis=2)
teal = 30.0  # min kenh cua mau teal sat mep o bo goc (mau thuc te 1..49)
alpha[vien] = np.clip((255.0 - do_sang[vien]) / (255.0 - teal), 0, 1)
# Bo pha trang khoi mau vien (un-premultiply) de vien khong con anh trang.
a3 = np.maximum(alpha, 1e-3)[..., None]
mau = np.clip((rgb - (1 - a3) * 255.0) / a3, 0, 255)
mau = np.where(vien[..., None], mau, rgb)
rgba = np.dstack([mau, alpha * 255]).astype(np.uint8)

# 3. Cat sat noi dung roi dem thanh hinh vuong trong suot.
ys, xs = np.where(alpha > 0.02)
logo = Image.fromarray(rgba, "RGBA").crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
canh = max(logo.size)
vuong = Image.new("RGBA", (canh, canh), (0, 0, 0, 0))
vuong.paste(logo, ((canh - logo.width) // 2, (canh - logo.height) // 2))


def co(img, n):
    return img.resize((n, n), Image.LANCZOS)


# 4. Nen day cho iOS/maskable: mat phang mau (mau = a + b*x + c*y) khop theo DAI MEP ben trong o bo
#    goc (4..10px tu vien) -> logo noi lien mach vao nen, khong lo duong vien o.
arr = np.asarray(vuong).astype(float)
ngoai = arr[..., 3] < 250
dai = ~ngoai & ndimage.binary_dilation(ngoai, iterations=10) & ~ndimage.binary_dilation(ngoai, iterations=4)
yy, xx = np.nonzero(dai)
A = np.column_stack([np.ones(len(xx)), xx / canh, yy / canh])
he_so, *_ = np.linalg.lstsq(A, arr[yy, xx, :3], rcond=None)


def day(n, ti_le):
    m = round(n * ti_le)
    lech = (n - m) / 2
    t = (np.arange(n) - lech) / m  # toa do chuan hoa theo logo (ngoai [0,1] = ngoai suy)
    Y, X = np.meshgrid(t, t, indexing="ij")
    g = np.clip(he_so[0] + X[..., None] * he_so[1] + Y[..., None] * he_so[2], 0, 255)
    bg = Image.fromarray(np.dstack([g, np.full((n, n), 255.0)]).astype(np.uint8), "RGBA")
    bg.alpha_composite(co(vuong, m), ((n - m) // 2, (n - m) // 2))
    return bg.convert("RGB")


co(vuong, 256).save(f"{OUT}/logo.png", optimize=True)
co(vuong, 32).save(f"{OUT}/favicon-32.png", optimize=True)
co(vuong, 192).save(f"{OUT}/icon-192.png", optimize=True)
co(vuong, 512).save(f"{OUT}/icon-512.png", optimize=True)
day(512, 0.80).save(f"{OUT}/icon-maskable-512.png", optimize=True)
day(180, 1.0).save(f"{OUT}/apple-touch-icon.png", optimize=True)
print("OK", logo.size, "->", OUT)
