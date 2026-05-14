// Load root .env.local so we don't have to duplicate config in apps/web.
require("dotenv").config({ path: require("path").resolve(__dirname, "../../.env.local") });
require("dotenv").config({ path: require("path").resolve(__dirname, "../../.env") });

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@mimix/persona-types", "@mimix/personas", "@mimix/orchestrator"],
  env: {
    NEXT_PUBLIC_TREASURY_PUBKEY: process.env.TREASURY_PUBKEY,
    NEXT_PUBLIC_USDG_MINT: process.env.USDG_MINT,
    NEXT_PUBLIC_DEBUG_MODE: process.env.NEXT_PUBLIC_DEBUG_MODE,
    NEXT_PUBLIC_DEFAULT_TARGET_URL: process.env.NEXT_PUBLIC_DEFAULT_TARGET_URL,
  },
};
module.exports = nextConfig;
