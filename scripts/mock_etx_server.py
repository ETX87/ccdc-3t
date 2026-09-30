# -*- coding: utf-8 -*-
"""
Server GIA LAP API "ETX nhan su" (GET /hrApi) de test dong bo danh ba o LOCAL - wrangler.jsonc
env.local tro ETX_HR_BASE_URL toi http://127.0.0.1:8799. KHONG dung cho production.
Du lieu doc lai tu file JSON moi request (sua file la doi du lieu, khong can khoi dong lai):
  python scripts/mock_etx_server.py <duong_dan_file_json>
File JSON = mang nhanSu dung dinh dang API that (xem backend/src/lib/etxNhanSuClient.ts).
"""
import json
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs, urlparse

DATA = sys.argv[1] if len(sys.argv) > 1 else "etx_mock.json"
KEY = "dev-mock-etx-key-only-for-local"


class H(BaseHTTPRequestHandler):
    def do_GET(self):
        u = urlparse(self.path)
        if u.path != "/hrApi":
            return self._send(404, {"loi": "not found"})
        if self.headers.get("Authorization") != f"Bearer {KEY}":
            return self._send(401, {"loi": "sai khoa"})
        q = parse_qs(u.query)
        trang = int(q.get("trang", ["1"])[0])
        co = int(q.get("co", ["500"])[0])
        tt = q.get("trangThai", ["on"])[0]
        with open(DATA, encoding="utf-8") as f:
            ns = json.load(f)
        if tt != "all":
            ns = [n for n in ns if n["trangThaiLamViec"] == tt]
        so_trang = max(1, -(-len(ns) // co))
        page = ns[(trang - 1) * co : trang * co]
        self._send(200, {"duLieuLuc": "mock", "nguon": "mock", "trangThaiLoc": tt, "tong": len(ns), "trang": trang, "soTrang": so_trang, "co": co, "nhanSu": page})

    def _send(self, code, body):
        b = json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(b)))
        self.end_headers()
        self.wfile.write(b)


if __name__ == "__main__":
    HTTPServer(("127.0.0.1", 8799), H).serve_forever()
