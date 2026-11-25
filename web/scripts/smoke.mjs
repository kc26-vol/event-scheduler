// Run against an isolated local workerd instance. All writes use synthetic data.
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { unzipSync } from "fflate";

const state = await mkdtemp(join(tmpdir(), "scheduler-smoke-"));
const wrangler = "./node_modules/.bin/wrangler";
const probe = createServer();
probe.listen(0, "127.0.0.1");
await once(probe, "listening");
const { port } = probe.address();
await new Promise((resolve) => probe.close(resolve));
const url = "http://127.0.0.1:" + port;
// Provision browser/API sessions directly in this isolated database. Provider
// redirects and email redemption are exercised in the account integration tests.
async function fixtureLogin(email) {
  const token = randomBytes(32).toString("hex");
  const hash = (value) => createHash("sha256").update(value).digest("hex");
  const file = join(state, "session.sql");
  assert.match(email, /^[a-z]+@example\.test$/);
  await writeFile(
    file,
    [
      "INSERT INTO login_identities(account_id, provider, subject) SELECT id,'line','fixture-' || id FROM login_accounts WHERE email='" +
        email +
        "';",
      "INSERT INTO login_sessions(account_id,token_hash,purpose,expires_at) SELECT id,'" +
        hash(token) +
        "','login',unixepoch()+3600 FROM login_accounts WHERE email='" +
        email +
        "';",
    ].join("\n"),
    { mode: 0o600 },
  );
  const seeded = spawnSync(
    wrangler,
    ["d1", "execute", "DB", "--local", "--persist-to", state, "--file", file],
    { stdio: "inherit" },
  );
  assert.equal(seeded.status, 0);
  return { token, offline: hash("offline:" + token) };
}
let worker;
try {
  const migrated = spawnSync(
    wrangler,
    ["d1", "migrations", "apply", "DB", "--local", "--persist-to", state],
    { stdio: "inherit" },
  );
  assert.equal(migrated.status, 0);
  const seed = spawnSync(
    process.execPath,
    ["scripts/seed-admin.mjs", "--local", "--persist-to", state],
    {
      env: { ...process.env, INITIAL_ADMIN_EMAIL: "admin@example.test" },
      stdio: "inherit",
    },
  );
  assert.equal(seed.status, 0);
  worker = spawn(
    wrangler,
    [
      "dev",
      "--local",
      "--ip",
      "127.0.0.1",
      "--port",
      String(port),
      "--persist-to",
      state,
      "--show-interactive-dev-session=false",
      "--var",
      "APP_ORIGIN:" + url,
      "--var",
      "LINE_CHANNEL_ID:smoke",
      "--var",
      "LINE_CHANNEL_SECRET:local-only",
      "--var",
      "FIREBASE_PROJECT_ID:smoke",
      "--var",
      "FIREBASE_API_KEY:local-only",
    ],
    { stdio: "inherit" },
  );
  for (let n = 0; n < 90; n++) {
    if (worker.exitCode !== null)
      throw Error("Local Worker exited: " + worker.exitCode);
    if ((await fetch(url + "/api/health").catch(() => null))?.ok) break;
    await delay(1000);
  }
  let cookie = "";
  async function call(path, method = "GET", body) {
    const response = await fetch(url + path, {
      method,
      redirect: "manual",
      headers: {
        cookie,
        ...(method === "GET" ? {} : { Origin: url }),
        ...(body && !(body instanceof FormData)
          ? { "Content-Type": "application/json" }
          : {}),
      },
      body: body instanceof FormData ? body : JSON.stringify(body),
    });
    return response;
  }
  assert.equal((await call("/api/workspace")).status, 401);
  const home = await call("/");
  assert.ok([302, 307].includes(home.status));
  assert.equal(new URL(home.headers.get("location"), url).pathname, "/login");
  const signIn = await call("/login");
  assert.equal(signIn.status, 200);
  const html = await signIn.text();
  assert.match(html, /LINE でログイン/);
  assert.match(html, /Google でログイン/);
  assert.doesNotMatch(html, /type="password"/);
  assert.equal((await call("/login.html")).status, 404);
  assert.equal((await call("/setup.html")).status, 404);
  assert.equal(
    (await call("/auth/verify", "POST", { password: "retired" })).status,
    404,
  );
  const foreign = await fetch(url + "/auth/register", {
    method: "POST",
    headers: { Origin: "https://other.example" },
  });
  assert.equal(foreign.status, 403);
  assert.equal(
    (await call("/auth/bootstrap", "POST", { email: "intruder@example.test" }))
      .status,
    404,
  );
  const admin = await fixtureLogin("admin@example.test");
  cookie = "es_session=" + admin.token + "; es_offline=" + admin.offline;
  const schedule = await call("/schedule");
  assert.equal(schedule.headers.get("x-frame-options"), "DENY");
  assert.match(await schedule.text(), /全体スケジュール/);
  const room = await (
    await call("/api/rooms", "POST", { name: "Hall", capacity: 60 })
  ).json();
  const entry = await call("/api/sessions", "POST", {
    title: "Opening",
    speaker: "Speaker",
    start_time: "2026-08-01T10:00",
    end_time: "2026-08-01T11:00",
    room_id: room.id,
  });
  assert.equal(entry.status, 201);
  const xlsx = await call("/api/export/excel");
  assert.equal(xlsx.status, 200);
  assert.ok(
    unzipSync(new Uint8Array(await xlsx.arrayBuffer()))["xl/workbook.xml"],
  );
  const zip = await call("/api/export/backup");
  assert.equal(zip.status, 200);
  assert.ok(unzipSync(new Uint8Array(await zip.arrayBuffer()))["data.json"]);
  const who = await (
    await call("/api/staffs", "POST", { name: "Crew", role: ["session"] })
  ).json();
  assert.equal(
    (
      await call("/api/accounts", "POST", {
        email: "crew@example.test",
        role: "staff",
        staff_id: who.id,
      })
    ).status,
    201,
  );
  const crew = await fixtureLogin("crew@example.test");
  const file = new FormData();
  file.set(
    "photo",
    new Blob([Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10)], {
      type: "image/png",
    }),
    "staff.png",
  );
  assert.equal(
    (await call("/api/staffs/" + who.id + "/photo", "POST", file)).status,
    200,
  );
  const roster = await (await call("/api/workspace")).json();
  const photo = roster.staffs.find((st) => st.id === who.id).photo;
  assert.equal((await call(photo)).status, 200);
  cookie = "";
  assert.equal((await call(photo)).status, 401);
  console.log(
    "Worker setup, schedule, D1 writes, Excel, ZIP and private R2 routes passed.",
  );
  if (process.env.CHROME_BIN) {
    const { chromium } = await import("playwright-core");
    const browser = await chromium.launch({
      executablePath: process.env.CHROME_BIN,
    });
    try {
      const context = await browser.newContext(),
        page = await context.newPage();
      await page.goto(url + "/register");
      await page.locator('input[type="email"]').waitFor();
      const scope = {
        domain: new URL(url).hostname,
        path: "/",
        secure: true,
        sameSite: "Lax",
      };
      await context.addCookies([
        {
          ...scope,
          name: "es_session",
          value: crew.token,
          httpOnly: true,
        },
        { ...scope, name: "es_offline", value: crew.offline },
      ]);
      await page.goto(url + "/");
      await page
        .getByRole("heading", { name: "マイページ", exact: true })
        .waitFor();
      assert.equal(await page.locator('a[href="/accounts"]').count(), 0);
      const guarded = await context.request.get(url + "/api/accounts");
      assert.equal(guarded.status(), 403);
      await page
        .getByRole("link", { name: "全体スケジュール", exact: true })
        .click();
      await page.getByRole("button", { name: /Opening/ }).click();
      await page.getByRole("dialog").waitFor();
      await page.keyboard.press("Escape");
      await page.waitForFunction(
        async (image) =>
          !!navigator.serviceWorker.controller &&
          !!(await caches.match(image)) &&
          !!(await caches.match("/")) &&
          !!(await caches.match("/api/offline")),
        photo,
      );
      assert.equal(
        await page.evaluate(
          async () => !!(await caches.match("/api/workspace")),
        ),
        false,
      );
      // Disconnect the origin itself so an unvisited URL can only render from the service worker.
      const stopped = once(worker, "exit");
      worker.kill("SIGTERM");
      await stopped;
      await assert.rejects(fetch(url + "/api/health"));
      const response = await page.goto(url + "/staff-detail");
      assert.equal(response?.fromServiceWorker(), true);
      await page
        .getByRole("heading", { name: "スタッフ別担当", exact: true })
        .waitFor();
      await page
        .getByRole("option", { name: "Crew" })
        .waitFor({ state: "attached" });
      console.log(
        "Chrome registration page, staff-only access, timetable and first offline staff-page visit passed.",
      );
    } finally {
      await browser.close();
    }
  }
} finally {
  if (worker && worker.exitCode === null && worker.signalCode === null) {
    const exited = once(worker, "exit");
    worker.kill("SIGTERM");
    await exited;
  }
  await rm(state, { recursive: true, force: true });
}
