// Only the read-only schedule is available offline. Private caches belong to a login.
const PREFIX = "scheduler-next-";
const STATIC = PREFIX + "static-v3";
const PRIVATE = PREFIX + "staff-v3-";
const SNAPSHOT = "/api/offline";
const asset = (path) =>
  path.startsWith("/_next/static/") || path.startsWith("/icons/");
const photo = (path) => /^\/uploads\/[\w.-]+$/.test(path);
const participantPage = (path) =>
  /^\/(?:|schedule|staff-detail|venue|help|staffs\/\d+|rooms\/\d+\/roster)$/.test(
    path,
  );

async function scope() {
  const marker = await self.cookieStore?.get("es_offline");
  return /^[a-f0-9]{64}$/.test(marker?.value || "") ? marker.value : null;
}

async function purge(keep = null) {
  for (const name of await caches.keys()) {
    if (name.startsWith(PREFIX) && name !== STATIC && name !== PRIVATE + keep) {
      await caches.delete(name);
    }
  }
}

function denied(response) {
  return (
    response.status === 401 ||
    response.status === 403 ||
    (response.redirected && !participantPage(new URL(response.url).pathname))
  );
}

async function warm() {
  const session = await scope();
  await purge(session);
  if (!session) return;
  const [home, workspace] = await Promise.all(
    ["/?offline=1", SNAPSHOT].map((url) =>
      fetch(url, { cache: "no-store", credentials: "same-origin" }),
    ),
  );
  if (denied(home) || denied(workspace)) {
    await caches.delete(PRIVATE + session);
    return;
  }
  if (
    !home.ok ||
    !workspace.ok ||
    home.redirected ||
    workspace.headers.get("X-Offline-Scope") !== session ||
    (await scope()) !== session
  )
    return;

  const data = await workspace.clone().json();
  const html = await home.clone().text();
  const assets = Array.from(
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

  const shared = await caches.open(STATIC);
  for (const path of new Set(assets)) {
    if (!(await shared.match(path))) await shared.add(path).catch(() => {});
  }
  if ((await scope()) !== session) return;
  const cache = await caches.open(PRIVATE + session);
  for (const path of new Set(pictures)) {
    if (await cache.match(path)) continue;
    const image = await fetch(path, { cache: "no-store" }).catch(() => null);
    if (image?.ok && image.headers.get("Content-Type")?.startsWith("image/")) {
      await cache.put(path, image);
    }
  }
  if ((await scope()) !== session) {
    await caches.delete(PRIVATE + session);
    return;
  }
  await Promise.all([cache.put("/", home), cache.put(SNAPSHOT, workspace)]);
}

async function fallback(path, page) {
  const session = await scope();
  if (!session || !(await caches.has(PRIVATE + session))) return;
  const cache = await caches.open(PRIVATE + session);
  if (!page) return cache.match(photo(path) ? path : SNAPSHOT);
  const home = await cache.match("/", { ignoreVary: true });
  if (!home) return;
  const headers = new Headers(home.headers);
  headers.delete("content-encoding");
  headers.delete("content-length");
  return new Response(home.body, { status: home.status, headers });
}

self.addEventListener("install", (event) =>
  event.waitUntil(self.skipWaiting()),
);
self.addEventListener("activate", (event) =>
  event.waitUntil(
    (async () => {
      await purge(await scope());
      await self.clients.claim();
    })(),
  ),
);
self.addEventListener("message", (event) => {
  if (event.data === "save-schedule") event.waitUntil(warm().catch(() => {}));
});
self.addEventListener("fetch", (event) => {
  const req = event.request,
    url = new URL(req.url),
    path = url.pathname;
  if (url.origin !== self.location.origin) return;
  if (
    /^\/(?:auth(?:\/|$)|register(?:\/|$)|link-account(?:\/|$)|(?:login|setup)\.html$)/.test(
      path,
    )
  ) {
    event.respondWith(
      (async () => {
        await purge();
        return fetch(req);
      })(),
    );
    return;
  }
  if (req.method !== "GET") return;
  if (asset(path)) {
    event.respondWith(
      (async () => {
        const shared = await caches.open(STATIC);
        const saved = await shared.match(req);
        if (saved) return saved;
        const response = await fetch(req);
        if (response.ok && !response.redirected)
          await shared.put(req, response.clone());
        return response;
      })(),
    );
    return;
  }
  const page = req.mode === "navigate" && participantPage(path);
  if (!page && !photo(path) && ![SNAPSHOT, "/api/workspace"].includes(path))
    return;
  event.respondWith(
    (async () => {
      try {
        const response = await fetch(req);
        if (denied(response)) await purge();
        else if (response.type === "error" || response.status >= 500)
          return (await fallback(path, page)) || response;
        return response;
      } catch (error) {
        const saved = await fallback(path, page);
        if (saved) return saved;
        throw error;
      }
    })(),
  );
});
