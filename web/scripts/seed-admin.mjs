// Run after migrations and before publishing. INITIAL_ADMIN_EMAIL is a deployment input.
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { domainToASCII } from "node:url";

export const seedAdminSQL = `INSERT INTO login_accounts (email, role)
  SELECT ?, 'admin' WHERE NOT EXISTS (SELECT 1 FROM login_accounts)`;

export function normalizeInitialAdminEmail(value) {
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  const [local, domain, extra] = email.split("@");
  const labels =
    domain &&
    /^[\p{L}\p{M}\p{N}.-]+$/u.test(domain) &&
    domainToASCII(domain).split(".");
  if (
    extra !== undefined ||
    !local ||
    Buffer.byteLength(local) > 64 ||
    Buffer.byteLength(email) > 254 ||
    /[\s\x00-\x1f\x7f()<>,;:\\"\[\]]/u.test(email) ||
    local.startsWith(".") ||
    local.endsWith(".") ||
    local.includes("..") ||
    !labels ||
    labels.length < 2 ||
    !labels.every((label) => /^[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?$/i.test(label))
  )
    throw Error(
      "Set INITIAL_ADMIN_EMAIL to the first administrator's email address for this empty environment.",
    );
  return email;
}

async function seed(query, email) {
  if ((await query("SELECT id FROM login_accounts LIMIT 1", [])).results.length)
    return false;
  // A concurrent seed that won the race makes this write a no-op.
  const { meta } = await query(seedAdminSQL, [
    normalizeInitialAdminEmail(email),
  ]);
  return meta.changes === 1;
}

export function seedLocalAdmin(db, email) {
  return seed(
    (sql, params) =>
      db
        .prepare(sql)
        .bind(...params)
        .all(),
    email,
  );
}

export async function seedRemoteAdmin(config, token, email, request = fetch) {
  const account = config.account_id;
  const database = config.d1_databases?.find(
    (db) => db.binding === "DB",
  )?.database_id;
  if (
    !/^[a-f\d]{32}$/i.test(account || "") ||
    !/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(database || "") ||
    !token
  )
    throw Error(
      "Missing target account, D1 database ID or Cloudflare API token.",
    );
  const endpoint =
    "https://api.cloudflare.com/client/v4/accounts/" +
    account +
    "/d1/database/" +
    database +
    "/query";
  return seed(async (sql, params) => {
    const res = await request(endpoint, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sql, params }),
    });
    const payload = res.ok ? await res.json().catch(() => null) : null;
    if (!payload?.success || !payload.result?.[0]?.success)
      throw Error(
        "D1 administrator initialization failed (HTTP " + res.status + ").",
      );
    return payload.result[0];
  }, email);
}

async function main(args) {
  const email = process.env.INITIAL_ADMIN_EMAIL;
  let inserted;
  if (args[0] === "--remote" && args.length === 1) {
    const config = JSON.parse(
      await readFile(
        new URL("../wrangler.deploy.json", import.meta.url),
        "utf8",
      ),
    );
    inserted = await seedRemoteAdmin(
      config,
      process.env.CLOUDFLARE_API_TOKEN,
      email,
    );
  } else if (
    args[0] === "--local" &&
    (args.length === 1 || (args.length === 3 && args[1] === "--persist-to"))
  ) {
    const { getPlatformProxy } = await import("wrangler");
    // Wrangler's --persist-to appends v3. The lower-level proxy expects the versioned directory.
    const platform = await getPlatformProxy({
      configPath: "wrangler.json",
      remoteBindings: false,
      persist: args[2] ? { path: resolve(args[2], "v3") } : true,
    });
    try {
      inserted = await seedLocalAdmin(platform.env.DB, email);
    } finally {
      await platform.dispose();
    }
  } else
    throw Error(
      "Usage: node scripts/seed-admin.mjs --remote | --local [--persist-to directory]",
    );
  console.log(
    inserted
      ? "First administrator added to the registration list."
      : "Account directory already initialized.",
  );
}

if (import.meta.main)
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
