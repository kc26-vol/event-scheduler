// Resolve resource IDs inside the explicitly selected account before invoking Wrangler.
import { readFile, writeFile, appendFile } from "node:fs/promises";

function authBindings(env, defaultOrigin) {
  const {
    AUTH_EMAIL_FROM,
    FIREBASE_PROJECT_ID,
    FIREBASE_API_KEY,
    FIREBASE_AUTH_DOMAIN,
    LINE_CHANNEL_ID,
  } = env;
  if (!/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/u.test(AUTH_EMAIL_FROM || ""))
    throw Error(
      "Set AUTH_EMAIL_FROM to an address on your Cloudflare Email Sending domain.",
    );
  if (
    Boolean(FIREBASE_PROJECT_ID) !== Boolean(FIREBASE_API_KEY) ||
    (FIREBASE_AUTH_DOMAIN && !FIREBASE_PROJECT_ID)
  )
    throw Error(
      "Set both FIREBASE_PROJECT_ID and FIREBASE_API_KEY to enable Google.",
    );
  if (!FIREBASE_PROJECT_ID && !LINE_CHANNEL_ID)
    throw Error(
      "Configure a Google or LINE sign-in provider for this environment.",
    );
  const origin = new URL(env.APP_ORIGIN || defaultOrigin);
  if (
    origin.protocol !== "https:" ||
    origin.username ||
    origin.password ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash
  )
    throw Error(
      "APP_ORIGIN must be an HTTPS origin with no credentials, path, query or fragment.",
    );
  const vars = { APP_ORIGIN: origin.origin, AUTH_EMAIL_FROM };
  if (FIREBASE_PROJECT_ID)
    Object.assign(vars, {
      FIREBASE_PROJECT_ID,
      FIREBASE_API_KEY,
      FIREBASE_AUTH_DOMAIN:
        FIREBASE_AUTH_DOMAIN || FIREBASE_PROJECT_ID + ".firebaseapp.com",
    });
  if (LINE_CHANNEL_ID) Object.assign(vars, { LINE_CHANNEL_ID });
  return {
    vars,
    send_email: [
      { name: "MAILER", allowed_sender_addresses: [AUTH_EMAIL_FROM] },
    ],
  };
}

/** @param {Record<string, string | undefined> | null} auth */
export async function prepare(
  target,
  account,
  token,
  request = fetch,
  auth = null,
) {
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
  const workersUrl =
    "https://" + name + "." + domain.subdomain + ".workers.dev";
  if (auth) Object.assign(config, authBindings(auth, workersUrl));
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
    url: config.vars?.APP_ORIGIN || workersUrl,
  };
}

async function main() {
  const { config, url } = await prepare(
    process.argv[2],
    process.env.CLOUDFLARE_ACCOUNT_ID,
    process.env.CLOUDFLARE_API_TOKEN,
    fetch,
    process.argv[3] === "--storage-only" ? null : process.env,
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
