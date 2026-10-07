# -*- coding: utf-8 -*-
"""
Cong cu 1 lan (2026-10-07): boc chuoi tieng Viet trong frontend bang t() cua lib/i18n.ts.
  python scripts/i18n_boc.py <file.tsx> [...]   -> sua tai cho, in cac cho can xem tay.
Pha 1 (lexer): chuoi "..." / '...' / `...${x}...` co dau tieng Viet -> t("...") / t("...{x}...", { x })
  BO QUA: so sanh (=== "x", case "x", .includes("x")...), khoa object ({ "x": ... }), da trong t(), import.
  JSX attr label="x" -> label={t("x")}.
Pha 2: chu tieng Viet con lai ngoai chuoi = text JSX -> {t("...")}.
Sau khi chay: tsc + doc diff; chuoi server (r.loai, r.trang_thai...) boc tay {t(r.loai)}.
"""
import re
import sys

VN = re.compile(r"[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ]")
KW_TS = {"return", "await", "yield", "default", "else", "throw", "new", "in", "of", "typeof"}
SKIP_PREV = ("===", "!==", "==", "!=", "case", "includes(", "startsWith(", "endsWith(", "indexOf(", "from", "import", "t(")


def js_str(s):
    return '"' + s.replace("\\", "\\\\").replace('"', '\\"') + '"'


def prev_ctx(src, i):
    j = i - 1
    while j >= 0 and src[j] in " \t\r\n":
        j -= 1
    return src[max(0, j - 30): j + 1], (src[j] if j >= 0 else "")


def next_ctx(src, i):
    j = i
    while j < len(src) and src[j] in " \t\r\n":
        j += 1
    return src[j: j + 4]


def read_string(src, i):
    q = src[i]
    j = i + 1
    while j < len(src):
        if src[j] == "\\":
            j += 2
            continue
        if src[j] == q:
            return j + 1
        if src[j] == "\n" and q != "`":
            return None
        j += 1
    return None


def read_template(src, i):
    """-> (end, parts) parts = [("s", text) | ("e", expr)]"""
    j = i + 1
    parts, buf = [], ""
    while j < len(src):
        c = src[j]
        if c == "\\":
            buf += src[j: j + 2]
            j += 2
            continue
        if c == "`":
            parts.append(("s", buf))
            return j + 1, parts
        if c == "$" and src[j + 1: j + 2] == "{":
            parts.append(("s", buf))
            buf = ""
            depth, k = 1, j + 2
            while k < len(src) and depth:
                ch = src[k]
                if ch in "\"'":
                    e = read_string(src, k)
                    k = e if e else k + 1
                    continue
                if ch == "`":
                    k = read_template(src, k)[0]
                    continue
                if ch == "{":
                    depth += 1
                elif ch == "}":
                    depth -= 1
                k += 1
            parts.append(("e", src[j + 2: k - 1]))
            j = k
            continue
        buf += c
        j += 1
    return None, None


def ten_bien(expr, dung):
    e = expr.strip()
    m = re.fullmatch(r"[A-Za-z_]\w*", e)
    if m and e not in dung:
        return e
    m = re.fullmatch(r"[\w.?!]*?\.?(\w+)", e)
    base = m.group(1) if m else "x"
    base = re.sub(r"\W", "", base) or "x"
    n, i = base, 1
    while n in dung:
        i += 1
        n = f"{base}{i}"
    return n


PH = []  # placeholder -> text


def ph(text):
    PH.append(text)
    return f"\x00{len(PH) - 1}\x00"


def phase1(src):
    out, i = [], 0
    n = len(src)
    while i < n:
        c = src[i]
        if src.startswith("//", i):
            j = src.find("\n", i)
            j = n if j < 0 else j
            out.append(ph(src[i:j]))
            i = j
            continue
        if src.startswith("/*", i):
            j = src.find("*/", i)
            j = n if j < 0 else j + 2
            out.append(ph(src[i:j]))
            i = j
            continue
        if c in "\"'":
            e = read_string(src, i)
            if e is None:
                out.append(c)
                i += 1
                continue
            lit = src[i:e]
            body = lit[1:-1]
            pctx, pch = prev_ctx(src, i)
            if not VN.search(body):
                out.append(ph(lit))
            elif pctx.endswith(SKIP_PREV) or next_ctx(src, e).startswith(("===", "!==")):
                out.append(ph(lit))
            elif next_ctx(src, e).startswith(":") and pch in "{,(":
                out.append(ph(lit))  # khoa object
            elif pch == "=" and re.search(r"[\w-]=$", pctx):  # JSX attr a="x"
                out.append(ph("{t(" + js_str(body.replace('\\"', '"')) + ")}"))
            elif re.search(r"[\wÀ-ỹ.)}]$", pctx) and not re.search(r"\b(" + "|".join(KW_TS) + r")$", pctx):
                out.append(lit)  # nhay kep trong text JSX -> pha 2
            else:
                out.append(ph("t(" + js_str(body.replace('\\"', '"').replace("\\'", "'")) + ")"))
            i = e
            continue
        if c == "`":
            e, parts = read_template(src, i)
            if e is None:
                out.append(c)
                i += 1
                continue
            text = "".join(p for k, p in parts if k == "s")
            pctx, _ = prev_ctx(src, i)
            if not VN.search(text) or pctx.endswith(SKIP_PREV):
                # van xu ly chuoi VN trong ${...}
                rebuilt = "`"
                for k, p in parts:
                    rebuilt += p if k == "s" else "${" + restore(phase1(p)) + "}"
                out.append(ph(rebuilt + "`"))
            else:
                s, params, dung = "", [], set()
                for k, p in parts:
                    if k == "s":
                        s += p
                    else:
                        nm = ten_bien(p, dung)
                        dung.add(nm)
                        s += "{" + nm + "}"
                        inner = restore(phase1(p)).strip()
                        params.append(nm if inner == nm else f"{nm}: {inner}")
                call = "t(" + js_str(s.replace("\\`", "`")) + (", { " + ", ".join(params) + " }" if params else "") + ")"
                out.append(ph(call))
            i = e
            continue
        out.append(c)
        i += 1
    return "".join(out)


def restore(s):
    while "\x00" in s:
        s = re.sub(r"\x00(\d+)\x00", lambda m: PH[int(m.group(1))], s)
    return s


def phase2(s):
    lines = s.split("\n")
    for li, line in enumerate(lines):
        if not VN.search(line):
            continue

        def wrap(m):
            run = m.group(0)
            if not VN.search(run):
                return run
            core = run.strip()
            lead = run[: len(run) - len(run.lstrip())]
            trail = run[len(run.rstrip()):]
            return lead + "{t(" + js_str(core) + ")}" + trail

        lines[li] = re.sub(r"[^<>{}\x00\n]+", wrap, line)
    return "\n".join(lines)


def main():
    for f in sys.argv[1:]:
        PH.clear()
        src = open(f, encoding="utf-8").read()
        s = phase1(src)
        s = phase2(s)
        s = restore(s)
        if s != src and "from \"../lib/i18n\"" not in s and "from \"./i18n\"" not in s:
            rel = "./i18n" if "/lib/" in f.replace("\\", "/") else "../lib/i18n"
            if re.search(r"^import ", s, flags=re.M):
                s = re.sub(r"^import ", f'import {{ t }} from "{rel}";\nimport ', s, count=1, flags=re.M)
            else:
                s = f'import {{ t }} from "{rel}";\n' + s
        open(f, "w", encoding="utf-8", newline="\n").write(s)
        # cho can xem: chuoi VN con sot ngoai t(...)
        for no, line in enumerate(s.split("\n"), 1):
            bo = re.sub(r't\("(?:\\.|[^"\\])*"', "", line)
            bo = re.sub(r"//.*", "", bo)
            if VN.search(bo):
                print(f"{f}:{no}: {line.strip()[:140]}")


if __name__ == "__main__":
    main()
