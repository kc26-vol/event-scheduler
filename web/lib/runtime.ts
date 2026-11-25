import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { Bindings } from "./db";
import { handle } from "./api";

export function bindings(): Bindings {
  return getCloudflareContext().env as unknown as Bindings;
}
export function dispatch(req: Request) {
  return handle(
    req,
    bindings(),
    new URL(req.url).pathname
      .split("/")
      .filter(Boolean)
      .map(decodeURIComponent),
  );
}
