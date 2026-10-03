# Sinh anh mau (hoa don, anh hu hong) dung minh hoa phan dinh kem trong tai lieu huong dan.
import os
from PIL import Image, ImageDraw, ImageFont
D = 'F:/claude/QLBH 3T/.wrangler/huong_dan/mau/'
os.makedirs(D, exist_ok=True)
F = lambda s, b=False: ImageFont.truetype('C:/Windows/Fonts/' + ('arialbd.ttf' if b else 'arial.ttf'), s)

im = Image.new('RGB', (1200, 1600), '#fffdf7'); d = ImageDraw.Draw(im)
d.text((600, 90), 'HÓA ĐƠN GIÁ TRỊ GIA TĂNG', font=F(54, True), fill='#b91c1c', anchor='mm')
d.text((600, 160), 'Ký hiệu: 1C26TPV   Số: 0001234   Ngày 01/10/2026', font=F(28), fill='#333', anchor='mm')
y = 240
for t in ['Đơn vị bán: CÔNG TY TNHH ABC (mẫu)', 'MST: 0123456789 (mẫu)', 'Đơn vị mua: CÔNG TY 3T', 'Hình thức thanh toán: Chuyển khoản']:
    d.text((80, y), t, font=F(30), fill='#111'); y += 52
y += 30
d.rectangle((70, y, 1130, y + 60), fill='#e2e8f0'); 
for x, t in [(90, 'STT'), (180, 'Tên hàng hóa'), (720, 'SL'), (820, 'Đơn giá'), (1000, 'Thành tiền')]:
    d.text((x, y + 15), t, font=F(26, True), fill='#111')
y += 70
for i, (ten, sl, dg) in enumerate([('Laptop Lenovo ThinkPad E14', 1, '18.500.000'), ('Chuột không dây Logitech', 1, '350.000')]):
    for x, t in [(100, str(i + 1)), (180, ten), (730, str(sl)), (820, dg), (1000, dg)]:
        d.text((x, y), t, font=F(26), fill='#111')
    y += 56
d.line((70, y + 10, 1130, y + 10), fill='#94a3b8', width=2)
d.text((700, y + 40), 'Tổng cộng: 18.850.000 đ', font=F(32, True), fill='#111')
d.text((700, y + 90), 'Thuế GTGT 10%: 1.885.000 đ', font=F(28), fill='#333')
d.text((700, y + 140), 'Tổng thanh toán: 20.735.000 đ', font=F(32, True), fill='#b91c1c')
d.text((180, 1400), 'Người mua hàng', font=F(28, True), fill='#111'); d.text((820, 1400), 'Người bán hàng', font=F(28, True), fill='#111')
d.ellipse((800, 1450, 1050, 1560), outline='#dc2626', width=5); d.text((925, 1505), 'ABC', font=F(30, True), fill='#dc2626', anchor='mm')
d.text((600, 1150), 'MẪU MINH HỌA', font=F(90, True), fill='#e5e7eb', anchor='mm')
im.save(D + 'hoa_don.jpg', quality=88)

im = Image.new('RGB', (1600, 1200), '#cbd5e1'); d = ImageDraw.Draw(im)
d.rectangle((0, 820, 1600, 1200), fill='#8b6b4a')
d.rounded_rectangle((350, 180, 1250, 760), 30, fill='#1f2937')
d.rectangle((400, 225, 1200, 715), fill='#0f172a')
for pts in [[(780, 400), (650, 260), (560, 240)], [(780, 400), (980, 300), (1150, 250)], [(780, 400), (700, 600), (620, 700)], [(780, 400), (1000, 560), (1180, 690)], [(780, 400), (900, 450)]]:
    d.line(pts, fill='#e5e7eb', width=4)
d.polygon([(250, 760), (1350, 760), (1450, 880), (150, 880)], fill='#374151')
d.text((800, 1050), 'Màn hình bị nứt, không hiển thị', font=F(46, True), fill='#fff', anchor='mm')
im.save(D + 'anh_hu_hong.jpg', quality=88)
print('ok')
