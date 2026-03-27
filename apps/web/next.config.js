/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import "./src/env.js";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import("next").NextConfig} */
const config = {
  reactStrictMode: true,

  // Workaround for next-auth@5.0.0-beta.25 + Next.js 15 module resolution
  // @see https://github.com/nextauthjs/next-auth/discussions/10058
  transpilePackages: ["next-auth", "@shortgen/remotion"],

  // Force single remotion instance to avoid "No video config found" (Player context lost when
  // @shortgen/remotion and @remotion/player resolve different remotion copies)
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      remotion: path.resolve(__dirname, "node_modules/remotion"),
    };
    return config;
  },
  experimental: {
    turbo: {
      resolveAlias: {
        // Relative path; Turbopack doesn't support absolute paths for resolveAlias
        remotion: "./node_modules/remotion",
      },
    },
  },

  // AWS SDK packages use Node.js-specific code; exclude from bundling
  serverExternalPackages: [
    "@aws-sdk/client-cloudwatch-logs",
    "jsdom",
    "youtube-transcript",
  ],

  /**
   * If you are using `appDir` then you must comment the below `i18n` config out.
   *
   * @see https://github.com/vercel/next.js/issues/41980
   */
  i18n: {
    locales: ["en"],
    defaultLocale: "en",
  },
};

export default config;
