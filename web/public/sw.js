// Only the authenticated schedule and its images belong in the offline cache.
const CACHE = "scheduler-next-v2";
const asset = (path) =>
  path.startsWith("/_next/static/") || path.startsWith("/icons/");
const photo = (path) => /^\/uploads\/[\w.-]+$/.test(path);
const denied = (response) =>
  response.status === 401 ||
  response.status === 403 ||
  (response.redirected &&
    /\/(login|setup)\.html$/.test(new URL(response.url).pathname));

async function warm() {
  const cache = await caches.open(CACHE);
  const [home, workspace] = await Promise.all(
    ["/", "/api/workspace"].map((url) =>
      fetch(url, { cache: "no-store", credentials: "same-origin" }),
    ),
  );
  if ([home, workspace].some(denied)) {
    await caches.delete(CACHE);
    return;
  }
  if (!home.ok || !workspace.ok || home.redirected) return;
  const data = await workspace.clone().json();
  const html = await home.clone().text();
  const staticFiles = Array.from(
    html.matchAll(/(?:href|src)="([^"]+)"/g),
    (m) => m[1],
  ).filter(asset);
  const pictures = [
    ...data.maps.map((m) => m.image),
    ...data.staffs.map((s) => s.photo),
    ...data.sessions.flatMap((s) => [
      s.speaker_photo,
      ...s.lt_talks.map((t) => t.speaker_photo),
    ]),
  ].filter((path) => path && photo(path));
  for (const path of new Set([...staticFiles, ...pictures])) {
    if (!(await cache.match(path))) await cache.add(path).catch(() => {});
  }
  await Promise.all([
    cache.put("/", home),
    cache.put("/api/workspace", workspace),
  ]);
}
self.addEventListener("install", (event) =>
  event.waitUntil(self.skipWaiting()),
);
self.addEventListener("activate", (event) =>
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys())
        if (name.startsWith("scheduler-next-") && name !== CACHE)
          await caches.delete(name);
      await self.clients.claim();
    })(),
  ),
);
self.addEventListener("message", (event) => {
  if (event.data === "save-schedule") event.waitUntil(warm().catch(() => {}));
});
self.addEventListener("fetch", (event) => {
  const req = event.request,
    url = new URL(req.url);
  if (url.origin !== self.location.origin || req.method !== "GET") return;
  if (url.pathname === "/auth/logout") {
    event.respondWith(
      (async () => {
        await caches.delete(CACHE);
        return fetch(req);
      })(),
    );
    return;
  }
  const immutable = asset(url.pathname) || photo(url.pathname);
  const page =
    req.mode === "navigate" &&
    !/^\/(api|auth|uploads|public)(\/|$)|^\/(login|setup)\.html$/.test(
      url.pathname,
    );
  if (!immutable && !page && url.pathname !== "/api/workspace") return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      if (immutable) {
        const found = await cache.match(req);
        if (found) return found;
      }
      async function offline() {
        let found = await cache.match(req);
        if (page) {
          found ||= await cache.match("/", { ignoreVary: true });
          if (found) {
            // Give a fallback document the current navigation URL, not its cached URL.
            const headers = new Headers(found.headers);
            headers.delete("content-encoding");
            headers.delete("content-length");
            return new Response(found.body, { status: found.status, headers });
          }
        }
        return found;
      }
      if (!self.navigator.onLine) {
        const saved = await offline();
        if (saved) return saved;
      }
      try {
        const response = await fetch(req);
        if (denied(response)) await caches.delete(CACHE);
        else if (response.type === "error" || response.status >= 500)
          return (await offline()) || response;
        else if (response.ok && !response.redirected)
          await cache.put(req, response.clone());
        return response;
      } catch (err) {
        const saved = await offline();
        if (saved) return saved;
        throw err;
      }
    })(),
  );
});
