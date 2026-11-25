import test from "node:test";
import assert from "node:assert/strict";
import { prepare } from "../scripts/prepare-cloudflare.mjs";

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
    const result = await prepare(
      "staging",
      account,
      "test-token",
      request as typeof fetch,
    );
    assert.equal(result.config.account_id, account);
    assert.equal(result.config.d1_databases[0].database_id, uuid);
    assert.equal(result.config.r2_buckets[0].bucket_name, name + "-storage");
    assert.equal(result.url, "https://" + name + ".example.workers.dev");
  }
  assert.deepEqual(writes, ["/d1/database", "/r2/buckets"]);
  await assert.rejects(
    prepare("prod", account, "test", request as typeof fetch),
    /staging or production/,
  );
});
