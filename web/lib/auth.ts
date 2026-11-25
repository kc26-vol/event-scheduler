import { createHash, timingSafeEqual } from "node:crypto";

const digest = (value: string) => createHash("sha256").update(value).digest();
export const equal = (a: string, b: string) =>
  timingSafeEqual(digest(a), digest(b));

export async function setting(db: D1Database, key: string) {
  return (
    (await db
      .prepare("SELECT value FROM app_settings WHERE key=?")
      .bind(key)
      .first<string>("value")) ?? ""
  );
}
