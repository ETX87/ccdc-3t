# Thu vien chup man hinh huong dan su dung (Playwright + Chrome cai san), chay tren ban sao local
# (wrangler dev --persist-to state_hd, cong 8797). Anh luu vao anh/<ten>.png.
import os
from playwright.sync_api import sync_playwright, Page, Locator

BASE = 'http://localhost:8797'
ANH = 'F:/claude/QLBH 3T/.wrangler/huong_dan/anh/'
os.makedirs(ANH, exist_ok=True)

_pw = None
_browser = None


def mo_trinh_duyet():
    global _pw, _browser
    _pw = sync_playwright().start()
    _browser = _pw.chromium.launch(channel='chrome', args=['--lang=vi'])


def dong_trinh_duyet():
    _browser.close()
    _pw.stop()


def dang_nhap(email: str, w=1440, h=900) -> Page:
    ctx = _browser.new_context(viewport={'width': w, 'height': h}, device_scale_factor=1.5, locale='vi-VN')
    pg = ctx.new_page()
    pg.goto(BASE + '/')
    pg.request.get(BASE + '/api/auth/dev-login?email=' + email, max_redirects=0)
    pg.goto(BASE + '/')
    cho(pg)
    return pg


def cho(pg: Page, ms=700):
    pg.wait_for_load_state('networkidle')
    pg.wait_for_timeout(ms)


def menu(pg: Page, label: str, child: str | None = None):
    a = pg.locator('aside')
    if child:
        c = a.get_by_text(child, exact=True)
        if not c.count() or not c.first.is_visible():
            a.get_by_text(label, exact=True).first.click()
        a.get_by_text(child, exact=True).first.click()
    else:
        a.get_by_text(label, exact=True).first.click()
    cho(pg)


def danh_dau(*locs: Locator):
    """Vien do quanh phan tu can chu y (chi tren anh chup)."""
    for l in locs:
        l.first.evaluate("e => { e.dataset.hd = '1'; e.style.outline = '3px solid #E11D48'; e.style.outlineOffset = '3px'; e.style.borderRadius = e.style.borderRadius || '8px'; }")


def bo_danh_dau(pg: Page):
    pg.evaluate("document.querySelectorAll('[data-hd]').forEach(e => { e.style.outline = ''; e.style.outlineOffset = ''; delete e.dataset.hd; })")


def chup(pg: Page, ten: str, phan_tu: Locator | None = None, full=False):
    pg.wait_for_timeout(250)
    if phan_tu is not None:
        phan_tu.first.screenshot(path=ANH + ten + '.png')
    else:
        pg.screenshot(path=ANH + ten + '.png', full_page=full)
    bo_danh_dau(pg)
    print('chup', ten)


def modal(pg: Page) -> Locator:
    return pg.locator('.modal-box').last


def o(pg_or_loc, nhan: str) -> Locator:
    """O nhap trong field-group co nhan (label) bat dau bang `nhan`."""
    return pg_or_loc.locator(f"xpath=.//div[contains(@class,'field-group')][label[contains(@class,'field-label')][starts-with(normalize-space(.), '{nhan}')]]").first


def chon_search(loc: Locator, tu_khoa: str, pg: Page):
    """SearchSelect: go tu khoa roi bam dong dau tien goi y."""
    inp = loc.locator('input[type=text]').first
    inp.click()
    inp.fill(tu_khoa)
    pg.wait_for_timeout(400)
    inp.locator('xpath=following-sibling::div[1]').locator('div').filter(has_text=tu_khoa).first.click()
    pg.wait_for_timeout(200)
