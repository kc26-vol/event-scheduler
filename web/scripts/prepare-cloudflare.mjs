// Resolve resource IDs inside the explicitly selected account before invoking Wrangler.
import { readFile, writeFile, appendFile } from "node:fs/promises";

export async function prepare(target, account, token, request = fetch) {
  if (!["staging", "production"].includes(target))
    throw Error("Expected staging or production.");
  if (!/^[a-f0-9]{32}$/i.test(account || "") || !token)
    throw Error(
      "Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN for this environment.",
    );
  const api = async (path, body, allowMissing = false) => {
    const response = await request(
      "https://api.cloudflare.com/client/v4/accounts/" + account + path,
      {
        method: body ? "POST" : "GET",
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json",
        },
        body: body && JSON.stringify(body),
      },
    );
    if (allowMissing && response.status === 404) return null;
    const data = await response.json();
    if (!response.ok || !data.success)
      throw Error(
        path +
          " HTTP " +
          response.status +
          ": " +
          (data.errors || []).map((e) => e.message).join(", "),
      );
    return data.result;
  };
  const name = "event-scheduler-" + target;
  const config = JSON.parse(
    await readFile(new URL("../wrangler.json", import.meta.url)),
  );
  const domain = await api("/workers/subdomain");
  if (!domain?.subdomain)
    throw Error(
      "Register a workers.dev subdomain in the selected Cloudflare account.",
    );
  const databases = await api("/d1/database?name=" + name);
  const db =
    databases.find((db) => db.name === name) ||
    (await api("/d1/database", { name }));
  if (!/^[0-9a-f-]{36}$/i.test(db.uuid || ""))
    throw Error("Missing D1 database ID");
  const bucketName = name + "-storage";
  if (!(await api("/r2/buckets/" + bucketName, undefined, true)))
    await api("/r2/buckets", { name: bucketName });
  config.name = name;
  config.account_id = account;
  config.workers_dev = true;
  config.d1_databases[0].database_name = name;
  config.d1_databases[0].database_id = db.uuid;
  config.r2_buckets[0].bucket_name = bucketName;
  return {
    config,
    url: "https://" + name + "." + domain.subdomain + ".workers.dev",
  };
}

async function main() {
  const { config, url } = await prepare(
    process.argv[2],
    process.env.CLOUDFLARE_ACCOUNT_ID,
    process.env.CLOUDFLARE_API_TOKEN,
  );
  await writeFile(
    new URL("../wrangler.deploy.json", import.meta.url),
    JSON.stringify(config, null, 2) + "\n",
  );
  if (process.env.GITHUB_OUTPUT)
    await appendFile(process.env.GITHUB_OUTPUT, "url=" + url + "\n");
  console.log(config.name + " → " + url);
}

if (import.meta.main)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
