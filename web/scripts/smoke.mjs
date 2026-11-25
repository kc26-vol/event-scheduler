// Run against an isolated local workerd instance. All writes use synthetic data.
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
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
let worker;
try {
  const migrated = spawnSync(
    wrangler,
    ["d1", "migrations", "apply", "DB", "--local", "--persist-to", state],
    { stdio: "inherit" },
  );
  assert.equal(migrated.status, 0);
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
      "SESSION_SECRET:smoke-only",
      "--var",
      "SETUP_TOKEN:smoke-setup",
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
        ...(body && !(body instanceof FormData)
          ? { "Content-Type": "application/json" }
          : {}),
      },
      body: body instanceof FormData ? body : JSON.stringify(body),
    });
    return response;
  }
  assert.equal((await call("/api/workspace")).status, 401);
  assert.equal(
    (
      await call("/auth/setup", "POST", {
        setup_token: "smoke-setup",
        login_password: "smoke-login",
        admin_password: "smoke-admin",
        app_title: "Smoke Event",
      })
    ).status,
    200,
  );
  const login = await call("/auth/verify", "POST", { password: "smoke-login" });
  assert.equal(login.status, 200);
  cookie = login.headers.get("set-cookie").split(";")[0];
  assert.match(await (await call("/schedule")).text(), /Smoke Event/);
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
      await page.goto(url + "/login.html");
      await page.locator("input[name=password]").fill("smoke-login");
      await page.getByRole("button", { name: "ログイン" }).click();
      await page.waitForURL(url + "/");
      await page
        .getByRole("heading", { name: "マイページ", exact: true })
        .waitFor();
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
          !!(await caches.match("/")),
        photo,
      );
      await context.setOffline(true);
      await page.goto(url + "/staff-detail");
      await page
        .getByRole("heading", { name: "スタッフ別担当", exact: true })
        .waitFor();
      await page
        .getByRole("option", { name: "Crew" })
        .waitFor({ state: "attached" });
      console.log(
        "Chrome login, timetable, session dialog and first offline staff-page visit passed.",
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
