// Service worker toi thieu cho PWA "cai dat vao man hinh chinh" (2026-09-30). KHONG cache du lieu
// /api (luon lay moi tu server); chi giu 1 ban trang "/" de mo app luc mat mang con hien khung giao
// dien thay vi trang loi trinh duyet. Moi request khac di thang mang (network-first cho trang).
const CACHE = "ccdc-shell-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.add("/")).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.mode !== "navigate" || new URL(req.url).pathname.startsWith("/api/")) return;
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put("/", copy));
        }
        return res;
      })
      .catch(() => caches.match("/")),
  );
});
