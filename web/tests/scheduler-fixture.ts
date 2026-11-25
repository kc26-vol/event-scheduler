import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import type { TestContext } from "node:test";
import { getPlatformProxy, unstable_splitSqlQuery } from "wrangler";
import { handle } from "../lib/api";
import type { Bindings } from "../lib/db";

export const origin = "https://scheduler.test";

export async function scheduler(t: TestContext) {
  const platform = await getPlatformProxy<Bindings>({
    configPath: "wrangler.json",
    persist: false,
    remoteBindings: false,
  });
  t.after(() => platform.dispose());
  const env = {
    ...platform.env,
    APP_ORIGIN: origin,
  };
  for (const file of readdirSync("migrations").sort()) {
    const statements = unstable_splitSqlQuery(
      readFileSync("migrations/" + file, "utf8"),
    );
    await env.DB.batch(statements.map((sql) => env.DB.prepare(sql)));
  }
  return env;
}

export function request(
  env: Bindings,
  path: string,
  method = "GET",
  body?: unknown,
  cookie = "",
): Promise<Response> {
  const url = new URL(path, origin);
  return handle(
    new Request(url, {
      method,
      headers: { cookie, origin, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    env,
    url.pathname.split("/").filter(Boolean),
  );
}

// Represents a previously verified identity on this test's isolated D1 binding.
export async function loginFixture(db: D1Database, email: string) {
  const token = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const result = await db
    .prepare(
      "INSERT INTO login_sessions(token_hash,account_id,purpose,expires_at) SELECT ?,id,'login',unixepoch()+3600 FROM login_accounts WHERE email=?",
    )
    .bind(tokenHash, email)
    .run();
  assert.equal(result.meta.changes, 1);
  return "es_session=" + token;
}
