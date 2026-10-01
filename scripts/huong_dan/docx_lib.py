# Thu vien dung tai lieu huong dan DOCX (python-docx) - dung chung cho moi vai tro.
import re
from PIL import Image
from docx import Document
from docx.enum.section import WD_ORIENT
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

TEAL = RGBColor(0x00, 0x65, 0x73)
TEAL_NHAT = 'E4FAFB'
XAM = RGBColor(0x47, 0x55, 0x69)
FONT = 'Arial'
RONG = 16.5  # cm - be rong vung chu (A4, le 2,25 cm)


def _shade(cell, mau):
    tcPr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement('w:shd')
    shd.set(qn('w:val'), 'clear')
    shd.set(qn('w:color'), 'auto')
    shd.set(qn('w:fill'), mau)
    tcPr.append(shd)


def _vien_o(cell, mau='CBD5E1', trai=None):
    tcPr = cell._tc.get_or_add_tcPr()
    b = OxmlElement('w:tcBorders')
    for canh in ('top', 'left', 'bottom', 'right'):
        e = OxmlElement(f'w:{canh}')
        if canh == 'left' and trai:
            e.set(qn('w:val'), 'single'); e.set(qn('w:sz'), '24'); e.set(qn('w:color'), trai)
        else:
            e.set(qn('w:val'), 'single'); e.set(qn('w:sz'), '4'); e.set(qn('w:color'), mau)
        b.append(e)
    tcPr.append(b)


class TaiLieu:
    def __init__(self, thu_muc_anh: str):
        self.anh_dir = thu_muc_anh
        self.d = Document()
        self.so_hinh = 0
        s = self.d.sections[0]
        s.page_height, s.page_width = Cm(29.7), Cm(21)
        s.left_margin = s.right_margin = Cm(2.25)
        s.top_margin, s.bottom_margin = Cm(2), Cm(2)
        st = self.d.styles
        st['Normal'].font.name = FONT
        st['Normal'].font.size = Pt(10.5)
        st['Normal']._element.rPr.rFonts.set(qn('w:eastAsia'), FONT)
        st['Normal'].paragraph_format.space_after = Pt(4)
        st['Normal'].paragraph_format.line_spacing = 1.15
        for i, (co, truoc) in enumerate([(17, 18), (13.5, 12), (11.5, 10)], start=1):
            h = st[f'Heading {i}']
            h.font.name = FONT
            rf = h._element.rPr.rFonts
            for k in ('asciiTheme', 'hAnsiTheme', 'eastAsiaTheme', 'cstheme'):
                rf.attrib.pop(qn('w:' + k), None)
            for k in ('ascii', 'hAnsi', 'eastAsia', 'cs'):
                rf.set(qn('w:' + k), FONT)
            h.font.size = Pt(co)
            h.font.bold = True
            h.font.color.rgb = TEAL if i < 3 else XAM
            h.paragraph_format.space_before = Pt(truoc)
            h.paragraph_format.space_after = Pt(6)
            h.paragraph_format.keep_with_next = True
        st['Caption'].font.name = FONT
        st['Caption'].font.size = Pt(9)
        st['Caption'].font.italic = True
        st['Caption'].font.color.rgb = XAM

    # ---------------------------------------------------------------- chu
    def _chay(self, p, text, co=None, mau=None):
        """**dam**, *nghieng*, `ma` -> run tuong ung."""
        for phan in re.split(r'(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)', text):
            if not phan:
                continue
            if phan.startswith('**'):
                r = p.add_run(phan[2:-2]); r.bold = True
            elif phan.startswith('`'):
                r = p.add_run(phan[1:-1]); r.bold = True; r.font.color.rgb = RGBColor(0x02, 0x84, 0xC7)
            elif phan.startswith('*'):
                r = p.add_run(phan[1:-1]); r.italic = True
            else:
                r = p.add_run(phan)
            if co: r.font.size = Pt(co)
            if mau: r.font.color.rgb = mau
        return p

    def h1(self, t, trang_moi=True):
        if trang_moi:
            self.d.add_page_break()
        self.d.add_heading(t, 1)

    def h2(self, t):
        self.d.add_heading(t, 2)

    def h3(self, t):
        self.d.add_heading(t, 3)

    def p(self, t, **kw):
        return self._chay(self.d.add_paragraph(), t, **kw)

    def gach(self, *dong):
        for t in dong:
            p = self.d.add_paragraph(style='List Bullet')
            self._chay(p, t)

    def buoc(self, *dong):
        for i, t in enumerate(dong, start=1):
            p = self.d.add_paragraph()
            p.paragraph_format.left_indent = Cm(1.7)
            p.paragraph_format.first_line_indent = Cm(-1.7)
            r = p.add_run(f'Bước {i}.\t'); r.bold = True; r.font.color.rgb = TEAL
            p.paragraph_format.tab_stops.add_tab_stop(Cm(1.7))
            self._chay(p, t)

    def hop(self, tieu_de, noi_dung, loai='info'):
        mau = {'info': ('E9F3FD', '0284C7'), 'luu_y': ('FFF9E7', 'D97706'), 'canh_bao': ('FEE2E2', 'DC2626'), 'meo': (TEAL_NHAT, '009688')}[loai]
        t = self.d.add_table(rows=1, cols=1)
        t.alignment = WD_TABLE_ALIGNMENT.CENTER
        c = t.rows[0].cells[0]
        _shade(c, mau[0]); _vien_o(c, mau[0], trai=mau[1])
        p = c.paragraphs[0]
        r = p.add_run(tieu_de + '  '); r.bold = True; r.font.color.rgb = RGBColor.from_string(mau[1])
        dong = noi_dung if isinstance(noi_dung, list) else [noi_dung]
        self._chay(p, dong[0])
        for x in dong[1:]:
            self._chay(c.add_paragraph(), x)
        self.d.add_paragraph().paragraph_format.space_after = Pt(0)

    def bang(self, dau, hang, rong=None):
        t = self.d.add_table(rows=1, cols=len(dau))
        t.alignment = WD_TABLE_ALIGNMENT.CENTER
        t.style = 'Table Grid'
        for i, x in enumerate(dau):
            c = t.rows[0].cells[i]
            _shade(c, '006573')
            r = c.paragraphs[0].add_run(x); r.bold = True; r.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF); r.font.size = Pt(9.5)
        for k, h in enumerate(hang):
            cells = t.add_row().cells
            for i, x in enumerate(h):
                self._chay(cells[i].paragraphs[0], str(x), co=9.5)
                if k % 2:
                    _shade(cells[i], 'F7FBFE')
        if rong:
            for row in t.rows:
                for i, w in enumerate(rong):
                    row.cells[i].width = Cm(w)
        self.d.add_paragraph().paragraph_format.space_after = Pt(0)

    # ---------------------------------------------------------------- anh
    def anh(self, ten, chu_thich, rong=None, cat=None):
        duong = self.anh_dir + ten + '.png'
        if cat:
            im = Image.open(duong)
            duong = self.anh_dir + ten + '_cat.png'
            im.crop(cat).save(duong)
        w, _ = Image.open(duong).size
        duong = self._nen(duong)
        if rong is None:
            rong = RONG if w >= 2000 else min(RONG, w / 2160 * RONG * 1.3)
        p = self.d.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.paragraph_format.keep_with_next = True
        p.paragraph_format.space_before = Pt(6)
        p.add_run().add_picture(duong, width=Cm(rong))
        self.so_hinh += 1
        c = self.d.add_paragraph(style='Caption')
        c.alignment = WD_ALIGN_PARAGRAPH.CENTER
        c.add_run(f'Hình {self.so_hinh}. {chu_thich}')

    def anh_doi(self, a, b, ca, cb, rong=6.2):
        t = self.d.add_table(rows=2, cols=2)
        t.alignment = WD_TABLE_ALIGNMENT.CENTER
        for i, (ten, ct) in enumerate([(a, ca), (b, cb)]):
            p = t.rows[0].cells[i].paragraphs[0]
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            p.add_run().add_picture(self._nen(self.anh_dir + ten + '.png'), width=Cm(rong))
            self.so_hinh += 1
            q = t.rows[1].cells[i].paragraphs[0]
            q.style = self.d.styles['Caption']
            q.alignment = WD_ALIGN_PARAGRAPH.CENTER
            q.add_run(f'Hình {self.so_hinh}. {ct}')
        self.d.add_paragraph()

    def _nen(self, duong, toi_da=1700):
        """PNG chup man hinh -> JPEG chat luong cao, rong toi da 1700px (file DOCX gon, chu van net khi in A4)."""
        im = Image.open(duong).convert('RGB')
        if im.width < 2000:  # anh chup popup: to trang 4 goc bo tron (lo nen mo phia sau)
            from PIL import ImageDraw
            mask = Image.new('L', im.size, 0)
            ImageDraw.Draw(mask).rounded_rectangle([0, 0, im.width - 1, im.height - 1], radius=26, fill=255)
            nen = Image.new('RGB', im.size, 'white')
            nen.paste(im, mask=mask)
            im = nen
        if im.width > toi_da:
            im = im.resize((toi_da, round(im.height * toi_da / im.width)), Image.LANCZOS)
        ra = duong.rsplit('.', 1)[0] + '_nen.jpg'
        im.save(ra, quality=88, optimize=True)
        return ra

    # ---------------------------------------------------------------- khung
    def bia(self, logo, tieu_de, phu_de, dong_phu):
        for _ in range(4):
            self.d.add_paragraph()
        p = self.d.add_paragraph(); p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.add_run().add_picture(logo, width=Cm(3.2))
        p = self.d.add_paragraph(); p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        r = p.add_run('3T ASSET MANAGEMENT'); r.bold = True; r.font.size = Pt(12); r.font.color.rgb = RGBColor(0x00, 0x96, 0x88)
        p = self.d.add_paragraph(); p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.paragraph_format.space_before = Pt(24)
        r = p.add_run(tieu_de); r.bold = True; r.font.size = Pt(24); r.font.color.rgb = TEAL
        p = self.d.add_paragraph(); p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.paragraph_format.space_before = Pt(10)
        r = p.add_run(phu_de); r.font.size = Pt(15); r.font.color.rgb = XAM
        for _ in range(8):
            self.d.add_paragraph()
        for x in dong_phu:
            p = self.d.add_paragraph(); p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            self._chay(p, x, co=10.5, mau=XAM)

    def muc_luc(self):
        self.d.add_page_break()
        p = self.d.add_paragraph()
        r = p.add_run('MỤC LỤC'); r.bold = True; r.font.size = Pt(17); r.font.color.rgb = TEAL
        p = self.d.add_paragraph()
        r = p.add_run()
        for loai, text in [('begin', None), (None, 'TOC \\o "1-2" \\h \\z \\u'), ('separate', None), (None, None), ('end', None)]:
            if loai:
                f = OxmlElement('w:fldChar'); f.set(qn('w:fldCharType'), loai); r._r.append(f)
            elif text:
                it = OxmlElement('w:instrText'); it.set(qn('xml:space'), 'preserve'); it.text = text; r._r.append(it)
            else:
                t = OxmlElement('w:t'); t.text = 'Nhấn chuột phải → "Update Field" (Cập nhật trường) để hiện mục lục.'; r._r.append(t)
        # Muc luc duoc dien bang cap_nhat_word.ps1 (Word COM) - khong dat updateFields de Word khong hoi khi mo.

    def chan_trang(self, text):
        s = self.d.sections[0]
        s.different_first_page_header_footer = True
        p = s.footer.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        r = p.add_run(text + '   |   Trang '); r.font.size = Pt(8.5); r.font.color.rgb = XAM
        r = p.add_run()
        for loai, text in [('begin', None), (None, 'PAGE'), ('end', None)]:
            if loai:
                f = OxmlElement('w:fldChar'); f.set(qn('w:fldCharType'), loai); r._r.append(f)
            else:
                it = OxmlElement('w:instrText'); it.text = text; r._r.append(it)
        r.font.size = Pt(8.5)

    def luu(self, duong):
        self.d.save(duong)
