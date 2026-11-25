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
const alias = "http://localhost:" + port;
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

async function verifyShiftPreferences(
  adminPage,
  staffPage,
  staffId,
  sessionId,
) {
  await adminPage.goto(url + "/settings");
  await adminPage.getByLabel("受付開始（日本時間）").fill("2000-01-01T09:00");
  await adminPage.getByLabel("受付終了（日本時間）").fill("2099-01-01T09:00");
  const [windowResponse] = await Promise.all([
    adminPage.waitForResponse(
      (res) =>
        res.url() === url + "/api/preference-window" &&
        res.request().method() === "PUT",
    ),
    adminPage.getByRole("button", { name: "受付期間を保存" }).click(),
  ]);
  assert.ok(windowResponse.ok());
  const savedWindow = await windowResponse.json();
  assert.equal(savedWindow.opensAt, "2000-01-01T00:00:00.000Z");
  assert.equal(savedWindow.closesAt, "2099-01-01T00:00:00.000Z");

  await staffPage.goto(url + "/");
  const preferences = staffPage.getByRole("region", { name: "シフト希望" });
  await preferences.getByRole("checkbox", { name: /Opening/ }).check();
  await preferences.getByRole("button", { name: "希望を保存" }).click();
  await preferences
    .getByText("希望を保存しました。", { exact: true })
    .waitFor();
  await staffPage.reload();
  await preferences
    .getByRole("checkbox", { name: /Opening/, checked: true })
    .waitFor();

  // Use second precision to cross the actual Worker deadline with the form open.
  const closesAt = new Date(Date.now() + 10000).toISOString();
  const closeWindow = await adminPage.request.put(
    url + "/api/preference-window",
    {
      headers: { Origin: url },
      data: { opensAt: savedWindow.opensAt, closesAt },
    },
  );
  assert.ok(closeWindow.ok());
  await staffPage.reload();
  await preferences
    .getByRole("checkbox", { name: /Opening/, checked: true })
    .uncheck();
  await preferences
    .getByText("受付を終了しました。", { exact: false })
    .waitFor();
  await preferences
    .getByRole("listitem")
    .filter({ hasText: "Opening" })
    .waitFor();
  await preferences
    .getByRole("alert")
    .filter({ hasText: "提出されていません" })
    .waitFor();
  assert.equal(
    await preferences.getByRole("button", { name: "希望を保存" }).count(),
    0,
  );

  await adminPage.goto(url + "/staffs");
  const crew = adminPage.getByRole("article").filter({ hasText: "Crew" });
  await crew.getByRole("button", { name: "希望・活動時間・配置制限" }).click();
  const editor = adminPage.getByRole("dialog");
  await editor.getByRole("heading", { name: "配置しないセッション" }).waitFor();
  await editor.getByRole("checkbox", { name: /Opening/ }).check();
  const endpoint = url + "/api/staffs/" + staffId + "/blocked-sessions";
  const [restriction] = await Promise.all([
    adminPage.waitForResponse(
      (res) => res.url() === endpoint && res.request().method() === "PUT",
    ),
    editor.getByRole("button", { name: "配置制限を保存" }).click(),
  ]);
  assert.equal(restriction.status(), 204);
  assert.deepEqual(
    (await (await adminPage.request.get(endpoint)).json()).sessionIds,
    [sessionId],
  );
  assert.equal((await staffPage.request.get(endpoint)).status(), 403);
  console.log(
    "Chrome verified preference entry, saved choices, the live deadline, and staff-specific exclusions.",
  );
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
      "--var",
      "DEVELOPMENT_ROLE_SWITCH:1",
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
  for (const path of [
    "/login?next=https://other.example",
    "/register",
    "/link-account/",
  ]) {
    const redirect = await fetch(alias + path, { redirect: "manual" });
    assert.equal(redirect.status, 307);
    assert.equal(redirect.headers.get("location"), url + path);
    assert.equal(redirect.headers.has("set-cookie"), false);
  }
  const aliasHealth = await fetch(alias + "/api/health", {
    redirect: "manual",
  });
  assert.equal(aliasHealth.status, 200);
  const signIn = await fetch(alias + "/");
  assert.equal(signIn.url, url + "/login");
  const start = await fetch(new URL("/auth/line-start", signIn.url), {
    method: "POST",
    headers: { Origin: url },
  });
  assert.equal(start.status, 200);
  assert.match(start.headers.get("set-cookie") ?? "", /(?:^|, )es_line=/);
  const authorization = new URL((await start.json()).url);
  assert.equal(
    authorization.searchParams.get("redirect_uri"),
    url + "/auth/line-callback",
  );
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
  const session = await entry.json();
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
      await page.goto(alias + "/");
      assert.equal(page.url(), url + "/login");
      await page.getByRole("button", { name: "LINE でログイン" }).waitFor();
      await page.goto(alias + "/register#token=" + "a".repeat(64));
      await page
        .getByRole("button", { name: "確認して登録を続ける" })
        .waitFor();
      assert.equal(page.url(), url + "/register");
      await page.goto(url + "/register");
      await page.locator('input[type="email"]').waitFor();
      const scope = {
        domain: new URL(url).hostname,
        path: "/",
        secure: true,
        sameSite: "Lax",
      };
      const adminContext = await browser.newContext();
      const adminPage = await adminContext.newPage();
      await adminContext.addCookies([
        { ...scope, name: "es_session", value: admin.token, httpOnly: true },
        { ...scope, name: "es_offline", value: admin.offline },
      ]);
      await adminPage.goto(url + "/accounts");
      await adminPage
        .getByRole("button", { name: "スタッフ表示に切り替える" })
        .click();
      await adminPage
        .getByRole("button", { name: "管理者表示に切り替える" })
        .waitFor();
      assert.equal(adminPage.url(), url + "/");
      assert.equal(await adminPage.locator('a[href="/accounts"]').count(), 0);
      assert.equal(
        (await adminContext.request.get(url + "/accounts")).status(),
        404,
      );
      await adminPage.goto(url + "/schedule#timetable");
      await adminPage
        .getByRole("button", { name: "管理者表示に切り替える" })
        .click();
      await adminPage.getByRole("link", { name: "アカウント管理" }).waitFor();
      assert.equal(adminPage.url(), url + "/schedule#timetable");
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
      await verifyShiftPreferences(adminPage, page, who.id, session.id);
      await adminContext.close();
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
