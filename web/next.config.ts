import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
import type { NextConfig } from "next";
if (process.env.NODE_ENV === "development") initOpenNextCloudflareForDev();
const config: NextConfig = {
  poweredByHeader: false,
  skipTrailingSlashRedirect: true,
};
export default config;
