import test from "node:test";
import assert from "node:assert/strict";
import { prepare } from "../scripts/prepare-cloudflare.mjs";
import { seedAdminSQL, seedRemoteAdmin } from "../scripts/seed-admin.mjs";

test("provision missing environment resources, then reuse their IDs on retry", async () => {
  const account = "a".repeat(32);
  const name = "event-scheduler-staging";
  const uuid = "00000000-0000-4000-8000-000000000021";
  let db = false,
    r2 = false;
  const writes: string[] = [];
  const request = async (url: string, options: RequestInit) => {
    assert.ok(
      url.startsWith(
        "https://api.cloudflare.com/client/v4/accounts/" + account + "/",
      ),
    );
    const path = new URL(url).pathname.split(account)[1];
    const response = (result: unknown) =>
      Response.json({ success: true, result });
    if (path === "/workers/subdomain")
      return response({ subdomain: "example" });
    if (options.method === "POST") {
      writes.push(path);
      if (path === "/d1/database") {
        db = true;
        return response({ uuid, name });
      }
      assert.equal(path, "/r2/buckets");
      r2 = true;
      return response({});
    }
    if (path === "/d1/database") return response(db ? [{ uuid, name }] : []);
    assert.equal(path, "/r2/buckets/" + name + "-storage");
    return r2
      ? response({ name: name + "-storage" })
      : Response.json({}, { status: 404 });
  };
  for (let attempt = 0; attempt < 2; attempt++) {
    const auth = attempt
      ? {
          AUTH_EMAIL_FROM: "staff@example.org",
          LINE_CHANNEL_ID: "1234",
          APP_ORIGIN: "https://event.example.org/",
        }
      : {
          AUTH_EMAIL_FROM: "staff@example.org",
          FIREBASE_PROJECT_ID: "my-staging",
          FIREBASE_API_KEY: "web-key",
        };
    const result = await prepare(
      "staging",
      account,
      "test-token",
      request as typeof fetch,
      auth,
    );
    assert.equal(result.config.account_id, account);
    assert.equal(result.config.d1_databases[0].database_id, uuid);
    assert.equal(result.config.r2_buckets[0].bucket_name, name + "-storage");
    assert.equal(
      result.url,
      attempt
        ? "https://event.example.org"
        : "https://" + name + ".example.workers.dev",
    );
    assert.equal(result.config.vars.APP_ORIGIN, result.url);
    assert.deepEqual(result.config.send_email, [
      { name: "MAILER", allowed_sender_addresses: ["staff@example.org"] },
    ]);
    assert.equal(
      result.config.vars.FIREBASE_AUTH_DOMAIN,
      attempt ? undefined : "my-staging.firebaseapp.com",
    );
    assert.equal(
      result.config.vars.LINE_CHANNEL_ID,
      attempt ? "1234" : undefined,
    );
  }
  assert.deepEqual(writes, ["/d1/database", "/r2/buckets"]);
  await assert.rejects(
    prepare("prod", account, "test", request as typeof fetch),
    /staging or production/,
  );
});

test("reject incomplete login settings before provisioning storage", async () => {
  const request = async (url: string) => {
    assert.ok(url.endsWith("/workers/subdomain"));
    return Response.json({ success: true, result: { subdomain: "example" } });
  };
  const run = (env: Record<string, string>) =>
    prepare("staging", "a".repeat(32), "token", request as typeof fetch, env);
  await assert.rejects(run({}), /AUTH_EMAIL_FROM/);
  const sender = { AUTH_EMAIL_FROM: "from@example.org" };
  await assert.rejects(run(sender), /Google or LINE/);
  await assert.rejects(
    run({ ...sender, FIREBASE_PROJECT_ID: "project" }),
    /FIREBASE_API_KEY/,
  );
  await assert.rejects(
    run({
      ...sender,
      LINE_CHANNEL_ID: "123",
      APP_ORIGIN: "https://example.org/path",
    }),
    /HTTPS origin/,
  );
});

test("deployment seeds the target D1 once with a bound, normalized address", async () => {
  const config = {
    account_id: "a".repeat(32),
    d1_databases: [
      { binding: "DB", database_id: "00000000-0000-4000-8000-000000000003" },
    ],
  };
  let exists = false;
  const request = async (url: string, options: RequestInit) => {
    assert.equal(
      url,
      "https://api.cloudflare.com/client/v4/accounts/" +
        config.account_id +
        "/d1/database/" +
        config.d1_databases[0].database_id +
        "/query",
    );
    const { sql, params } = JSON.parse(String(options.body));
    if (sql === seedAdminSQL) {
      assert.equal(exists, false);
      assert.deepEqual(params, ["shion+test@example.org"]);
      exists = true;
      return Response.json({
        success: true,
        result: [{ success: true, meta: { changes: 1 } }],
      });
    }
    assert.deepEqual(params, []);
    return Response.json({
      success: true,
      result: [{ success: true, results: exists ? [{ id: 1 }] : [] }],
    });
  };
  await assert.rejects(
    seedRemoteAdmin(config, "token", "a@@b.org", request as typeof fetch),
    /INITIAL_ADMIN_EMAIL/,
  );
  assert.equal(
    await seedRemoteAdmin(
      config,
      "token",
      "  Shion+test@Example.org ",
      request as typeof fetch,
    ),
    true,
  );
  assert.equal(
    await seedRemoteAdmin(config, "token", undefined, request as typeof fetch),
    false,
  );
  assert.equal(
    await seedRemoteAdmin(
      config,
      "token",
      "other@example.org",
      request as typeof fetch,
    ),
    false,
  );
});
