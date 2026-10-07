# -*- coding: utf-8 -*-
"""
Kiem tra da ngon ngu (frontend/src/lib/i18n.ts): moi chuoi t("...") + CHUOI_SERVER (lib/i18n/server.ts)
phai co ban dich trong lib/i18n/en.ts va lib/i18n/id.ts.
  python scripts/i18n_kiem_tra.py            -> in chuoi thieu / thua + chuoi tieng Viet chua boc t()
  python scripts/i18n_kiem_tra.py --json F   -> ghi danh sach khoa thieu ra file JSON (de dich)
Thoat ma 1 neu con thieu (dung truoc khi deploy).
"""
import json
import re
import sys
from pathlib import Path

SRC = Path(__file__).resolve().parent.parent / "frontend" / "src"
I18N = SRC / "lib" / "i18n"
VN = re.compile(r"[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđĐ]")
STR = r'"((?:\\.|[^"\\])*)"'


def unesc(s):
    return json.loads('"' + s + '"')


def khoa_dung():
    keys = {}
    for f in SRC.rglob("*.ts*"):
        if I18N in f.parents or f.name == "i18n.ts":
            continue
        for no, line in enumerate(f.read_text(encoding="utf-8").split("\n"), 1):
            for m in re.finditer(r"\bt\(\s*" + STR, line):
                keys.setdefault(unesc(m.group(1)), f"{f.relative_to(SRC)}:{no}")
    for m in re.finditer(STR + r"|'((?:\\.|[^'\\])*)'", (I18N / "server.ts").read_text(encoding="utf-8")):
        k = m.group(1) if m.group(1) is not None else m.group(2)
        keys.setdefault(unesc(k) if m.group(1) is not None else k, "server.ts")
    return keys


def doc_dict(name):
    txt = (I18N / f"{name}.ts").read_text(encoding="utf-8")
    d = {}
    for m in re.finditer(r"^\s*" + STR + r"\s*:\s*" + STR + r",?\s*$", txt, flags=re.M):
        d[unesc(m.group(1))] = unesc(m.group(2))
    return d


def chua_boc():
    out = []
    for f in SRC.rglob("*.ts*"):
        if I18N in f.parents or f.name == "i18n.ts":
            continue
        for no, line in enumerate(f.read_text(encoding="utf-8").split("\n"), 1):
            bo = re.sub(r"\btS?\(\s*" + STR, "", line)
            bo = re.sub(r"//.*|/\*.*?\*/", "", bo)
            bo = re.sub(r"(===|!==|startsWith\(|endsWith\(|includes\()\s*" + STR, "", bo)
            bo = re.sub(STR + r"\s*(===|!==)", "", bo)
            if VN.search(bo):
                out.append(f"{f.relative_to(SRC)}:{no}: {line.strip()[:120]}")
    return out


def main():
    keys = khoa_dung()
    loi = False
    thieu_all = {}
    for name in ("en", "id"):
        d = doc_dict(name)
        thieu = [k for k in keys if k not in d]
        thua = [k for k in d if k not in keys]
        # tham so {x} phai giu nguyen
        sai_ts = [k for k in keys if k in d and sorted(re.findall(r"\{\w+\}", k)) != sorted(re.findall(r"\{\w+\}", d[k]))]
        print(f"[{name}] {len(d)} ban dich / {len(keys)} khoa - thieu {len(thieu)}, thua {len(thua)}, sai tham so {len(sai_ts)}")
        for k in thieu[:40]:
            print(f"   THIEU: {k!r}  ({keys[k]})")
        for k in sai_ts:
            print(f"   SAI THAM SO: {k!r} -> {d[k]!r}")
        if thieu or sai_ts:
            loi = True
        thieu_all[name] = thieu
    cb = chua_boc()
    print(f"Chuoi tieng Viet chua boc t(): {len(cb)}")
    for x in cb:
        print("  ", x)
    if "--json" in sys.argv:
        out = sys.argv[sys.argv.index("--json") + 1]
        Path(out).write_text(json.dumps(sorted(set(thieu_all["en"]) | set(thieu_all["id"])), ensure_ascii=False, indent=0), encoding="utf-8")
    sys.exit(1 if loi else 0)


if __name__ == "__main__":
    main()
